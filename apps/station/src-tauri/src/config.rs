//! Где Vence хранит данные на компьютере. Две папки с разными правами:
//!
//! - `C:\\ProgramData\\Vence` — только администраторы и SYSTEM. Сюда пишет задача обновления
//!   от имени SYSTEM: если бы гость мог здесь создавать файлы, он подложил бы ссылку на системный
//!   файл, и SYSTEM переписал бы его.
//! - `C:\\ProgramData\\Vence\\station` — гостю можно писать: настройки подключения к клубу.

use std::path::PathBuf;

/// Программа раньше называлась Zen: компьютеры, поставленные до переименования, продолжают
/// жить в `ProgramData\\Zen`, пока их не переустановят.
pub fn data_dir() -> PathBuf {
    let base = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let (current, legacy) = (base.join("Vence"), base.join("Zen"));
    if !current.exists() && legacy.join("station").exists() {
        legacy
    } else {
        current
    }
}

pub fn station_dir() -> PathBuf {
    data_dir().join("station")
}

/// До разделения папок настройки лежали прямо в папке данных.
pub fn legacy_config_path() -> PathBuf {
    data_dir().join("station.json")
}
