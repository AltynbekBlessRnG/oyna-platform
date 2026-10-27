// Без консольного окна рядом с экраном Zen в сборке для клубов.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let has = |flag: &str| std::env::args().any(|arg| arg == flag);
    let quiet = has("--quiet");
    // Тот же exe под именем Zen-Setup.exe — установщик: так админу достаточно одного файла.
    let named_setup = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|stem| stem.to_string_lossy().to_lowercase()))
        .is_some_and(|stem| stem.contains("setup"));

    if has("--guard") {
        zen_station_lib::run_guard();
    } else if has("--update") {
        zen_station_lib::run_update();
    } else if has("--uninstall") {
        zen_station_lib::uninstall(quiet);
    } else if has("--install") || named_setup {
        zen_station_lib::install(quiet);
    } else {
        zen_station_lib::run();
    }
}
