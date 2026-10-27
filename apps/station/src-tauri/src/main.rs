// Без консольного окна рядом с экраном Zen в сборке для клубов.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `--guard` — так Zen стоит в Windows вместо рабочего стола; см. kiosk::run_guard.
    if std::env::args().any(|arg| arg == "--guard") {
        zen_station_lib::run_guard();
        return;
    }
    zen_station_lib::run()
}
