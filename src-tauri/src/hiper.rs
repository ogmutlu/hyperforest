//! Atomic session inbox shared with hiper; workspace metadata stays app-owned.
use crate::store::Store;
use serde::Serialize;
use std::fs;

const INBOX: &str = "hiper-inbox";
#[derive(Serialize)]
pub struct PendingSession {
    filename: String,
    contents: String,
}
fn valid_filename(name: &str) -> bool {
    name.strip_suffix(".json").is_some_and(|stem| {
        stem.len() == 32
            && stem
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    })
}
impl Store {
    pub fn pending_sessions(&self) -> Result<Vec<PendingSession>, String> {
        let path = self.directory.join(INBOX);
        if path.is_symlink() {
            return Err("hiper-inbox must not be a symbolic link.".into());
        }
        if !path.exists() {
            return Ok(vec![]);
        }
        let mut result = vec![];
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let filename = entry.file_name().to_string_lossy().into_owned();
            if valid_filename(&filename) && entry.file_type().map_err(|e| e.to_string())?.is_file()
            {
                result.push(PendingSession {
                    filename,
                    contents: fs::read_to_string(entry.path()).map_err(|e| e.to_string())?,
                });
            }
        }
        result.sort_by(|a, b| a.filename.cmp(&b.filename));
        Ok(result)
    }
    pub fn acknowledge_sessions(&self, filenames: &[String]) -> Result<(), String> {
        let path = self.directory.join(INBOX);
        if path.is_symlink() || filenames.iter().any(|name| !valid_filename(name)) {
            return Err("Invalid hiper inbox path.".into());
        }
        for filename in filenames {
            match fs::remove_file(path.join(filename)) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }
}
