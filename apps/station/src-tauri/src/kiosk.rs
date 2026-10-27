//! Чтобы мимо Zen нельзя было уйти в Windows: перехват системных клавиш и «сторож».
//!
//! Ctrl+Alt+Del перехватить нельзя никому — его закрывают политики Windows,
//! их ставит `windows/kiosk-setup.ps1`.

use std::sync::atomic::{AtomicBool, Ordering};

/// Компьютер свободен: Zen на экране блокировки и уходить с него некуда.
pub static LOCKED: AtomicBool = AtomicBool::new(true);

/// Код выхода, по которому сторож открывает обычную Windows вместо нового запуска Zen.
pub const ADMIN_EXIT_CODE: i32 = 42;

/// Какие нажатия глотать. Win и Ctrl+Esc — всегда: меню «Пуск» игроку не нужно никогда.
/// Alt+Tab, Alt+Esc и Alt+F4 — только на блокировке: во время сессии игрок переключается
/// между игрой и панелью Zen, а Alt+F4 закрывает игру.
pub fn should_block(vk: u32, alt: bool, ctrl: bool, locked: bool) -> bool {
    const VK_TAB: u32 = 0x09;
    const VK_ESCAPE: u32 = 0x1B;
    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;
    const VK_APPS: u32 = 0x5D;
    const VK_F4: u32 = 0x73;
    match vk {
        VK_LWIN | VK_RWIN | VK_APPS => true,
        VK_ESCAPE if ctrl => true,
        VK_TAB | VK_ESCAPE | VK_F4 if alt => locked,
        _ => false,
    }
}

#[cfg(windows)]
pub fn install_keyboard_hook() {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, MSG, WH_KEYBOARD_LL,
    };

    unsafe extern "system" fn hook(code: i32, wparam: usize, lparam: isize) -> isize {
        if code == HC_ACTION as i32 {
            let key = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
            let alt = key.flags & LLKHF_ALTDOWN != 0;
            let ctrl = unsafe { GetAsyncKeyState(VK_CONTROL as i32) } < 0;
            if should_block(key.vkCode, alt, ctrl, LOCKED.load(Ordering::Relaxed)) {
                return 1;
            }
        }
        unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
    }

    // Низкоуровневый хук живёт, пока у его потока крутится очередь сообщений.
    std::thread::spawn(|| unsafe {
        let handle = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), std::ptr::null_mut(), 0);
        if handle.is_null() {
            return;
        }
        let mut message: MSG = std::mem::zeroed();
        while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {}
    });
}

#[cfg(not(windows))]
pub fn install_keyboard_hook() {}

/// Гостевой пользователь Windows из `windows/kiosk-setup.ps1`.
pub const GUEST_USER: &str = "zen-player";

pub fn restart_if_guest() -> Result<(), String> {
    power_if_guest("/r")
}

pub fn shutdown_if_guest() -> Result<(), String> {
    power_if_guest("/s")
}

/// Только под гостем: компьютер админа, где Zen открыли для проверки, не перезагружаем и не выключаем.
#[cfg(windows)]
fn power_if_guest(action: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    if !std::env::var("USERNAME").is_ok_and(|user| user.eq_ignore_ascii_case(GUEST_USER)) {
        return Err("Перезагрузка и выключение только под гостевым пользователем".into());
    }
    std::process::Command::new("shutdown")
        .args([action, "/t", "0", "/f"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не удалось выполнить shutdown {action}: {error}"))
}

#[cfg(not(windows))]
fn power_if_guest(_action: &str) -> Result<(), String> {
    Err("Перезагрузка и выключение работают только в Windows".into())
}

/// Режим сторожа: им Windows запускает Zen вместо рабочего стола. Если окно Zen
/// закроют или оно упадёт, сторож поднимает его снова; выход админа — открыть Windows.
pub fn run_guard() {
    let Ok(exe) = std::env::current_exe() else { return };
    loop {
        let started = std::time::Instant::now();
        let status = std::process::Command::new(&exe).status();
        if matches!(&status, Ok(status) if status.code() == Some(ADMIN_EXIT_CODE)) {
            let _ = std::process::Command::new("explorer.exe").spawn();
            return;
        }
        // Если Zen падает сразу при запуске, не крутим процессор вхолостую.
        if started.elapsed() < std::time::Duration::from_secs(5) {
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::should_block;

    #[test]
    fn keeps_players_on_the_lock_screen() {
        assert!(should_block(0x09, true, false, true), "Alt+Tab на блокировке");
        assert!(should_block(0x73, true, false, true), "Alt+F4 на блокировке");
        assert!(should_block(0x5B, false, false, false), "Win всегда");
        assert!(should_block(0x1B, false, true, false), "Ctrl+Esc всегда");
    }

    #[test]
    fn lets_a_playing_guest_switch_windows_and_type() {
        assert!(!should_block(0x09, true, false, false), "Alt+Tab в сессии");
        assert!(!should_block(0x41, false, false, true), "буквы на блокировке");
        assert!(!should_block(0x09, false, false, true), "Tab без Alt");
    }
}
