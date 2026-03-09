// -- Contagion Systems --
// On-chain game logic: proximity-based infection, movement validation,
// accusation, cure collection. Each fn is a transaction entry point.

use contagion::models::{ContagionPlayer, GameRoom};

const MAX_MOVE_DISTANCE: u16 = 5;
const INFECTION_DAMAGE: u16 = 10;
const CURE_SCORE: u32 = 100;
const INFECT_SCORE: u32 = 50;
const WIN_BONUS: u32 = 500;
const DEFAULT_HEALTH: u16 = 100;

#[starknet::interface]
pub trait IContagionActions<T> {
    fn create_room(
        ref self: T,
        room_id: felt252,
        map_size: u16,
        infection_radius: u16,
        max_players: u8,
        cure_target: u8,
    );
    fn join_room(ref self: T, room_id: felt252, x: u16, y: u16);
    fn start_game(ref self: T, room_id: felt252, patient_zero_hash: felt252);
    fn move_player(ref self: T, room_id: felt252, new_x: u16, new_y: u16);
    fn infect(ref self: T, room_id: felt252, target: starknet::ContractAddress);
    fn accuse(ref self: T, room_id: felt252, target: starknet::ContractAddress);
    fn collect_cure(ref self: T, room_id: felt252);
    fn take_damage(ref self: T, room_id: felt252, amount: u16);
}

#[dojo::contract]
pub mod contagion_actions {
    use super::{
        IContagionActions, ContagionPlayer, GameRoom, MAX_MOVE_DISTANCE, INFECTION_DAMAGE,
        CURE_SCORE, INFECT_SCORE, WIN_BONUS, DEFAULT_HEALTH,
    };
    use starknet::{ContractAddress, get_caller_address, contract_address_const};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct PlayerJoined {
        #[key]
        pub player: ContractAddress,
        pub room_id: felt252,
        pub x: u16,
        pub y: u16,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct PlayerMoved {
        #[key]
        pub player: ContractAddress,
        pub room_id: felt252,
        pub x: u16,
        pub y: u16,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct Infected {
        #[key]
        pub target: ContractAddress,
        pub source: ContractAddress,
        pub room_id: felt252,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct Accused {
        #[key]
        pub accuser: ContractAddress,
        pub target: ContractAddress,
        pub room_id: felt252,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct CureCollected {
        #[key]
        pub player: ContractAddress,
        pub room_id: felt252,
        pub total_fragments: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct PlayerDied {
        #[key]
        pub player: ContractAddress,
        pub room_id: felt252,
    }

    #[abi(embed_v0)]
    impl ContagionActionsImpl of IContagionActions<ContractState> {
        fn create_room(
            ref self: ContractState,
            room_id: felt252,
            map_size: u16,
            infection_radius: u16,
            max_players: u8,
            cure_target: u8,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.host == contract_address_const::<0>(), "room already exists");

            world
                .write_model(
                    @GameRoom {
                        room_id,
                        host: caller,
                        patient_zero_hash: 0,
                        player_count: 0,
                        max_players,
                        started: false,
                        ended: false,
                        infection_radius,
                        map_size,
                        cure_target,
                    },
                );
        }

        fn join_room(ref self: ContractState, room_id: felt252, x: u16, y: u16) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut room: GameRoom = world.read_model(room_id);
            assert!(!room.started, "game already started");
            assert!(room.player_count < room.max_players, "room full");
            assert!(x < room.map_size && y < room.map_size, "out of bounds");

            room.player_count += 1;
            world.write_model(@room);

            world
                .write_model(
                    @ContagionPlayer {
                        player: caller,
                        room_id,
                        x,
                        y,
                        is_infected: false,
                        health: DEFAULT_HEALTH,
                        score: 0,
                        cure_fragments: 0,
                        is_alive: true,
                    },
                );

            world.emit_event(@PlayerJoined { player: caller, room_id, x, y });
        }

        fn start_game(ref self: ContractState, room_id: felt252, patient_zero_hash: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut room: GameRoom = world.read_model(room_id);
            assert!(room.host == caller, "only host can start");
            assert!(!room.started, "already started");
            assert!(room.player_count >= 2, "need at least 2 players");

            room.started = true;
            room.patient_zero_hash = patient_zero_hash;
            world.write_model(@room);
        }

        fn move_player(ref self: ContractState, room_id: felt252, new_x: u16, new_y: u16) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.started && !room.ended, "game not active");

            let mut player: ContagionPlayer = world.read_model(caller);
            assert!(player.is_alive, "dead players cannot move");
            assert!(player.room_id == room_id, "not in this room");
            assert!(new_x < room.map_size && new_y < room.map_size, "out of bounds");

            // Validate movement distance
            let dx = if new_x > player.x {
                new_x - player.x
            } else {
                player.x - new_x
            };
            let dy = if new_y > player.y {
                new_y - player.y
            } else {
                player.y - new_y
            };
            assert!(dx <= MAX_MOVE_DISTANCE && dy <= MAX_MOVE_DISTANCE, "move too far");

            player.x = new_x;
            player.y = new_y;
            world.write_model(@player);

            world.emit_event(@PlayerMoved { player: caller, room_id, x: new_x, y: new_y });
        }

        /// Patient Zero or infected player spreads infection to a nearby target.
        /// Validates: caller is infected, target is alive and nearby, distance <= infection_radius.
        fn infect(ref self: ContractState, room_id: felt252, target: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.started && !room.ended, "game not active");

            let mut attacker: ContagionPlayer = world.read_model(caller);
            assert!(attacker.is_infected, "only infected players can spread");
            assert!(attacker.is_alive, "dead");
            assert!(attacker.room_id == room_id, "not in this room");

            let mut target_player: ContagionPlayer = world.read_model(target);
            assert!(target_player.room_id == room_id, "target not in same room");
            assert!(target_player.is_alive, "target already dead");
            assert!(!target_player.is_infected, "target already infected");

            // Proximity check: squared distance must be within infection radius
            let dx: u32 = if target_player.x > attacker.x {
                (target_player.x - attacker.x).into()
            } else {
                (attacker.x - target_player.x).into()
            };
            let dy: u32 = if target_player.y > attacker.y {
                (target_player.y - attacker.y).into()
            } else {
                (attacker.y - target_player.y).into()
            };
            let dist_sq: u32 = (dx * dx) + (dy * dy);
            let radius: u32 = room.infection_radius.into();
            let radius_sq: u32 = radius * radius;
            assert!(dist_sq <= radius_sq, "too far to infect");

            // Spread infection and deal damage
            target_player.is_infected = true;
            if INFECTION_DAMAGE >= target_player.health {
                target_player.health = 0;
                target_player.is_alive = false;
                world.write_model(@target_player);
                world.emit_event(@PlayerDied { player: target, room_id });
            } else {
                target_player.health -= INFECTION_DAMAGE;
                world.write_model(@target_player);
            }

            // Score for the attacker
            attacker.score += INFECT_SCORE;
            world.write_model(@attacker);

            world.emit_event(@Infected { target, source: caller, room_id });
        }

        /// Accuse another player of being Patient Zero.
        /// Validates: both players alive, in same room, no self-accusation.
        fn accuse(ref self: ContractState, room_id: felt252, target: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.started && !room.ended, "game not active");

            let accuser: ContagionPlayer = world.read_model(caller);
            assert!(accuser.is_alive, "dead players cannot accuse");
            assert!(accuser.room_id == room_id, "not in this room");
            assert!(caller != target, "cannot accuse yourself");

            let accused: ContagionPlayer = world.read_model(target);
            assert!(accused.room_id == room_id, "target not in room");
            assert!(accused.is_alive, "target already dead");

            world.emit_event(@Accused { accuser: caller, target, room_id });
        }

        /// Collect a cure fragment. Only healthy players can collect.
        /// Reaching cure_target fragments wins the game for the collector.
        fn collect_cure(ref self: ContractState, room_id: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.started && !room.ended, "game not active");

            let mut player: ContagionPlayer = world.read_model(caller);
            assert!(player.is_alive, "dead");
            assert!(player.room_id == room_id, "not in this room");
            assert!(!player.is_infected, "infected players cannot collect cures");

            player.cure_fragments += 1;
            player.score += CURE_SCORE;

            // Win condition: collected enough cure fragments
            if player.cure_fragments >= room.cure_target {
                player.score += WIN_BONUS;
            }

            world.write_model(@player);

            world
                .emit_event(
                    @CureCollected {
                        player: caller, room_id, total_fragments: player.cure_fragments,
                    },
                );
        }

        /// Record damage from mob waves or environmental hazards.
        /// Kills the player if health reaches zero.
        fn take_damage(ref self: ContractState, room_id: felt252, amount: u16) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let room: GameRoom = world.read_model(room_id);
            assert!(room.started && !room.ended, "game not active");

            let mut player: ContagionPlayer = world.read_model(caller);
            assert!(player.is_alive, "already dead");
            assert!(player.room_id == room_id, "not in this room");

            if amount >= player.health {
                player.health = 0;
                player.is_alive = false;
                world.write_model(@player);
                world.emit_event(@PlayerDied { player: caller, room_id });
            } else {
                player.health -= amount;
                world.write_model(@player);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"contagion")
        }
    }
}
