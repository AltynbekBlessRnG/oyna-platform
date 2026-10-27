//! `Zen-Setup.exe` — это тот же Zen.exe под другим именем: ставит себя в Program Files,
//! превращает компьютер в киоск и заводит задачу обновления.
//!
//!   Zen-Setup.exe            — с вопросами в окнах;
//!   Zen-Setup.exe --quiet    — без вопросов, для установки на весь зал сразу;
//!   Zen.exe --uninstall      — вернуть обычную Windows.

pub const INSTALL_DIR: &str = r"C:\Program Files\Zen";
const KIOSK_SETUP: &str = include_str!("../../windows/kiosk-setup.ps1");
const KIOSK_REMOVE: &str = include_str!("../../windows/kiosk-remove.ps1");
const UPDATE_TASKS: [(&str, &[&str]); 2] = [("Zen Update", &["/SC", "MINUTE", "/MO", "30"]), ("Zen Update At Start", &["/SC", "ONSTART"])];

pub fn install(quiet: bool) {
    if !elevated() {
        return relaunch_elevated(if quiet { "--install --quiet" } else { "--install" });
    }
    let result = (|| -> Result<String, String> {
        std::fs::create_dir_all(INSTALL_DIR).map_err(|error| format!("Не удалось создать {INSTALL_DIR}: {error}"))?;
        let target = std::path::Path::new(INSTALL_DIR).join("Zen.exe");
        let source = std::env::current_exe().map_err(|error| error.to_string())?;
        if !same_file(&source, &target) {
            // Поверх запущенного Zen не записать: старый файл отодвигаем, Windows разрешает переименовать занятый.
            let old = target.with_file_name("Zen.old.exe");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(&target, &old);
            std::fs::copy(&source, &target).map_err(|error| format!("Не удалось скопировать Zen: {error}"))?;
        }
        let output = run_script(KIOSK_SETUP, &["-ZenExe", &target.to_string_lossy()])?;
        let action = format!("\"{}\" --update", target.display());
        for (name, schedule) in UPDATE_TASKS {
            let mut args = vec!["/Create", "/TN", name, "/TR", &action];
            args.extend_from_slice(schedule);
            args.extend_from_slice(&["/RU", "SYSTEM", "/RL", "HIGHEST", "/F"]);
            schtasks(&args)?;
        }
        Ok(output)
    })();
    finish(quiet, result, "Zen установлен", "После перезагрузки компьютер откроет Zen. Подключите его кодом клуба из кабинета.\n\nЕсли стоит «заморозка» диска — сейчас она должна быть выключена.");
}

pub fn uninstall(quiet: bool) {
    if !elevated() {
        return relaunch_elevated(if quiet { "--uninstall --quiet" } else { "--uninstall" });
    }
    let result = (|| -> Result<String, String> {
        for (name, _) in UPDATE_TASKS {
            let _ = schtasks(&["/Delete", "/TN", name, "/F"]);
        }
        run_script(KIOSK_REMOVE, &[])
    })();
    finish(quiet, result, "Zen отключён", "После перезагрузки будет обычный рабочий стол Windows.");
}

fn finish(quiet: bool, result: Result<String, String>, title: &str, next: &str) {
    let log = std::env::var_os("ProgramData").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir).join("Zen").join("install.log");
    let text = match &result {
        Ok(output) => format!("{title}\n{output}"),
        Err(error) => format!("Ошибка: {error}"),
    };
    let _ = std::fs::create_dir_all(log.parent().unwrap_or(std::path::Path::new(".")));
    // С BOM, чтобы Блокнот и PowerShell открыли русский текст как UTF-8.
    let _ = std::fs::write(&log, format!("\u{feff}{text}"));
    println!("{text}");
    if quiet {
        return;
    }
    match result {
        Ok(_) if ask(title, &format!("{next}\n\nПерезагрузить компьютер сейчас?")) => {
            let _ = std::process::Command::new("shutdown").args(["/r", "/t", "0"]).spawn();
        }
        Ok(_) => {}
        Err(error) => alert("Zen не установлен", &error),
    }
}

/// Скрипты киоска вшиты в exe: установщику не нужны соседние файлы.
fn run_script(source: &str, args: &[&str]) -> Result<String, String> {
    let path = std::env::temp_dir().join(format!("zen-{}.ps1", std::process::id()));
    std::fs::write(&path, source).map_err(|error| error.to_string())?;
    let output = command("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&path)
        .args(args)
        .output()
        .map_err(|error| error.to_string());
    let _ = std::fs::remove_file(&path);
    let output = output?;
    let text = format!("{}{}", decode(&output.stdout), decode(&output.stderr));
    if output.status.success() {
        Ok(text)
    } else {
        Err(text)
    }
}

fn schtasks(args: &[&str]) -> Result<(), String> {
    let output = command("schtasks").args(args).output().map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("schtasks: {}", decode(&output.stderr)))
    }
}

/// Консольные программы Windows пишут в кодировке OEM; русские буквы без неё превращаются в кашу.
fn decode(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| bytes.iter().map(|&byte| cp866(byte)).collect())
}

fn cp866(byte: u8) -> char {
    match byte {
        0x80..=0xAF => char::from_u32(0x0410 + (byte - 0x80) as u32).unwrap_or('?'),
        0xE0..=0xEF => char::from_u32(0x0440 + (byte - 0xE0) as u32).unwrap_or('?'),
        0xF0 => 'Ё',
        0xF1 => 'ё',
        byte if byte < 0x80 => byte as char,
        _ => '?',
    }
}

fn same_file(a: &std::path::Path, b: &std::path::Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

#[cfg(windows)]
fn command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command = std::process::Command::new(program);
    command.creation_flags(0x0800_0000);
    command
}

#[cfg(not(windows))]
fn command(program: &str) -> std::process::Command {
    std::process::Command::new(program)
}

#[cfg(windows)]
fn elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut size = 0u32;
        let ok = GetTokenInformation(token, TokenElevation, &mut elevation as *mut _ as *mut _, std::mem::size_of::<TOKEN_ELEVATION>() as u32, &mut size);
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
fn elevated() -> bool {
    false
}

/// Windows спросит пароль администратора и запустит установку заново уже с правами.
#[cfg(windows)]
fn relaunch_elevated(args: &str) {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let Ok(exe) = std::env::current_exe() else { return };
    let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let (verb, file, params) = (wide("runas"), wide(&exe.to_string_lossy()), wide(args));
    unsafe {
        ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), params.as_ptr(), std::ptr::null(), SW_SHOWNORMAL);
    }
}

#[cfg(not(windows))]
fn relaunch_elevated(_args: &str) {}

#[cfg(windows)]
fn message(title: &str, text: &str, flags: u32) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW;
    let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
    unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide(title).as_ptr(), flags) }
}

#[cfg(windows)]
fn ask(title: &str, text: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{IDYES, MB_ICONQUESTION, MB_YESNO};
    message(title, text, MB_YESNO | MB_ICONQUESTION) == IDYES
}

#[cfg(windows)]
fn alert(title: &str, text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK};
    message(title, text, MB_OK | MB_ICONERROR);
}

#[cfg(not(windows))]
fn ask(_title: &str, _text: &str) -> bool {
    false
}

#[cfg(not(windows))]
fn alert(_title: &str, _text: &str) {}
