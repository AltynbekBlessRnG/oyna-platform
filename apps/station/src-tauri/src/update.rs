//! Обновление Zen на компьютере зала. Запускает его задача Windows от имени SYSTEM
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
    let config = std::fs::read_to_string(data_dir().join("station.json")).map_err(|_| "компьютер ещё не подключён к клубу".to_string())?;
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

    // Запущенный Zen.exe не перезаписать, но переименовать можно: новая версия заработает после перезагрузки.
    let dir = Path::new(crate::install::INSTALL_DIR);
    let fresh = dir.join("Zen.new.exe");
    std::fs::write(&fresh, &binary).map_err(|error| format!("не удалось записать: {error}"))?;
    let _ = std::fs::remove_file(dir.join("Zen.old.exe"));
    std::fs::rename(dir.join("Zen.exe"), dir.join("Zen.old.exe")).map_err(|error| format!("не удалось отодвинуть старую версию: {error}"))?;
    std::fs::rename(&fresh, dir.join("Zen.exe")).map_err(|error| format!("не удалось поставить новую версию: {error}"))?;
    Ok(format!("поставлена версия {}, заработает после перезагрузки", release.version))
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
    let target = std::env::temp_dir().join(format!("zen-download-{}", std::process::id()));
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

fn data_dir() -> std::path::PathBuf {
    std::env::var_os("ProgramData").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir).join("Zen")
}

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
    fn rejects_a_signature_that_does_not_match() {
        assert!(!signature_valid("0.2.0", &"0".repeat(64), &"0".repeat(128)));
        assert!(!signature_valid("0.2.0", &"0".repeat(64), "not hex"));
    }
}
