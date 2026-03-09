// -- Contagion Models --
// On-chain state for the social deduction infection game.

use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ContagionPlayer {
    #[key]
    pub player: ContractAddress,
    pub room_id: felt252,
    pub x: u16,
    pub y: u16,
    pub is_infected: bool,
    pub health: u16,
    pub score: u32,
    pub cure_fragments: u8,
    pub is_alive: bool,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameRoom {
    #[key]
    pub room_id: felt252,
    pub host: ContractAddress,
    pub patient_zero_hash: felt252, // Poseidon hash of patient zero address — hidden until reveal
    pub player_count: u8,
    pub max_players: u8,
    pub started: bool,
    pub ended: bool,
    pub infection_radius: u16,
    pub map_size: u16,
    pub cure_target: u8, // fragments needed to win
}
