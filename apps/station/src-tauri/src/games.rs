//! Игры на этом компьютере: находим в папках лаунчеров, запускаем, закрываем после сессии.

use crate::vdf;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// То же, что `InstalledGame` в экране (`src/platform.ts`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub id: String,
    pub name: String,
    pub launcher: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    pub logo: String,
    pub bg: String,
    pub ink: String,
    /// Обложка из кэша лаунчера, `data:` URL: экрану не нужен доступ к диску.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
}

/// Где игра лежит и как её запустить. На экран не уходит.
#[derive(Debug, Clone, PartialEq)]
struct Found {
    game: InstalledGame,
    launch_uri: String,
    install_dir: PathBuf,
}

// Steam ставит это рядом с играми, но играть тут не во что.
const STEAM_NOT_GAMES: &[&str] = &["228980", "1070560", "1391110", "1628350", "250820"];

pub fn detect() -> Vec<InstalledGame> {
    find_all().into_iter().map(|found| found.game).collect()
}

/// Запускаем только то, что сами нашли на диске: экран передаёт id, а не команду.
pub fn launch(game: &InstalledGame) -> Result<(), String> {
    let found = find_all().into_iter().find(|found| found.game.id == game.id).ok_or("Игра не найдена на этом компьютере")?;
    open_uri(&found.launch_uri)
}

pub fn close_running() {
    let dirs: Vec<PathBuf> = find_all().into_iter().map(|found| found.install_dir).collect();
    kill_processes_under(&dirs);
}

fn find_all() -> Vec<Found> {
    let mut found = Vec::new();
    if let Some(root) = steam_root() {
        found.extend(steam_games(&root));
    }
    found.extend(epic_games(Path::new(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests")));
    found.sort_by(|a, b| a.game.name.to_lowercase().cmp(&b.game.name.to_lowercase()));
    found
}

// ---------- Steam ----------

fn steam_games(root: &Path) -> Vec<Found> {
    let mut libraries = vec![root.to_path_buf()];
    if let Ok(source) = std::fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        let parsed = vdf::parse(&source);
        if let Some(folders) = parsed.get("libraryfolders") {
            for (_, folder) in folders.entries() {
                if let Some(path) = folder.text("path") {
                    let path = PathBuf::from(path);
                    if !libraries.iter().any(|known| same_path(known, &path)) {
                        libraries.push(path);
                    }
                }
            }
        }
    }

    let mut games = Vec::new();
    for library in libraries {
        let Ok(entries) = std::fs::read_dir(library.join("steamapps")) else { continue };
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                continue;
            }
            let Ok(source) = std::fs::read_to_string(entry.path()) else { continue };
            if let Some(found) = steam_game_from_manifest(&source, &library, root) {
                games.push(found);
            }
        }
    }
    games
}

fn steam_game_from_manifest(source: &str, library: &Path, root: &Path) -> Option<Found> {
    let parsed = vdf::parse(source);
    let state = parsed.get("AppState")?;
    let app_id = state.text("appid")?.to_string();
    let name = state.text("name")?.to_string();
    let install_dir = state.text("installdir")?;
    // Флаг 4 — игра скачана целиком; без него она ещё качается или сломана.
    let flags: u32 = state.text("StateFlags").and_then(|flags| flags.parse().ok()).unwrap_or(0);
    if flags & 4 == 0 || STEAM_NOT_GAMES.contains(&app_id.as_str()) || name.contains("Redistributable") {
        return None;
    }
    Some(Found {
        game: placeholder(format!("steam-{app_id}"), name, "steam", steam_cover(root, &app_id)),
        launch_uri: format!("steam://rungameid/{app_id}"),
        install_dir: library.join("steamapps").join("common").join(install_dir),
    })
}

/// Шапка игры из кэша Steam: раньше `<id>_header.jpg`, в новых клиентах — папка `<id>`.
fn steam_cover(root: &Path, app_id: &str) -> Option<String> {
    let cache = root.join("appcache").join("librarycache");
    let mut candidates = vec![cache.join(format!("{app_id}_header.jpg")), cache.join(app_id).join("header.jpg")];
    if let Ok(entries) = std::fs::read_dir(cache.join(app_id)) {
        candidates.extend(entries.flatten().map(|entry| entry.path().join("header.jpg")));
    }
    candidates.into_iter().find(|path| path.is_file()).and_then(|path| data_url(&path))
}

#[cfg(windows)]
fn steam_root() -> Option<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let from_registry = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam")
        .and_then(|key| key.get_value::<String, _>("SteamPath"))
        .ok()
        .map(|path| PathBuf::from(path.replace('/', "\\")));
    from_registry
        .into_iter()
        .chain([PathBuf::from(r"C:\Program Files (x86)\Steam")])
        .find(|path| path.join("steamapps").is_dir())
}

#[cfg(not(windows))]
fn steam_root() -> Option<PathBuf> {
    None
}

// ---------- Epic Games ----------

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EpicManifest {
    display_name: String,
    app_name: String,
    catalog_namespace: String,
    catalog_item_id: String,
    install_location: String,
    #[serde(default)]
    app_categories: Vec<String>,
}

fn epic_games(manifests: &Path) -> Vec<Found> {
    let Ok(entries) = std::fs::read_dir(manifests) else { return Vec::new() };
    entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "item"))
        .filter_map(|entry| std::fs::read_to_string(entry.path()).ok())
        .filter_map(|source| epic_game_from_manifest(&source))
        .collect()
}

fn epic_game_from_manifest(source: &str) -> Option<Found> {
    let manifest: EpicManifest = serde_json::from_str(source).ok()?;
    if !manifest.app_categories.is_empty() && !manifest.app_categories.iter().any(|category| category == "games") {
        return None;
    }
    Some(Found {
        game: placeholder(format!("epic-{}", manifest.app_name), manifest.display_name, "epic", None),
        launch_uri: format!(
            "com.epicgames.launcher://apps/{}%3A{}%3A{}?action=launch&silent=true",
            manifest.catalog_namespace, manifest.catalog_item_id, manifest.app_name
        ),
        install_dir: PathBuf::from(manifest.install_location),
    })
}

// ---------- Общее ----------

/// Пока нет обложки, плитка — цвет и название, цвет постоянный для игры.
fn placeholder(id: String, name: String, launcher: &str, cover: Option<String>) -> InstalledGame {
    const PALETTE: &[(&str, &str)] = &[
        ("#e8a33d", "#141414"),
        ("#8c2a1f", "#f5f5f5"),
        ("#5b47d6", "#f5f5f5"),
        ("#123a5c", "#d9b25f"),
        ("#1f5fa8", "#f5f5f5"),
        ("#0f5e3a", "#f5f5f5"),
        ("#a8452a", "#f5f5f5"),
        ("#2b2f6b", "#ffc83d"),
    ];
    let hash = name.bytes().fold(0u32, |acc, byte| acc.wrapping_mul(31).wrapping_add(byte as u32));
    let (bg, ink) = PALETTE[hash as usize % PALETTE.len()];
    InstalledGame {
        id,
        logo: name.to_uppercase(),
        name,
        launcher: launcher.to_string(),
        genre: None,
        bg: bg.to_string(),
        ink: ink.to_string(),
        cover,
    }
}

fn data_url(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        _ => "image/jpeg",
    };
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().trim_end_matches(['\\', '/']).eq_ignore_ascii_case(b.to_string_lossy().trim_end_matches(['\\', '/']))
}

#[cfg(windows)]
fn open_uri(uri: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", uri])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не удалось запустить игру: {error}"))
}

#[cfg(not(windows))]
fn open_uri(uri: &str) -> Result<(), String> {
    Err(format!("Запуск игр работает только в Windows: {uri}"))
}

#[cfg(windows)]
fn kill_processes_under(dirs: &[PathBuf]) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(output) = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Process | Where-Object Path | ForEach-Object { \"$($_.Id)|$($_.Path)\" }"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return;
    };
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((pid, path)) = line.split_once('|') else { continue };
        let path = path.to_lowercase();
        let inside = dirs.iter().any(|dir| {
            let dir = dir.to_string_lossy().to_lowercase();
            !dir.is_empty() && path.starts_with(&format!("{}\\", dir.trim_end_matches('\\')))
        });
        if inside {
            let _ = std::process::Command::new("taskkill").args(["/PID", pid.trim(), "/F"]).creation_flags(CREATE_NO_WINDOW).status();
        }
    }
}

#[cfg(not(windows))]
fn kill_processes_under(_dirs: &[PathBuf]) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_a_fully_installed_steam_game() {
        let manifest = "\"AppState\"\n{\n\"appid\" \"570\"\n\"name\" \"Dota 2\"\n\"StateFlags\" \"4\"\n\"installdir\" \"dota 2 beta\"\n}";
        let found = steam_game_from_manifest(manifest, Path::new("D:/SteamLibrary"), Path::new("/nowhere")).unwrap();
        assert_eq!(found.game.id, "steam-570");
        assert_eq!(found.game.name, "Dota 2");
        assert_eq!(found.launch_uri, "steam://rungameid/570");
        assert!(found.install_dir.ends_with("dota 2 beta"));
    }

    #[test]
    fn skips_downloads_and_steam_runtime_packages() {
        let downloading = "\"AppState\" { \"appid\" \"730\" \"name\" \"Counter-Strike 2\" \"StateFlags\" \"1026\" \"installdir\" \"cs2\" }";
        let redistributables = "\"AppState\" { \"appid\" \"228980\" \"name\" \"Steamworks Common Redistributables\" \"StateFlags\" \"4\" \"installdir\" \"x\" }";
        assert!(steam_game_from_manifest(downloading, Path::new("C:/"), Path::new("/nowhere")).is_none());
        assert!(steam_game_from_manifest(redistributables, Path::new("C:/"), Path::new("/nowhere")).is_none());
    }

    #[test]
    fn builds_the_epic_launch_link_from_a_manifest() {
        let manifest = r#"{"DisplayName":"Fortnite","AppName":"Fortnite","CatalogNamespace":"fn","CatalogItemId":"4fe75bbc","InstallLocation":"C:\\Program Files\\Epic Games\\Fortnite","AppCategories":["public","games","applications"]}"#;
        let found = epic_game_from_manifest(manifest).unwrap();
        assert_eq!(found.game.id, "epic-Fortnite");
        assert_eq!(found.launch_uri, "com.epicgames.launcher://apps/fn%3A4fe75bbc%3AFortnite?action=launch&silent=true");
    }

    #[test]
    fn gives_each_game_the_same_colour_every_time() {
        let first = placeholder("a".into(), "Rust".into(), "steam", None);
        let again = placeholder("a".into(), "Rust".into(), "steam", None);
        assert_eq!((first.bg, first.ink), (again.bg, again.ink));
    }
}
