//! Opt-in end-to-end measurements in the real Tauri/WebKit window.
//! The feature and isolated temporary config are both required.
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn directory() -> Option<PathBuf> {
    std::env::var_os("HYPERFOREST_BENCHMARK_DIR").map(PathBuf::from)
}

pub fn prepare(config: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let Some(directory) = directory() else {
        return Ok(());
    };
    if !directory.is_absolute()
        || !directory.starts_with(std::env::temp_dir())
        || !config.starts_with(&directory)
    {
        return Err(
            "Desktop benchmark requires an isolated config inside its temporary directory.".into(),
        );
    }
    let workspace = directory.join("workspace");
    // Refuse reuse: this harness must never overwrite an existing workspace.
    fs::create_dir(&workspace)?;
    fs::create_dir(workspace.join("notes"))?;
    let mut yaml = String::from("version: 1\ntrees:\n  - id: root\n    title: Desktop performance example\n    createdAt: 0\n    pedantic: false\nnodes:\n");
    for index in 0..500 {
        let (id, title, parent, color, x, y) = if index == 0 {
            (
                "root".into(),
                "Desktop performance example".into(),
                "null",
                "#dfc491",
                550,
                80,
            )
        } else {
            (
                format!("v{index}"),
                format!("Goal {index}"),
                "root",
                "#80c9bc",
                50 + (index % 20) * 50,
                150 + (index / 20) * 20,
            )
        };
        yaml.push_str(&format!("  - id: {id}\n    treeId: root\n    parentId: {parent}\n    title: {title}\n    estimateMinutes: 0\n    notesFile: {id}.md\n    color: '{color}'\n    filled: true\n    x: {x}\n    y: {y}\n"));
        fs::write(workspace.join("notes").join(format!("{id}.md")), "")?;
    }
    yaml.push_str("sessions: []\nfocus: null\n");
    fs::write(workspace.join("workspace.yaml"), yaml)?;
    crate::store::atomic_write(
        &config.join("data-directory"),
        workspace.to_string_lossy().as_bytes(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn desktop_benchmark_result(
    report: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let directory = directory().ok_or("Desktop benchmark is disabled.")?;
    let path = directory.join("performance.json");
    let body = serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?;
    crate::store::atomic_write(&path, &body)?;
    println!("Native desktop benchmark: {}", path.display());
    app.exit(i32::from(report.get("error").is_some()));
    Ok(())
}
