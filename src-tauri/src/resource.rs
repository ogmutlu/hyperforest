//! Resolve reading attachments before handing them to the system viewer.
use std::path::Path;

pub fn resolve(resource: &str, directory: &Path, home: Option<&Path>) -> Result<String, String> {
    if resource.is_empty() || resource.chars().any(char::is_control) {
        return Err("Choose a file path or website first.".into());
    }
    if resource.starts_with("http://") || resource.starts_with("https://") {
        let url = tauri::Url::parse(resource).map_err(|error| error.to_string())?;
        if url.host_str().is_none() {
            return Err("The website needs a hostname.".into());
        }
        return Ok(url.into());
    }
    let path = if let Some(relative) = resource.strip_prefix("~/") {
        home.ok_or("The home directory is unavailable.")?
            .join(relative)
    } else {
        directory.join(resource)
    };
    let path = path
        .canonicalize()
        .map_err(|error| format!("Cannot open attachment: {error}"))?;
    if !path.is_file() {
        return Err("The attachment must be a file.".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_files_and_websites_without_treating_paths_as_commands() {
        let directory =
            std::env::temp_dir().join(format!("hyperforest-resource-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("a paper $(command).pdf");
        std::fs::write(&path, b"test").unwrap();
        assert_eq!(
            resolve("a paper $(command).pdf", &directory, None).unwrap(),
            path.to_string_lossy()
        );
        assert_eq!(
            resolve("~/a paper $(command).pdf", Path::new("/"), Some(&directory)).unwrap(),
            path.to_string_lossy()
        );
        assert_eq!(
            resolve("https://example.org/paper.pdf", &directory, None).unwrap(),
            "https://example.org/paper.pdf"
        );
        assert!(resolve("missing.pdf", &directory, None).is_err());
        assert!(resolve(".", &directory, None).is_err());
        assert!(resolve("javascript:alert(1)", &directory, None).is_err());
        assert!(resolve("bad\npath", &directory, None).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
