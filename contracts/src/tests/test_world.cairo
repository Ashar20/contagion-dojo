#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::WorldStorageTrait;
    use dojo_snf_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };
    use snforge_std::{start_cheat_caller_address};
    use starknet::ContractAddress;

    use contagion::systems::actions::{
        IContagionActionsDispatcher, IContagionActionsDispatcherTrait,
    };
    use contagion::models::{ContagionPlayer, GameRoom};

    const HOST: felt252 = 'HOST';
    const PLAYER_A: felt252 = 'PLAYER_A';
    const PLAYER_B: felt252 = 'PLAYER_B';
    const ROOM_ID: felt252 = 'ROOM_1';

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "contagion",
            resources: [
                TestResource::Model("ContagionPlayer"),
                TestResource::Model("GameRoom"),
                TestResource::Event("PlayerJoined"),
                TestResource::Event("PlayerMoved"),
                TestResource::Event("Infected"),
                TestResource::Event("Accused"),
                TestResource::Event("CureCollected"),
                TestResource::Event("PlayerDied"),
                TestResource::Contract("contagion_actions"),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"contagion", @"contagion_actions")
                .with_writer_of([dojo::utils::bytearray_hash(@"contagion")].span()),
        ]
            .span()
    }

    fn addr(raw: felt252) -> ContractAddress {
        raw.try_into().unwrap()
    }

    fn setup() -> (dojo::world::WorldStorage, IContagionActionsDispatcher) {
        let ndef = namespace_def();
        let mut world = spawn_test_world([ndef].span());
        world.sync_perms_and_inits(contract_defs());
        let (contract_address, _) = world.dns(@"contagion_actions").unwrap();
        let actions = IContagionActionsDispatcher { contract_address };
        (world, actions)
    }

    fn setup_room(
        world: @dojo::world::WorldStorage, actions: @IContagionActionsDispatcher,
    ) -> felt252 {
        let contract_address = *actions.contract_address;
        start_cheat_caller_address(contract_address, addr(HOST));
        (*actions).create_room(ROOM_ID, 200, 3, 10, 5);
        ROOM_ID
    }

    #[test]
    fn test_create_room() {
        let (world, actions) = setup();
        let contract_address = actions.contract_address;
        start_cheat_caller_address(contract_address, addr(HOST));
        actions.create_room(ROOM_ID, 200, 3, 10, 5);

        let room: GameRoom = world.read_model(ROOM_ID);
        assert!(room.host == addr(HOST), "host should be set");
        assert!(room.map_size == 200, "map_size should be 200");
        assert!(room.infection_radius == 3, "infection_radius should be 3");
        assert!(room.max_players == 10, "max_players should be 10");
        assert!(room.cure_target == 5, "cure_target should be 5");
        assert!(!room.started, "should not be started");
    }

    #[test]
    fn test_join_room() {
        let (world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.room_id == room_id, "should be in room");
        assert!(player.x == 100 && player.y == 100, "position");
        assert!(player.health == 100, "health");
        assert!(player.is_alive, "alive");
        assert!(!player.is_infected, "not infected");

        let room: GameRoom = world.read_model(room_id);
        assert!(room.player_count == 1, "player_count should be 1");
    }

    #[test]
    #[should_panic(expected: "out of bounds")]
    fn test_join_room_out_of_bounds() {
        let (world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 250, 100); // map_size is 200
    }

    #[test]
    fn test_start_game() {
        let (world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        // Two players join
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        // Host starts the game
        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        let room: GameRoom = world.read_model(room_id);
        assert!(room.started, "should be started");
        assert!(room.patient_zero_hash == 'pz_hash', "hash should be set");
    }

    #[test]
    #[should_panic(expected: "only host can start")]
    fn test_start_game_not_host() {
        let (world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        // Non-host tries to start
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.start_game(room_id, 'pz_hash');
    }

    #[test]
    #[should_panic(expected: "need at least 2 players")]
    fn test_start_game_not_enough_players() {
        let (world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');
    }

    #[test]
    fn test_move_player() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.move_player(room_id, 103, 102);

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.x == 103 && player.y == 102, "should have moved");
    }

    #[test]
    #[should_panic(expected: "move too far")]
    fn test_move_too_far() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.move_player(room_id, 110, 100); // 10 tiles away, max is 5
    }

    #[test]
    #[should_panic(expected: "dead players cannot move")]
    fn test_move_when_dead() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Kill the player
        world
            .write_model_test(
                @ContagionPlayer {
                    player: addr(PLAYER_A),
                    room_id,
                    x: 100,
                    y: 100,
                    is_infected: false,
                    health: 0,
                    score: 0,
                    cure_fragments: 0,
                    is_alive: false,
                },
            );

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.move_player(room_id, 101, 100);
    }

    #[test]
    fn test_infect_nearby_player() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 102, 101); // within radius 3

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Make PLAYER_A infected (patient zero)
        world
            .write_model_test(
                @ContagionPlayer {
                    player: addr(PLAYER_A),
                    room_id,
                    x: 100,
                    y: 100,
                    is_infected: true,
                    health: 100,
                    score: 0,
                    cure_fragments: 0,
                    is_alive: true,
                },
            );

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.infect(room_id, addr(PLAYER_B));

        let target: ContagionPlayer = world.read_model(addr(PLAYER_B));
        assert!(target.is_infected, "target should be infected");
        assert!(target.health == 90, "target should take infection damage");

        let attacker: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(attacker.score == 50, "attacker should get infect score");
    }

    #[test]
    #[should_panic(expected: "too far to infect")]
    fn test_infect_too_far() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 110, 110); // way too far

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Make PLAYER_A infected
        world
            .write_model_test(
                @ContagionPlayer {
                    player: addr(PLAYER_A),
                    room_id,
                    x: 100,
                    y: 100,
                    is_infected: true,
                    health: 100,
                    score: 0,
                    cure_fragments: 0,
                    is_alive: true,
                },
            );

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.infect(room_id, addr(PLAYER_B));
    }

    #[test]
    #[should_panic(expected: "only infected players can spread")]
    fn test_infect_not_infected() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 101, 100);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // PLAYER_A is NOT infected, tries to infect
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.infect(room_id, addr(PLAYER_B));
    }

    #[test]
    fn test_accuse() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Player A accuses Player B
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.accuse(room_id, addr(PLAYER_B));
        // No panic = success. Event emitted.
    }

    #[test]
    #[should_panic(expected: "cannot accuse yourself")]
    fn test_accuse_self() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.accuse(room_id, addr(PLAYER_A));
    }

    #[test]
    fn test_collect_cure() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.collect_cure(room_id);

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.cure_fragments == 1, "should have 1 fragment");
        assert!(player.score == 100, "should have cure score");
    }

    #[test]
    #[should_panic(expected: "infected players cannot collect cures")]
    fn test_collect_cure_while_infected() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Make player infected
        world
            .write_model_test(
                @ContagionPlayer {
                    player: addr(PLAYER_A),
                    room_id,
                    x: 100,
                    y: 100,
                    is_infected: true,
                    health: 100,
                    score: 0,
                    cure_fragments: 0,
                    is_alive: true,
                },
            );

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.collect_cure(room_id);
    }

    #[test]
    fn test_collect_cure_win_condition() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        // Give player 4 fragments (cure_target is 5)
        world
            .write_model_test(
                @ContagionPlayer {
                    player: addr(PLAYER_A),
                    room_id,
                    x: 100,
                    y: 100,
                    is_infected: false,
                    health: 100,
                    score: 400,
                    cure_fragments: 4,
                    is_alive: true,
                },
            );

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.collect_cure(room_id);

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.cure_fragments == 5, "should have 5 fragments");
        assert!(player.score == 400 + 100 + 500, "should have cure + win bonus");
    }

    #[test]
    fn test_take_damage() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.take_damage(room_id, 25);

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.health == 75, "health should be 75");
        assert!(player.is_alive, "should still be alive");
    }

    #[test]
    fn test_take_lethal_damage() {
        let (mut world, actions) = setup();
        let room_id = setup_room(@world, @actions);

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.join_room(room_id, 100, 100);
        start_cheat_caller_address(actions.contract_address, addr(PLAYER_B));
        actions.join_room(room_id, 50, 50);

        start_cheat_caller_address(actions.contract_address, addr(HOST));
        actions.start_game(room_id, 'pz_hash');

        start_cheat_caller_address(actions.contract_address, addr(PLAYER_A));
        actions.take_damage(room_id, 200); // more than health

        let player: ContagionPlayer = world.read_model(addr(PLAYER_A));
        assert!(player.health == 0, "health should be 0");
        assert!(!player.is_alive, "should be dead");
    }
}
