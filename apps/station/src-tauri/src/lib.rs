mod games;
mod kiosk;
mod vdf;

use games::InstalledGame;
use std::sync::atomic::Ordering;
use tauri::WindowEvent;

pub use kiosk::run_guard;

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
        .invoke_handler(tauri::generate_handler![list_games, launch_game, clean_up, set_locked, restart_computer, admin_exit])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Zen");
}
