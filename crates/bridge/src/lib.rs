//! JSON/WebAssembly adapter. This crate is outside the intended proof boundary.
mod command;
mod document;
mod layout;

use document::{millis, Document};
use hyperforest_domain as d;
use wasm_bindgen::prelude::*;

pub fn message(error: d::Error) -> String {
    use d::Error::*;
    match error {
        MissingNode => "This vertex no longer exists.",
        MissingTree => "This hypertree no longer exists.",
        MissingSession => "This saved session no longer exists.",
        DuplicateId => "Duplicate record identity.",
        InvalidName => "Give this goal a name of 1 to 100 characters.",
        DuplicateName => "Sibling names must be unique; hypertree names must also be unique.",
        InvalidGraph => "Invalid graph structure or root name.",
        Cycle => "Graph or hypertree links contain a cycle.",
        RootConnection => "The root cannot be reconnected.",
        CrossTreeConnection => "Connections must stay within this graph.",
        FinishedNode => "Finished vertices cannot be focused or changed in the graph; cannot add children to a finished vertex.",
        FinishedParent => "Active vertices cannot have finished parents.",
        ActiveSession => "Save or discard the active session before changing this subtree.",
        CurrentSession => "Save or discard your current session first.",
        RootCompletion => "Only child goals can be finished.",
        Disconnected => "pedantic: a hypertree must be connected. Connect every vertex to the root before enabling pedantic.",
        DisconnectedColor => "pedantic: vertices of each color must form one connected subtree.",
        InvalidColors => "Vertex colors must be valid, nonempty, unique, and at most 32.",
        EnableMultipleColors => "Enable multiple colors first.",
        InvalidTime => "Invalid focus interval or clock sample.",
        InvalidSession => "Choose a valid past start time and a positive duration ending no later than now; saved intervals must match their duration.",
        Overflow => "Time arithmetic exceeds the supported range.",
        Limit => "A workspace can contain at most 2000 vertices and hypertrees.",
    }.into()
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}
fn js(error: String) -> JsError {
    JsError::new(&error)
}

/// Immutable domain handle cached against one frontend snapshot. Queries avoid
/// re-parsing the whole workspace on every call and every pointer movement.
#[wasm_bindgen]
pub struct Domain {
    document: Document,
    state: d::State,
}

impl Domain {
    fn parse(raw: &str) -> Result<Self, String> {
        let document: Document = serde_json::from_str(raw).map_err(|error| error.to_string())?;
        let state = document.domain()?;
        let document = document.merge(state.snapshot())?;
        // Freeze resolved default colors exactly as the old version-1 schema did.
        let state = document.domain()?;
        Ok(Self { document, state })
    }
}

#[wasm_bindgen]
impl Domain {
    #[wasm_bindgen(constructor)]
    pub fn new(raw: &str) -> Result<Domain, JsError> {
        Self::parse(raw).map_err(js)
    }

    pub fn snapshot(&self) -> Result<String, JsError> {
        json(&self.document).map_err(js)
    }

    pub fn apply(&self, raw: &str, now: f64) -> Result<Domain, JsError> {
        let action = serde_json::from_str(raw).map_err(|error| js(error.to_string()))?;
        let document = command::apply(
            self.document.clone(),
            &self.state,
            action,
            millis(now).map_err(js)?,
        )
        .map_err(js)?;
        let state = document.domain().map_err(js)?;
        Ok(Self { document, state })
    }

    /// Values in document node order. Negative `from` requests lifetime totals.
    pub fn totals(&self, now: f64, from: f64) -> Result<String, JsError> {
        let from = if from < 0.0 {
            None
        } else {
            Some(millis(from).map_err(js)?)
        };
        let values = d::time::totals(self.state.snapshot(), millis(now).map_err(js)?, from)
            .map_err(|e| js(message(e)))?;
        for value in &values {
            document::safe_number(*value).map_err(js)?;
        }
        json(&values).map_err(js)
    }

    pub fn time_between(&self, from: f64, to: f64) -> Result<f64, JsError> {
        d::time::time_between(
            self.state.snapshot(),
            millis(from).map_err(js)?,
            millis(to).map_err(js)?,
        )
        .map_err(|e| js(message(e)))
        .and_then(|value| document::safe_number(value).map_err(js))
    }

    pub fn path(&self, id: &str) -> Result<String, JsError> {
        let value = d::graph::node_path(self.state.snapshot(), &id.as_bytes().to_vec())
            .map_err(|e| js(message(e)))?;
        document::text(&value).map_err(js)
    }

    pub fn subtree(&self, id: &str) -> Result<String, JsError> {
        let ids = d::graph::subtree_ids(self.state.snapshot(), &id.as_bytes().to_vec());
        let ids = ids
            .iter()
            .map(|id| document::text(id))
            .collect::<Result<Vec<_>, _>>()
            .map_err(js)?;
        json(&ids).map_err(js)
    }

    pub fn can_link(&self, source: &str, target: &str) -> bool {
        d::graph::can_link_tree(
            self.state.snapshot(),
            &source.as_bytes().to_vec(),
            &target.as_bytes().to_vec(),
        )
    }
}

/// Timer interpolation uses the same integer implementation as saved accounting.
#[wasm_bindgen]
pub fn focus_elapsed(raw: &str, now: f64) -> Result<f64, JsError> {
    let focus: document::Focus =
        serde_json::from_str(raw).map_err(|error| js(error.to_string()))?;
    // Convert just the timer fields; graph membership is checked on load.
    let focus = d::Focus {
        node_id: vec![],
        tree_id: vec![],
        title: vec![],
        group: vec![],
        started_at: focus.started_at,
        running_since: focus.running_since,
        elapsed_ms: focus.elapsed_ms,
        periods: vec![],
    };
    d::time::focus_elapsed(&focus, millis(now).map_err(js)?)
        .map_err(|e| js(message(e)))
        .and_then(|value| document::safe_number(value).map_err(js))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_and_presentation_survive_the_transport_boundary() {
        let domain = Domain::parse(r##"{"version":1,"trees":[{"id":"r","title":"Öğuz","createdAt":1000}],"nodes":[{"id":"r","treeId":"r","parentId":null,"title":"Öğuz","estimateMinutes":0,"notes":"# Keep me","notesFile":"Öğuz.md","x":220,"y":330}],"sessions":[],"focus":null}"##).unwrap();
        let next = command::apply(
            domain.document.clone(),
            &domain.state,
            command::Action::Start { id: "r".into() },
            2000,
        )
        .unwrap();
        assert_eq!(next.nodes[0].notes, "# Keep me");
        assert_eq!(next.nodes[0].notes_file.as_deref(), Some("Öğuz.md"));
        assert_eq!(next.nodes[0].x, 220.0);
        assert_eq!(next.focus.unwrap().group, "Öğuz");
    }

    #[test]
    fn transport_numbers_and_colors_are_checked() {
        assert!(millis(f64::NAN).is_err());
        assert!(millis(-1.0).is_err());
        assert!(millis(1.5).is_err());
        assert!(millis(9_007_199_254_740_992.0).is_err());
        assert_eq!(document::color("#AABBCC").unwrap(), 0xaabbcc);
        assert!(document::color("#hello!").is_err());
    }

    #[test]
    fn omitted_focus_periods_require_unambiguous_elapsed_time() {
        let mut raw = serde_json::json!({
            "version": 1,
            "trees": [{"id": "r", "title": "Research", "createdAt": 1000}],
            "nodes": [{"id": "r", "treeId": "r", "parentId": null,
                "title": "Research", "estimateMinutes": 0, "notes": "", "x": 0, "y": 0}],
            "sessions": [],
            "focus": {"treeId": "r", "nodeId": "r", "title": "Research", "group": "Research",
                "startedAt": 2000, "runningSince": 2000, "elapsedMs": 0}
        });
        let domain = Domain::parse(&raw.to_string()).unwrap();
        assert!(domain
            .state
            .snapshot()
            .focus
            .as_ref()
            .unwrap()
            .periods
            .is_empty());
        raw["focus"]["runningSince"] = 3000.into();
        raw["focus"]["elapsedMs"] = 1000.into();
        let domain = Domain::parse(&raw.to_string()).unwrap();
        assert_eq!(
            domain.state.snapshot().focus.as_ref().unwrap().periods,
            vec![d::Period {
                start: 2000,
                end: 3000
            }]
        );
        raw["focus"]["elapsedMs"] = 500.into();
        assert!(Domain::parse(&raw.to_string())
            .err()
            .unwrap()
            .contains("pauses"));
        raw["focus"]["runningSince"] = serde_json::Value::Null;
        assert!(Domain::parse(&raw.to_string())
            .err()
            .unwrap()
            .contains("pauses"));
    }
}
