use starter::models::{Direction, Player};

pub const TILE_EMPTY: u8 = 0;
pub const TILE_GOLD: u8 = 1;
pub const TILE_MINE: u8 = 2;

const GRID_MAX: u8 = 9;
const START_HEALTH: u8 = 100;
const WIN_GOLD: u32 = 100;
const GOLD_REWARD: u32 = 10;
const MINE_DAMAGE: u8 = 10;

// Layer 1: deterministic check for whether a tile has content.
// hash(player, level, x, y) — 20% has content, 80% empty.
pub fn has_content(player: starknet::ContractAddress, level: u32, x: u8, y: u8) -> bool {
    let hash = core::poseidon::poseidon_hash_span(
        [player.into(), level.into(), x.into(), y.into()].span(),
    );
    let bucket: u256 = hash.into() & 0xff;
    let b: u8 = bucket.try_into().unwrap();
    b < 51 // 51/256 ≈ 20%
}

// Layer 2: called at dig time. Uses block timestamp + position for per-tile entropy.
// Gold chance decreases with level: L1=90%, L2=80%, ... L9+=10%.
pub fn dig_outcome(
    player: starknet::ContractAddress, x: u8, y: u8, timestamp: u64, level: u32,
) -> u8 {
    let hash = core::poseidon::poseidon_hash_span(
        [player.into(), x.into(), y.into(), timestamp.into()].span(),
    );
    let b: u256 = hash.into() % 10;
    let capped: u32 = if level > 9 { 9 } else { level };
    // Level 1: b < 9 → 90%, Level 2: b < 8 → 80%, ... Level 9: b < 1 → 10%
    if b < (10 - capped).into() { TILE_GOLD } else { TILE_MINE }
}

fn is_dug(dug: felt252, x: u8, y: u8) -> bool {
    let idx: u8 = y * 10 + x;
    let d: u256 = dug.into();
    (d / pow2(idx)) % 2 == 1
}

fn set_dug(dug: felt252, x: u8, y: u8) -> felt252 {
    let idx: u8 = y * 10 + x;
    let d: u256 = dug.into();
    let mask: u256 = pow2(idx);
    (d | mask).try_into().unwrap()
}

fn pow2(n: u8) -> u256 {
    let mut result: u256 = 1;
    let mut i: u8 = 0;
    while i < n {
        result = result * 2;
        i += 1;
    };
    result
}

fn next_position(x: u8, y: u8, direction: Direction) -> (u8, u8) {
    match direction {
        Direction::Left => (if x > 0 { x - 1 } else { 0 }, y),
        Direction::Right => (if x < GRID_MAX { x + 1 } else { GRID_MAX }, y),
        Direction::Up => (x, if y < GRID_MAX { y + 1 } else { GRID_MAX }),
        Direction::Down => (x, if y > 0 { y - 1 } else { 0 }),
    }
}

#[starknet::interface]
pub trait IActions<T> {
    fn spawn(ref self: T);
    fn move(ref self: T, direction: Direction);
    fn dig(ref self: T);
}

#[dojo::contract]
pub mod actions {
    use super::{
        IActions, Direction, Player, next_position, has_content, dig_outcome, is_dug, set_dug,
        TILE_GOLD, START_HEALTH, WIN_GOLD, GOLD_REWARD, MINE_DAMAGE,
    };
    use starknet::{get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct Moved {
        #[key]
        pub player: starknet::ContractAddress,
        pub direction: Direction,
        pub x: u8,
        pub y: u8,
        pub health: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct Dug {
        #[key]
        pub player: starknet::ContractAddress,
        pub x: u8,
        pub y: u8,
        pub tile: u8,
        pub gold: u32,
        pub health: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct LevelUp {
        #[key]
        pub player: starknet::ContractAddress,
        pub level: u32,
        pub gold: u32,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct GameOver {
        #[key]
        pub player: starknet::ContractAddress,
        pub level: u32,
    }

    #[abi(embed_v0)]
    impl ActionsImpl of IActions<ContractState> {
        fn spawn(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let existing: Player = world.read_model(player);
            world
                .write_model(
                    @Player {
                        player,
                        x: 0,
                        y: 0,
                        health: START_HEALTH,
                        gold: 0,
                        level: 1,
                        dug: 0,
                        best: existing.best,
                    },
                );
        }

        fn move(ref self: ContractState, direction: Direction) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let mut p: Player = world.read_model(player);
            assert!(p.health > 0, "game over");

            let (nx, ny) = next_position(p.x, p.y, direction);
            p.x = nx;
            p.y = ny;
            p.health = if p.health > 1 { p.health - 1 } else { 0 };

            world.write_model(@p);
            world.emit_event(@Moved { player, direction, x: p.x, y: p.y, health: p.health });

            if p.health == 0 {
                world.emit_event(@GameOver { player, level: p.level });
            }
        }

        fn dig(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let mut p: Player = world.read_model(player);
            assert!(p.health > 0, "game over");
            assert!(has_content(player, p.level, p.x, p.y), "nothing here");
            assert!(!is_dug(p.dug, p.x, p.y), "already dug");

            p.dug = set_dug(p.dug, p.x, p.y);

            let t = dig_outcome(player, p.x, p.y, get_block_timestamp(), p.level);
            if t == TILE_GOLD {
                p.gold += GOLD_REWARD;
                if p.gold > p.best {
                    p.best = p.gold;
                }
            } else {
                p.health = if p.health > MINE_DAMAGE { p.health - MINE_DAMAGE } else { 0 };
            }

            world.write_model(@p);
            world
                .emit_event(
                    @Dug { player, x: p.x, y: p.y, tile: t, gold: p.gold, health: p.health },
                );

            if p.health == 0 {
                world.emit_event(@GameOver { player, level: p.level });
                return;
            }

            if p.gold >= p.level * WIN_GOLD {
                p.level += 1;
                p.health = START_HEALTH;
                p.x = 0;
                p.y = 0;
                p.dug = 0;
                world.write_model(@p);
                world.emit_event(@LevelUp { player, level: p.level, gold: p.gold });
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"starter")
        }
    }
}
