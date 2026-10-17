mod archive;
#[cfg(feature = "benchmark")]
mod benchmark;
mod store;
mod tray;
use archive::{desktop_export_archive, desktop_import_archive};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use store::{Loaded, Save, Store};
use tauri::{Manager, State};
use tray::{desktop_tray_state, show_window};

#[tauri::command]
async fn desktop_show_window(app: tauri::AppHandle) {
    show_window(&app);
}
#[tauri::command]
async fn desktop_quit(app: tauri::AppHandle) {
    app.exit(0);
}
struct Desktop {
    store: Mutex<Option<Store>>,
    config: PathBuf,
}

#[tauri::command]
async fn desktop_load(state: State<'_, Desktop>) -> Result<Option<Loaded>, String> {
    let mut current = state.store.lock().map_err(|error| error.to_string())?;
    if current.is_none() && state.config.exists() {
        let path = std::fs::read_to_string(&state.config).map_err(|error| error.to_string())?;
        *current = Some(Store::open(PathBuf::from(path))?);
    }
    Ok(current.as_ref().map(Store::loaded))
}
#[tauri::command]
async fn desktop_select(directory: String, state: State<'_, Desktop>) -> Result<Loaded, String> {
    let mut current = state.store.lock().map_err(|error| error.to_string())?;
    let requested = PathBuf::from(&directory);
    let requested = std::fs::canonicalize(&requested).unwrap_or(requested);
    if current
        .as_ref()
        .is_some_and(|store| store.directory == requested)
    {
        return Ok(current.as_ref().unwrap().loaded());
    }
    let store = Store::open(requested)?;
    store::atomic_write(&state.config, store.directory.to_string_lossy().as_bytes())?;
    let loaded = store.loaded();
    *current = Some(store);
    Ok(loaded)
}
#[tauri::command]
async fn desktop_save(
    directory: String,
    request: Save,
    state: State<'_, Desktop>,
) -> Result<Loaded, String> {
    let mut current = state.store.lock().map_err(|error| error.to_string())?;
    let store = current.as_mut().ok_or("Choose a data directory first.")?;
    if store.directory != Path::new(&directory) {
        return Err("The selected data directory changed. Reload before saving.".into());
    }
    store.save(request)
}
#[tauri::command]
async fn desktop_open_note(
    name: String,
    directory: String,
    state: State<'_, Desktop>,
) -> Result<(), String> {
    if name.contains(['/', '\\']) || !name.ends_with(".md") {
        return Err("Invalid note filename.".into());
    }
    let current = state.store.lock().map_err(|error| error.to_string())?;
    if current
        .as_ref()
        .is_none_or(|store| store.directory != Path::new(&directory))
    {
        return Err("The selected directory changed.".into());
    }
    let path = current
        .as_ref()
        .ok_or("Choose a directory first.")?
        .directory
        .join("notes")
        .join(name);
    if !path.is_file() || path.is_symlink() {
        return Err("Markdown file is missing.".into());
    }
    let mut child = std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
#[tauri::command]
async fn desktop_enable_backups() -> Result<(), String> {
    #[cfg(feature = "benchmark")]
    if benchmark::directory().is_some() {
        return Ok(());
    }
    let home = std::env::var_os("HOME").ok_or("HOME is unavailable")?;
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(home).join(".config"));
    let units = config.join("systemd/user");
    std::fs::create_dir_all(&units).map_err(|error| error.to_string())?;
    let executable = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .unwrap_or(std::env::current_exe().map_err(|error| error.to_string())?);
    let escaped = executable
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('%', "%%");
    let service = format!("[Unit]\nDescription=Daily hyperforest backup\n[Service]\nType=oneshot\nExecStart=\"{escaped}\" --backup-only\n");
    let timer = "[Unit]\nDescription=Daily hyperforest backup\n[Timer]\nOnCalendar=daily\nPersistent=true\n[Install]\nWantedBy=timers.target\n";
    store::atomic_write(
        &units.join("hyperforest-backup.service"),
        service.as_bytes(),
    )?;
    store::atomic_write(&units.join("hyperforest-backup.timer"), timer.as_bytes())?;
    for args in [
        vec!["--user", "daemon-reload"],
        vec!["--user", "enable", "--now", "hyperforest-backup.timer"],
    ] {
        let output = std::process::Command::new("systemctl")
            .args(args)
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
    }
    Ok(())
}
fn backup_only() -> Result<(), String> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config")
        });
    let selected = config.join("io.github.ogmutlu.hyperforest/data-directory");
    if !selected.exists() {
        return Ok(());
    }
    let path = PathBuf::from(std::fs::read_to_string(selected).map_err(|error| error.to_string())?);
    let store = match Store::open(path) {
        Ok(store) => store,
        Err(message) if message.contains("already open") => return Ok(()),
        Err(message) => return Err(message),
    };
    if store.directory.join("workspace.yaml").exists() {
        store.backup(&chrono::Local::now().format("%Y-%m-%d").to_string())?;
    }
    Ok(())
}
fn main() {
    if std::env::args().any(|arg| arg == "--backup-only") {
        if let Err(error) = backup_only() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_config_dir()?;
            std::fs::create_dir_all(&directory)?;
            #[cfg(feature = "benchmark")]
            benchmark::prepare(&directory)?;
            app.manage(Desktop {
                store: Mutex::new(None),
                config: directory.join("data-directory"),
            });
            tray::install(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });
    #[cfg(feature = "benchmark")]
    let builder = builder
        .on_page_load(|webview, payload| {
            if benchmark::directory().is_some()
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                if let Err(error) = webview.eval(include_str!("benchmark.js")) {
                    eprintln!("{error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_export_archive,
            desktop_import_archive,
            desktop_tray_state,
            desktop_show_window,
            desktop_quit,
            desktop_load,
            desktop_select,
            desktop_save,
            desktop_open_note,
            desktop_enable_backups,
            benchmark::desktop_benchmark_result
        ]);
    #[cfg(not(feature = "benchmark"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        desktop_export_archive,
        desktop_import_archive,
        desktop_tray_state,
        desktop_show_window,
        desktop_quit,
        desktop_load,
        desktop_select,
        desktop_save,
        desktop_open_note,
        desktop_enable_backups
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("Could not start hyperforest");
}
