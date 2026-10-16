//! Pure, deterministic rules shared by the browser and desktop applications.
//!
//! Start with [`model`], then [`State::new`] and [`State::apply`]. The domain does
//! not read the clock or generate identities. Callers supply both explicitly.
//! Text and identities are opaque byte sequences; UTF-8 and presentation belong
//! to the bridge. Time is an integer number of milliseconds since the Unix epoch.
#![no_std]
extern crate alloc;

pub mod graph;
pub mod model;
pub mod time;
mod transition;
mod validation;

pub use model::*;

/// A snapshot whose structural invariants have been checked.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct State {
    snapshot: Snapshot,
}

impl State {
    pub fn new(snapshot: Snapshot) -> Result<Self, Error> {
        validation::validate(&snapshot)?;
        Ok(Self { snapshot })
    }

    pub fn empty() -> Self {
        Self {
            snapshot: Snapshot::empty(),
        }
    }

    pub fn snapshot(&self) -> &Snapshot {
        &self.snapshot
    }

    /// Compute a new state. Errors leave the original state untouched.
    pub fn apply(&self, command: Command, now: u64) -> Result<Self, Error> {
        let mut next = self.snapshot.clone();
        transition::apply(&mut next, command, now)?;
        Self::new(next)
    }
}
