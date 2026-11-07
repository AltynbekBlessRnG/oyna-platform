//! Чтобы мимо Vence нельзя было уйти в Windows: перехват системных клавиш и «сторож».
//!
//! Ctrl+Alt+Del перехватить нельзя никому — его закрывают политики Windows,
//! их ставит `windows/kiosk-setup.ps1`.

use std::sync::atomic::{AtomicBool, Ordering};

/// Компьютер свободен: Vence на экране блокировки и уходить с него некуда.
pub static LOCKED: AtomicBool = AtomicBool::new(true);

/// Код выхода, по которому сторож открывает обычную Windows вместо нового запуска Vence.
pub const ADMIN_EXIT_CODE: i32 = 42;

/// Какие нажатия глотать. Win и Ctrl+Esc — всегда: меню «Пуск» игроку не нужно никогда.
/// Alt+Tab, Alt+Esc и Alt+F4 — только на блокировке: во время сессии игрок переключается
/// между игрой и панелью Vence, а Alt+F4 закрывает игру.
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

/// Гостевые пользователи Windows из `windows/kiosk-setup.ps1`: zen-player остался на компьютерах,
/// поставленных до переименования в Vence.
pub const GUEST_USERS: [&str; 2] = ["vence-player", "zen-player"];

pub fn restart_if_guest() -> Result<(), String> {
    power_if_guest("/r")
}

pub fn shutdown_if_guest() -> Result<(), String> {
    power_if_guest("/s")
}

/// Vence запущен под гостем клуба, а не у админа, который открыл его для проверки.
fn is_guest() -> bool {
    std::env::var("USERNAME").is_ok_and(|user| GUEST_USERS.iter().any(|guest| user.eq_ignore_ascii_case(guest)))
}

/// Программы, через которые гость уходит мимо Vence в Windows. Проводник откроет, например,
/// Steam («Просмотреть локальные файлы»): без него сторож показал бы гостю рабочий стол и «Пуск».
/// Только то, что игре не нужно: conhost, браузеры и лаунчеры не трогаем.
const ESCAPE_TOOLS: [&str; 11] = [
    "explorer.exe",
    "taskmgr.exe",
    "cmd.exe",
    "powershell.exe",
    "powershell_ise.exe",
    "pwsh.exe",
    "wt.exe",
    "regedit.exe",
    "mmc.exe",
    "control.exe",
    "systemsettings.exe",
];

pub fn is_escape_tool(exe_name: &str) -> bool {
    ESCAPE_TOOLS.iter().any(|tool| exe_name.eq_ignore_ascii_case(tool))
}

/// Под гостем раз в секунду закрываем проводник, диспетчер задач, консоли и настройки
/// в сессии гостя. Работает, пока жив Vence: после выхода админа по PIN сторож открывает
/// обычную Windows, и там всё снова доступно для обслуживания.
#[cfg(windows)]
pub fn start_escape_watch() {
    if !is_guest() {
        return;
    }
    std::thread::spawn(|| loop {
        close_escape_tools();
        std::thread::sleep(std::time::Duration::from_secs(1));
    });
}

#[cfg(not(windows))]
pub fn start_escape_watch() {}

#[cfg(windows)]
fn close_escape_tools() {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
    use windows_sys::Win32::System::Threading::{GetCurrentProcessId, OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    unsafe {
        let own_pid = GetCurrentProcessId();
        let mut own_session = 0u32;
        if ProcessIdToSessionId(own_pid, &mut own_session) == 0 {
            return;
        }
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more {
            let length = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..length]);
            let mut session = u32::MAX;
            // Свой PowerShell не трогаем: им Vence сам закрывает игры после сессии.
            // Только в своей сессии: чужие и системные процессы гостю всё равно не закрыть.
            if is_escape_tool(&name)
                && entry.th32ParentProcessID != own_pid
                && ProcessIdToSessionId(entry.th32ProcessID, &mut session) != 0
                && session == own_session
            {
                let process = OpenProcess(PROCESS_TERMINATE, 0, entry.th32ProcessID);
                if !process.is_null() {
                    TerminateProcess(process, 1);
                    CloseHandle(process);
                }
            }
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }
}

/// Только под гостем: компьютер админа, где Vence открыли для проверки, не перезагружаем и не выключаем.
#[cfg(windows)]
fn power_if_guest(action: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    if !is_guest() {
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

/// Режим сторожа: им Windows запускает Vence вместо рабочего стола. Если окно Vence
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
        // Если Vence падает сразу при запуске, не крутим процессор вхолостую.
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
    fn closes_ways_out_but_not_games() {
        use super::is_escape_tool;
        assert!(is_escape_tool("explorer.exe"), "проводник из Steam");
        assert!(is_escape_tool("Taskmgr.exe"), "диспетчер задач, регистр не важен");
        assert!(is_escape_tool("cmd.exe"));
        assert!(!is_escape_tool("dota2.exe"));
        assert!(!is_escape_tool("steam.exe"));
        assert!(!is_escape_tool("conhost.exe"), "консоль игровых серверов");
        assert!(!is_escape_tool("explorer.exe.bak"));
    }

    #[test]
    fn lets_a_playing_guest_switch_windows_and_type() {
        assert!(!should_block(0x09, true, false, false), "Alt+Tab в сессии");
        assert!(!should_block(0x41, false, false, true), "буквы на блокировке");
        assert!(!should_block(0x09, false, false, true), "Tab без Alt");
    }
}
