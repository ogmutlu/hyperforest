//! Native tray presentation. Session commands still go through the Rust domain
//! in the shared interface, so saves and failures follow the same path as clicks.
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    Emitter, Manager, State,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Activity {
    Idle,
    Running,
    Paused,
}

impl Activity {
    fn from_flags(running: bool, paused: bool) -> Result<Self, String> {
        match (running, paused) {
            (false, false) => Ok(Self::Idle),
            (true, false) => Ok(Self::Running),
            (false, true) => Ok(Self::Paused),
            (true, true) => Err("A session cannot be running and paused at once.".into()),
        }
    }

    fn index(self) -> usize {
        match self {
            Self::Idle => 0,
            Self::Running => 1,
            Self::Paused => 2,
        }
    }
}

/// Keep the application logo and add a solid badge with a play/pause glyph.
/// Both shape and color distinguish activity, including at small panel sizes.
fn activity_icon(base: &Image<'_>, activity: Activity) -> Image<'static> {
    let mut rgba = base.rgba().to_vec();
    let width = base.width();
    let height = base.height();
    if activity != Activity::Idle {
        let radius = (width.min(height) / 4).max(1) as i64;
        let center_x = i64::from(width) - radius - 1;
        let center_y = i64::from(height) - radius - 1;
        let border = (radius / 6).max(1);
        for y in 0..height {
            for x in 0..width {
                let dx = i64::from(x) - center_x;
                let dy = i64::from(y) - center_y;
                let distance = dx * dx + dy * dy;
                if distance > radius * radius {
                    continue;
                }
                let gx = dx * 100 / radius;
                let gy = dy * 100 / radius;
                let glyph = match activity {
                    Activity::Running => (-25..=45).contains(&gx) && gy.abs() <= (45 - gx) * 3 / 4,
                    Activity::Paused => {
                        gy.abs() <= 40 && ((-35..=-10).contains(&gx) || (10..=35).contains(&gx))
                    }
                    Activity::Idle => false,
                };
                let color = if glyph || distance > (radius - border) * (radius - border) {
                    [11, 16, 23, 255]
                } else if activity == Activity::Running {
                    [128, 201, 188, 255]
                } else {
                    [223, 196, 145, 255]
                };
                let offset = (y as usize * width as usize + x as usize) * 4;
                rgba[offset..offset + 4].copy_from_slice(&color);
            }
        }
    }
    Image::new_owned(rgba, width, height)
}

pub struct TrayControls {
    icon: TrayIcon<tauri::Wry>,
    icons: [Image<'static>; 3],
    activity: Mutex<Activity>,
    status: MenuItem<tauri::Wry>,
    focus_name: MenuItem<tauri::Wry>,
    toggle: MenuItem<tauri::Wry>,
    finish: MenuItem<tauri::Wry>,
}

pub fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let status = MenuItem::with_id(
        app,
        "focus-status",
        "hyperforest · Ready",
        false,
        None::<&str>,
    )?;
    let focus_name =
        MenuItem::with_id(app, "focus-name", "No active session", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open hyperforest", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle-focus", "Start a session…", true, None::<&str>)?;
    // Native menus use & for mnemonics; && displays a literal ampersand.
    let finish = MenuItem::with_id(app, "finish", "Save && finish", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit hyperforest", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &focus_name,
            &separator,
            &open,
            &toggle,
            &finish,
            &quit_separator,
            &quit,
        ],
    )?;
    let base = app
        .default_window_icon()
        .ok_or("Application icon is missing")?;
    let icons = [
        activity_icon(base, Activity::Idle),
        activity_icon(base, Activity::Running),
        activity_icon(base, Activity::Paused),
    ];
    let icon = TrayIconBuilder::with_id("focus")
        .icon(icons[0].clone())
        .tooltip("hyperforest — Ready")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "toggle-focus" | "finish" | "quit" => {
                let sent = app.emit("hyperforest-tray-action", event.id.as_ref());
                if sent.is_err() {
                    show_window(app);
                }
            }
            _ => {}
        })
        .build(app)?;
    app.manage(TrayControls {
        icon,
        icons,
        activity: Mutex::new(Activity::Idle),
        status,
        focus_name,
        toggle,
        finish,
    });
    Ok(())
}

#[tauri::command]
pub async fn desktop_tray_state(
    focus_name: String,
    timer: String,
    running: bool,
    paused: bool,
    state: State<'_, TrayControls>,
) -> Result<(), String> {
    let activity = Activity::from_flags(running, paused)?;
    let status = match activity {
        Activity::Idle => "hyperforest · Ready".to_owned(),
        Activity::Running => format!("Focusing · {timer}"),
        Activity::Paused => format!("Paused · {timer}"),
    };
    state
        .status
        .set_text(&status)
        .map_err(|error| error.to_string())?;
    let name = if activity == Activity::Idle {
        "No active session".to_owned()
    } else {
        focus_name.replace('&', "&&")
    };
    state
        .focus_name
        .set_text(name)
        .map_err(|error| error.to_string())?;
    state
        .toggle
        .set_text(match activity {
            Activity::Idle => "Start a session…",
            Activity::Running => "Pause session",
            Activity::Paused => "Resume session",
        })
        .map_err(|error| error.to_string())?;
    state
        .finish
        .set_enabled(activity != Activity::Idle)
        .map_err(|error| error.to_string())?;
    state
        .icon
        .set_tooltip(Some(format!("hyperforest — {status}\n{focus_name}")))
        .map_err(|error| error.to_string())?;
    // Linux writes changed tray icons to disk. Only replace the image when the
    // activity changes, rather than on the once-per-second timer update.
    let mut previous = state.activity.lock().map_err(|error| error.to_string())?;
    if *previous != activity {
        state
            .icon
            .set_icon(Some(state.icons[activity.index()].clone()))
            .map_err(|error| error.to_string())?;
        *previous = activity;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activity_badges_preserve_the_logo_and_differ_in_color_and_shape() {
        let base = Image::new_owned(vec![90; 32 * 32 * 4], 32, 32);
        let idle = activity_icon(&base, Activity::Idle);
        let running = activity_icon(&base, Activity::Running);
        let paused = activity_icon(&base, Activity::Paused);
        assert_eq!(idle.rgba(), base.rgba());
        assert_eq!(&running.rgba()[..32 * 12 * 4], &base.rgba()[..32 * 12 * 4]);
        assert_ne!(running.rgba(), paused.rgba());
        for icon in [&running, &paused] {
            assert_eq!((icon.width(), icon.height()), (32, 32));
            assert_eq!(icon.rgba().len(), base.rgba().len());
        }
        assert!(Activity::from_flags(true, true).is_err());
    }
}
