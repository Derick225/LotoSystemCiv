//! # loto-core — Noyau mathématique pur (sans wasm-bindgen)
//!
//! Ce crate regroupe les primitives déterministes du moteur :
//! - combinatoire exacte (hypergéométrie, binomiaux) et PRNG LCG canonique ;
//! - hyperparamètres dérivés de l'historique (zéro nombre magique) ;
//! - stacking log-linéaire L2 (Platt, EG, simplex) ;
//! - validation (holdout, blocs contigus, statistiques de blocs).
//!
//! Aucun type `wasm_bindgen` ici : testable nativement avec `cargo test`
//! et réutilisable par les bindings (`loto-engine`).

pub mod combinatorics;
pub mod hyperparams;
pub mod stacking;
pub mod validation;

/// Taille du domaine de numéros (5/90).
pub const TOTAL_NUMBERS: usize = 90;
/// Numéros tirés par tirage.
pub const NUMBERS_PER_DRAW: usize = 5;
