mod games;
mod vdf;

use games::InstalledGame;

#[tauri::command]
fn list_games() -> Vec<InstalledGame> {
    games::detect()
}

#[tauri::command]
fn launch_game(game: InstalledGame) -> Result<(), String> {
    games::launch(&game)
}

/// Сессия закончилась. Пока только закрываем запущенные игры; выход из аккаунтов
/// лаунчеров и стирание данных входа — следующий шаг.
#[tauri::command]
fn clean_up() -> Result<(), String> {
    games::close_running();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_games, launch_game, clean_up])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Zen");
}
