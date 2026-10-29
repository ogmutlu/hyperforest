use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub enabled: bool,
    pub interval_days: u16,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_days: 7,
        }
    }
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=365).contains(&self.interval_days) {
            return Err("Choose a backup interval from 1 to 365 days.".into());
        }
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let settings: Self =
            serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        settings.validate()?;
        Ok(settings)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        self.validate()?;
        crate::store::atomic_write(path, &serde_json::to_vec(self).map_err(|e| e.to_string())?)
    }

    pub fn due(&self, previous: Option<NaiveDate>, today: NaiveDate) -> bool {
        self.enabled
            && previous
                .is_none_or(|date| (today - date).num_days() >= i64::from(self.interval_days))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_round_trip_and_invalid_updates_leave_saved_preferences_intact() {
        let directory = std::env::temp_dir().join(format!(
            "hyperforest-backup-settings-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("settings.json");
        assert_eq!(Settings::load(&path).unwrap(), Settings::default());
        let settings = Settings {
            enabled: false,
            interval_days: 3,
        };
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path).unwrap(), settings);
        assert!(Settings {
            enabled: true,
            interval_days: 0
        }
        .save(&path)
        .is_err());
        assert_eq!(Settings::load(&path).unwrap(), settings);
        std::fs::write(&path, b"invalid JSON").unwrap();
        assert!(Settings::load(&path).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn weekly_default_and_custom_intervals_use_calendar_days() {
        let start = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
        let next = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap();
        let mut settings = Settings::default();
        assert_eq!(settings.interval_days, 7);
        assert!(settings.due(None, start));
        assert!(!settings.due(Some(start), start));
        assert!(!settings.due(Some(start), next.pred_opt().unwrap()));
        assert!(settings.due(Some(start), next));
        settings.interval_days = 2;
        assert!(settings.due(Some(start), start + chrono::Days::new(2)));
        settings.enabled = false;
        assert!(!settings.due(None, next));
        assert!(!settings.due(Some(start), next));
        settings.interval_days = 0;
        assert!(settings.validate().is_err());
    }
}
