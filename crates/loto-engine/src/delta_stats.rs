//! # Delta-Sync & Vectorized Frequency Statistics (Rust / WASM HPC)
//!
//! Agrégation statistique instantanée sur mémoire plate pour `fetchRecentStats` et `fetchGlobalStats`
//! afin d'éliminer 100% des requêtes de comptage redondantes vers Supabase.

use wasm_bindgen::prelude::*;

const TOTAL_NUMBERS: usize = 90;

/// Calcule en O(N) les fréquences exactes des 90 numéros sur une tranche aplatie de tirages.
/// Retourne un vecteur de taille 91 où l'index `n` (1..=90) contient le nombre d'apparitions.
#[wasm_bindgen]
pub fn compute_frequency_counts_wasm(
    flat_draws: &[i32],
    num_draws: usize,
    win_cols: usize,
) -> Vec<i32> {
    let mut counts = vec![0i32; TOTAL_NUMBERS + 1];
    let cols = win_cols.max(1);
    let actual_draws = num_draws.min(flat_draws.len() / cols);

    for d in 0..actual_draws {
        let offset = d * cols;
        for c in 0..cols {
            let n = flat_draws[offset + c];
            if n >= 1 && (n as usize) <= TOTAL_NUMBERS {
                counts[n as usize] += 1;
            }
        }
    }

    counts
}
