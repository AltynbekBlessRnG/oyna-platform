//! Где Zen хранит данные на компьютере. Две папки с разными правами:
//!
//! - `C:\\ProgramData\\Zen` — только администраторы и SYSTEM. Сюда пишет задача обновления
//!   от имени SYSTEM: если бы гость мог здесь создавать файлы, он подложил бы ссылку на системный
//!   файл, и SYSTEM переписал бы его.
//! - `C:\\ProgramData\\Zen\\station` — гостю можно писать: настройки подключения к клубу.

use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("Zen")
}

pub fn station_dir() -> PathBuf {
    data_dir().join("station")
}

/// До разделения папок настройки лежали прямо в `Zen`.
pub fn legacy_config_path() -> PathBuf {
    data_dir().join("station.json")
}
