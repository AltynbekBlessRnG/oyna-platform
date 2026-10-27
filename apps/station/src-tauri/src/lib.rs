mod config;
mod games;
mod install;
mod kiosk;
mod update;
mod vdf;

use games::InstalledGame;
use std::sync::atomic::Ordering;
use tauri::WindowEvent;

pub use install::{install, uninstall};
pub use kiosk::run_guard;
pub use update::run as run_update;

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

/// Свободный компьютер: Zen поверх всего и системные клавиши закрыты.
/// Во время сессии окно отпускаем, чтобы игра могла выйти на передний план.
#[tauri::command]
fn set_locked(window: tauri::WebviewWindow, locked: bool) {
    kiosk::LOCKED.store(locked, Ordering::Relaxed);
    let _ = window.set_always_on_top(locked);
    if locked {
        let _ = window.set_focus();
    }
}

/// Сессия кончилась: перезагружаемся, и «заморозка» клуба (Shadow Defender, Deep Freeze и т. п.)
/// возвращает компьютер в чистое состояние для следующего игрока. Только под гостем:
/// компьютер админа, на котором Zen открыли для проверки, перезагружать нельзя.
#[tauri::command]
fn restart_computer() -> Result<(), String> {
    kiosk::restart_if_guest()
}

/// Настройки компьютера: общие для всех пользователей Windows, так что сброс гостевого профиля
/// не заставляет подключать компьютер заново. Гость пишет их при подключении по коду клуба.
fn config_path() -> std::path::PathBuf {
    config::station_dir().join("station.json")
}

#[tauri::command]
fn load_config() -> Option<String> {
    std::fs::read_to_string(config_path()).ok().or_else(|| std::fs::read_to_string(config::legacy_config_path()).ok())
}

#[tauri::command]
fn save_config(raw: String) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("Не удалось создать {}: {error}", dir.display()))?;
    }
    std::fs::write(&path, raw).map_err(|error| format!("Не удалось сохранить {}: {error}", path.display()))
}

#[tauri::command]
fn clear_config() {
    let _ = std::fs::remove_file(config_path());
}

#[tauri::command]
fn shutdown_computer() -> Result<(), String> {
    kiosk::shutdown_if_guest()
}

/// Сообщение из кабинета: поднимаем окно поверх игры. Игры в эксклюзивном полноэкранном
/// режиме Windows может не отдать — тогда сообщение появится, как только игрок свернёт игру.
#[tauri::command]
fn bring_to_front(window: tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
}

/// Админ ввёл PIN: закрываемся с особым кодом, сторож откроет обычную Windows.
#[tauri::command]
fn admin_exit(app: tauri::AppHandle) {
    app.exit(kiosk::ADMIN_EXIT_CODE);
}

pub fn run() {
    kiosk::install_keyboard_hook();
    tauri::Builder::default()
        .on_window_event(|_window, event| {
            // Alt+F4 и прочие попытки закрыть окно: выйти из Zen можно только через PIN админа.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![list_games, launch_game, clean_up, set_locked, restart_computer, shutdown_computer, bring_to_front, admin_exit, load_config, save_config, clear_config])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Zen");
}
