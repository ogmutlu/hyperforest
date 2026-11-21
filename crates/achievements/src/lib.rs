//! Pure `#![no_std]` achievement evaluation and monotonic unlock latching.
//!
//! Presentation copy (titles, descriptions, tiers, YAML slugs) lives in
//! `hyperforest-bridge`. Local timezone/DST projections and bridge metadata
//! facts are supplied explicitly by the caller as integer records.
#![no_std]
extern crate alloc;

pub mod model;
pub mod rules;
pub mod sync;

pub use model::*;
pub use sync::{evaluate, sync, EvaluationResult, SyncResult};
