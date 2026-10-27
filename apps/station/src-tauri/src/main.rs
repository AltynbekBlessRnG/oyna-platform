// Без консольного окна рядом с экраном Zen в сборке для клубов.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zen_station_lib::run()
}
