use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Player {
    #[key]
    pub player: ContractAddress,
    pub x: u8,
    pub y: u8,
    pub health: u8,
    pub gold: u32,
    pub level: u32,
    pub dug: felt252, // 100-bit bitmap, bit y*10+x = tile has been dug
    pub best: u32, // highest gold reached
}

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug)]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}
