use chrono::Local;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

type Result<T> = std::result::Result<T, String>;

#[derive(Serialize)]
pub struct Loaded {
    pub directory: String,
    pub yaml: Option<String>,
    pub notes: BTreeMap<String, String>,
    pub backup_error: Option<String>,
}

#[derive(Deserialize)]
pub struct Save {
    pub yaml: String,
    pub structure: String,
    pub notes: BTreeMap<String, String>,
}

pub struct Store {
    pub directory: PathBuf,
    _lock: File,
    last_yaml: Option<String>,
    last_notes: BTreeMap<String, String>,
}

fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let temporary = path.with_file_name(format!(
        ".{}.{}.{}.tmp",
        path.file_name().unwrap().to_string_lossy(),
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(error)?;
    file.write_all(bytes).map_err(error)?;
    file.sync_all().map_err(error)?;
    fs::rename(&temporary, path).map_err(error)?;
    File::open(path.parent().unwrap())
        .and_then(|directory| directory.sync_all())
        .map_err(error)
}

fn notes(directory: &Path) -> Result<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    for entry in fs::read_dir(directory).map_err(error)? {
        let entry = entry.map_err(error)?;
        if entry.file_type().map_err(error)?.is_symlink() {
            return Err("Notes must be regular files, not symbolic links.".into());
        }
        if entry
            .path()
            .extension()
            .is_some_and(|extension| extension == "md")
            && entry.file_type().map_err(error)?.is_file()
        {
            result.insert(
                entry.file_name().to_string_lossy().into_owned(),
                fs::read_to_string(entry.path()).map_err(error)?,
            );
        }
    }
    Ok(result)
}

impl Store {
    pub fn open(directory: PathBuf) -> Result<Self> {
        fs::create_dir_all(&directory).map_err(error)?;
        let directory = fs::canonicalize(directory).map_err(error)?;
        for name in ["notes", "backups"] {
            let path = directory.join(name);
            if path.is_symlink() {
                return Err(format!("{name} must not be a symbolic link."));
            }
            fs::create_dir_all(path).map_err(error)?;
        }
        if directory.join("workspace.yaml").is_symlink() {
            return Err("workspace.yaml must not be a symbolic link.".into());
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(directory.join(".hyperforest.lock"))
            .map_err(error)?;
        lock.try_lock_exclusive().map_err(|_| {
            "This directory is already open in another hyperforest instance.".to_string()
        })?;
        let last_yaml = if directory.join("workspace.yaml").exists() {
            Some(fs::read_to_string(directory.join("workspace.yaml")).map_err(error)?)
        } else {
            None
        };
        let last_notes = notes(&directory.join("notes"))?;
        Ok(Self {
            directory,
            _lock: lock,
            last_yaml,
            last_notes,
        })
    }

    pub fn loaded(&self) -> Loaded {
        Loaded {
            directory: self.directory.to_string_lossy().into_owned(),
            yaml: self.last_yaml.clone(),
            notes: self.last_notes.clone(),
            backup_error: None,
        }
    }

    pub fn save(&mut self, mut request: Save) -> Result<Loaded> {
        let path = self.directory.join("workspace.yaml");
        let disk_yaml = if path.exists() {
            Some(fs::read_to_string(&path).map_err(error)?)
        } else {
            None
        };
        if disk_yaml != self.last_yaml {
            return Err(
                "workspace.yaml changed outside the app. Reload the desktop app before saving."
                    .into(),
            );
        }
        let disk_notes = notes(&self.directory.join("notes"))?;
        for (name, text) in &mut request.notes {
            if name.is_empty()
                || name.contains(['/', '\\'])
                || !name.ends_with(".md")
                || name.len() > 255
            {
                return Err("Invalid Markdown filename.".into());
            }
            if let Some(previous) = self.last_notes.get(name) {
                let current = disk_notes.get(name).ok_or_else(|| {
                    format!("Note {name} was removed externally; restore it before saving.")
                })?;
                if current != previous {
                    if text != previous {
                        return Err(format!("Note {name} changed externally and in the app. Reload before editing it."));
                    }
                    *text = current.clone();
                }
            } else if disk_notes.get(name).is_some_and(|current| current != text) {
                return Err(format!(
                    "Note {name} already exists with different contents."
                ));
            }
        }
        for (name, text) in &request.notes {
            if disk_notes.get(name) != Some(text) {
                atomic_write(&self.directory.join("notes").join(name), text.as_bytes())?;
            }
        }
        atomic_write(
            &self.directory.join("structure.yaml"),
            request.structure.as_bytes(),
        )?;
        if self.last_yaml.as_ref() != Some(&request.yaml) {
            atomic_write(&path, request.yaml.as_bytes())?;
        }
        self.last_yaml = Some(request.yaml);
        // Retain orphaned Markdown files, including those belonging to deleted vertices.
        self.last_notes = notes(&self.directory.join("notes"))?;
        let backup_error = self
            .backup(&Local::now().format("%Y-%m-%d").to_string())
            .err();
        let mut loaded = self.loaded();
        loaded.backup_error = backup_error;
        Ok(loaded)
    }

    pub fn backup(&self, date: &str) -> Result<()> {
        let backups = self.directory.join("backups");
        let target = backups.join(date);
        if target.join("workspace.yaml").is_file()
            && fs::read(target.join("workspace.yaml")).map_err(error)?
                == fs::read(self.directory.join("workspace.yaml")).map_err(error)?
            && notes(&target.join("notes"))? == notes(&self.directory.join("notes"))?
        {
            return atomic_write(
                &target.join("structure.yaml"),
                &fs::read(self.directory.join("structure.yaml")).map_err(error)?,
            );
        }
        let stage = backups.join(format!(".pending-{date}"));
        if stage.exists() {
            fs::remove_dir_all(&stage).map_err(error)?;
        }
        fs::create_dir_all(stage.join("notes")).map_err(error)?;
        for name in ["workspace.yaml", "structure.yaml"] {
            atomic_write(
                &stage.join(name),
                &fs::read(self.directory.join(name)).map_err(error)?,
            )?;
        }
        for (name, text) in notes(&self.directory.join("notes"))? {
            atomic_write(&stage.join("notes").join(name), text.as_bytes())?;
        }
        let previous = backups.join(format!(".previous-{date}"));
        if target.exists() && previous.exists() {
            fs::remove_dir_all(&previous).map_err(error)?;
        }
        if target.exists() {
            fs::rename(&target, &previous).map_err(error)?;
        }
        fs::rename(stage, target).map_err(error)?;
        File::open(&backups)
            .and_then(|directory| directory.sync_all())
            .map_err(error)?;
        if previous.exists() {
            fs::remove_dir_all(previous).map_err(error)?;
        }
        let mut dates: Vec<_> = fs::read_dir(&backups)
            .map_err(error)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry.file_type().is_ok_and(|kind| kind.is_dir())
                    && chrono::NaiveDate::parse_from_str(
                        &entry.file_name().to_string_lossy(),
                        "%Y-%m-%d",
                    )
                    .is_ok()
            })
            .collect();
        dates.sort_by_key(|entry| entry.file_name());
        for entry in dates.iter().take(dates.len().saturating_sub(30)) {
            fs::remove_dir_all(entry.path()).map_err(error)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn folder() -> PathBuf {
        std::env::temp_dir().join(format!(
            "hyperforest-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ))
    }
    fn save(text: &str) -> Save {
        Save {
            yaml: "version: 1\n".into(),
            structure: "hypertrees: []\n".into(),
            notes: BTreeMap::from([("Work - Read.md".into(), text.into())]),
        }
    }
    #[test]
    fn persistence_external_notes_and_conflicts() {
        let path = folder();
        let mut store = Store::open(path.clone()).unwrap();
        assert!(Store::open(path.clone()).is_err());
        store.save(save("original")).unwrap();
        fs::write(path.join("notes/Work - Read.md"), "external").unwrap();
        assert_eq!(
            store.save(save("original")).unwrap().notes["Work - Read.md"],
            "external"
        );
        fs::write(path.join("notes/Work - Read.md"), "external again").unwrap();
        assert!(store.save(save("edited in app")).is_err());
        let mut traversal = save("external");
        traversal.notes.insert("../bad.md".into(), "bad".into());
        assert!(store.save(traversal).is_err());
        drop(store);
        assert!(Store::open(path.clone()).unwrap().loaded().yaml.is_some());
        fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn external_yaml_is_not_overwritten_and_backup_errors_are_reported_after_saving() {
        let path = folder();
        let mut store = Store::open(path.clone()).unwrap();
        store.save(save("first")).unwrap();
        fs::write(path.join("workspace.yaml"), "external metadata").unwrap();
        assert!(store.save(save("next")).is_err());
        assert_eq!(
            fs::read_to_string(path.join("workspace.yaml")).unwrap(),
            "external metadata"
        );
        drop(store);
        let mut store = Store::open(path.clone()).unwrap();
        fs::remove_dir_all(path.join("backups")).unwrap();
        fs::write(path.join("backups"), "block backup directory").unwrap();
        let loaded = store.save(save("next")).unwrap();
        assert!(loaded.backup_error.is_some());
        assert_eq!(loaded.notes["Work - Read.md"], "next");
        drop(store);
        fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn daily_backups_include_notes_and_keep_thirty_days() {
        let path = folder();
        let mut store = Store::open(path.clone()).unwrap();
        store.save(save("notes")).unwrap();
        for day in 1..=31 {
            store.backup(&format!("2025-01-{day:02}")).unwrap();
        }
        let count = fs::read_dir(path.join("backups")).unwrap().count();
        assert_eq!(count, 30);
        assert!(path
            .join("backups/2025-01-31/notes/Work - Read.md")
            .exists());
        drop(store);
        fs::remove_dir_all(path).unwrap();
    }
}
