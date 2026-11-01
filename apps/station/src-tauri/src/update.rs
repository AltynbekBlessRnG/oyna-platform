//! Обновление Vence на компьютере зала. Запускает его задача Windows от имени SYSTEM
//! (см. install.rs): раз в 30 минут и при включении.
//!
//! Новая версия ставится, только если подпись Ed25519 сходится с ключом, вшитым ниже.
//! Закрытый ключ есть только у разработчика, поэтому даже взломанный сервер не сможет
//! подсунуть компьютерам клубов свою программу.

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::Path;

const PUBLIC_KEY_HEX: &str = "150e5fe6ea0e542a81fdb938b635958001e7de6ea3df320e4799976060b147a3";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
struct Release {
    version: String,
    sha256: String,
    signature: String,
    url: String,
}

pub fn run() {
    let text = match check_and_install() {
        Ok(text) => text,
        Err(error) => format!("ошибка: {error}"),
    };
    let log = data_dir().join("update.log");
    let _ = std::fs::write(log, format!("\u{feff}версия {CURRENT_VERSION}: {text}\n"));
}

fn check_and_install() -> Result<String, String> {
    let config = std::fs::read_to_string(crate::config::station_dir().join("station.json"))
        .or_else(|_| std::fs::read_to_string(crate::config::legacy_config_path()))
        .map_err(|_| "компьютер ещё не подключён к клубу".to_string())?;
    let api = serde_json::from_str::<serde_json::Value>(&config).ok().and_then(|value| value["apiUrl"].as_str().map(str::to_string)).ok_or("нет адреса сервера")?;
    let base = api.trim().trim_end_matches('/').trim_end_matches("/api").to_string();
    // Файл настроек может править гость, а работаем мы от SYSTEM: адрес — только данные, не команда.
    if !(base.starts_with("https://") || base.starts_with("http://")) || base.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err(format!("странный адрес сервера: {base}"));
    }

    let manifest = download(&format!("{base}/api/stations/release"))?;
    let manifest = String::from_utf8_lossy(&manifest);
    if manifest.trim() == "null" || manifest.trim().is_empty() {
        return Ok("выпусков ещё нет".into());
    }
    let release: Release = serde_json::from_str(&manifest).map_err(|error| format!("непонятный ответ сервера: {error}"))?;
    if !is_newer(&release.version, CURRENT_VERSION) {
        return Ok(format!("актуальная версия (на сервере {})", release.version));
    }

    let binary = download(&format!("{base}{}", release.url))?;
    let sha256 = hex(&Sha256::digest(&binary));
    if sha256 != release.sha256 {
        return Err("файл скачался не целиком или подменён: хеш не совпал".into());
    }
    if !signature_valid(&release.version, &sha256, &release.signature) {
        return Err(format!("подпись версии {} неверна — не ставим", release.version));
    }

    // Ставим туда, где лежит запущенный exe: у старых установок это Program Files\Zen\Zen.exe,
    // у новых — Program Files\Vence\Vence.exe.
    let current = std::env::current_exe().map_err(|error| error.to_string())?;
    install_binary(&current, &binary)?;
    Ok(format!("поставлена версия {}, заработает после перезагрузки", release.version))
}

/// Запущенный exe не перезаписать, но переименовать можно: новая версия заработает после
/// перезагрузки. На любом сбое exe остаётся на месте — иначе Windows загрузится в чёрный экран.
pub fn install_binary(current: &Path, binary: &[u8]) -> Result<(), String> {
    let stem = current.file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_else(|| "Vence".into());
    let old = current.with_file_name(format!("{stem}.old.exe"));
    let fresh = current.with_file_name(format!("{stem}.new.exe"));
    let current = current.to_path_buf();
    // Прошлое обновление ещё ждёт перезагрузки: старый файл занят, поверх него не ставим.
    if old.exists() && std::fs::remove_file(&old).is_err() {
        return Err("прошлое обновление ещё ждёт перезагрузки".into());
    }
    std::fs::write(&fresh, binary).map_err(|error| format!("не удалось записать: {error}"))?;
    if let Err(error) = std::fs::rename(&current, &old) {
        let _ = std::fs::remove_file(&fresh);
        return Err(format!("не удалось отодвинуть старую версию: {error}"));
    }
    if let Err(error) = std::fs::rename(&fresh, &current) {
        let _ = std::fs::rename(&old, &current);
        let _ = std::fs::remove_file(&fresh);
        return Err(format!("не удалось поставить новую версию, оставили прежнюю: {error}"));
    }
    Ok(())
}

pub fn signature_valid(version: &str, sha256: &str, signature_hex: &str) -> bool {
    let (Some(key), Some(signature)) = (unhex::<32>(PUBLIC_KEY_HEX), unhex::<64>(signature_hex)) else { return false };
    let Ok(key) = VerifyingKey::from_bytes(&key) else { return false };
    key.verify_strict(format!("zen-station:{version}:{sha256}").as_bytes(), &Signature::from_bytes(&signature)).is_ok()
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    let parse = |version: &str| -> Option<(u64, u64, u64)> {
        let mut parts = version.split('.').map(|part| part.parse::<u64>().ok());
        Some((parts.next()??, parts.next()??, parts.next()??))
    };
    matches!((parse(candidate), parse(current)), (Some(candidate), Some(current)) if candidate > current)
}

/// Качаем средствами Windows: адрес передаём переменной окружения, а не текстом команды.
fn download(url: &str) -> Result<Vec<u8>, String> {
    // Не во временную папку Windows: туда гость может заранее подложить ссылку с тем же именем.
    let target = data_dir().join(format!("download-{}", std::process::id()));
    let mut command = std::process::Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri $env:ZEN_URL -OutFile $env:ZEN_OUT"])
        .env("ZEN_URL", url)
        .env("ZEN_OUT", &target);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let status = command.status().map_err(|error| error.to_string())?;
    let bytes = std::fs::read(&target);
    let _ = std::fs::remove_file(&target);
    if !status.success() {
        return Err(format!("не удалось скачать {url}"));
    }
    bytes.map_err(|error| error.to_string())
}

use crate::config::data_dir;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn unhex<const N: usize>(text: &str) -> Option<[u8; N]> {
    if text.len() != N * 2 {
        return None;
    }
    let mut out = [0u8; N];
    for (index, chunk) in text.as_bytes().chunks(2).enumerate() {
        out[index] = u8::from_str_radix(std::str::from_utf8(chunk).ok()?, 16).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_only_strictly_newer_versions() {
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
        assert!(!is_newer("latest", "0.1.0"));
    }

    #[test]
    fn keeps_the_working_exe_when_an_update_cannot_be_placed() {
        let dir = std::env::temp_dir().join(format!("vence-update-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("Vence.exe");
        std::fs::write(&exe, b"v1").unwrap();

        install_binary(&exe, b"v2").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"v2");
        assert_eq!(std::fs::read(dir.join("Vence.old.exe")).unwrap(), b"v1");

        // Старая версия «занята», как запущенный exe: открыта без права удаления — обновление ждёт.
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        std::os::windows::fs::OpenOptionsExt::share_mode(&mut options, 0);
        let held = options.open(dir.join("Vence.old.exe")).unwrap();
        assert!(install_binary(&exe, b"v3").is_err());
        assert_eq!(std::fs::read(&exe).unwrap(), b"v2");
        drop(held);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_a_signature_that_does_not_match() {
        assert!(!signature_valid("0.2.0", &"0".repeat(64), &"0".repeat(128)));
        assert!(!signature_valid("0.2.0", &"0".repeat(64), "not hex"));
    }
}
