//! Native Save/Open dialogs and opaque ZIP file transport. Archive encoding,
//! validation, and workspace replacement remain in the shared interface.
use std::path::{Path, PathBuf};
#[cfg(any(windows, target_os = "macos"))]
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn choose(app: &tauri::AppHandle, exporting: bool) -> Result<Option<PathBuf>, String> {
    // The opt-in test harness replaces only file selection, inside its isolated
    // temporary directory. It still executes the production read/write paths.
    #[cfg(feature = "benchmark")]
    if let Some(directory) = crate::benchmark::directory() {
        return Ok(Some(directory.join("exchange.zip")));
    }
    let dialog = app
        .dialog()
        .file()
        .add_filter("Hyperforest ZIP backup", &["zip"]);
    #[cfg(any(windows, target_os = "macos"))]
    let dialog = if let Some(window) = app.get_webview_window("main") {
        dialog.set_parent(&window)
    } else {
        dialog
    };
    let selected = if exporting {
        dialog
            .set_title("Export Hyperforest backup")
            .set_file_name("hyperforest-export.zip")
            .blocking_save_file()
    } else {
        dialog
            .set_title("Import Hyperforest backup")
            .blocking_pick_file()
    };
    selected
        .map(|file| file.into_path().map_err(|error| error.to_string()))
        .transpose()
}

fn write_archive(path: &Path, contents: &[u8]) -> Result<(), String> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|value| value.eq_ignore_ascii_case("zip"))
    {
        return Err("Choose a ZIP filename ending in .zip.".into());
    }
    crate::store::atomic_write(path, contents)
}

#[tauri::command]
pub async fn desktop_export_archive(
    app: tauri::AppHandle,
    contents: Vec<u8>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = choose(&app, true)? else {
            return Ok(false);
        };
        write_archive(&path, &contents)?;
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn desktop_import_archive(app: tauri::AppHandle) -> Result<Option<Vec<u8>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        choose(&app, false)?
            .map(std::fs::read)
            .transpose()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_bytes_are_written_exactly_and_filesystem_errors_are_reported() {
        let directory =
            std::env::temp_dir().join(format!("hyperforest-archive-{}", std::process::id()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("backup.zip");
        let bytes = b"PK\x03\x04\x00\xff\x80\x7f";
        write_archive(&path, bytes).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        write_archive(&path, b"replacement").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"replacement");
        assert!(write_archive(&directory.join("workspace.yaml"), bytes).is_err());
        assert!(write_archive(&directory.join("missing/backup.zip"), bytes).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
