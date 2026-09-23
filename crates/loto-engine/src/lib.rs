//! # Loto Engine - Moteur de Calcul Haute Performance (Rust / WASM)
//! 
//! Module de calcul matriciel, spectral et stochastique pour LotoPro Platinum Elite v12.0.
//! Développé conformément à la charte AGENTS.md :
//! - 100% Déterministe (zéro hasard, reproductibilité binaire absolue)
//! - Zéro nombres magiques (dérivations continues différentiables C^∞)
//! - Mémoire continue partagée (zéro Garbage Collection, zéro allocations redondantes)

pub mod fft;
pub mod hurst;
pub mod hawkes;
pub mod markov;
pub mod annealing;
pub mod topological;
pub mod cooccurrence;

use wasm_bindgen::prelude::*;

#[cfg(feature = "console_error_panic_hook")]
use console_error_panic_hook::set_once as set_panic_hook;

/// Point d'entrée d'initialisation du module WebAssembly
#[wasm_bindgen(start)]
pub fn init_engine() {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();

    web_sys::console::log_1(&"[LOTO-ENGINE-WASM] Initialisation réussie du moteur Rust HPC.".into());
}

/// Produit scalaire de deux vecteurs vectorisé (SIMD / auto-vectorisation LLVM)
#[wasm_bindgen]
pub fn dot_product_f64(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len().min(b.len());
    let mut sum = 0.0f64;

    // Déroulement de boucle pour favoriser l'auto-vectorisation SIMD Wasm
    let chunks = len / 4;
    for i in 0..chunks {
        let idx = i * 4;
        sum += a[idx] * b[idx]
            + a[idx + 1] * b[idx + 1]
            + a[idx + 2] * b[idx + 2]
            + a[idx + 3] * b[idx + 3];
    }

    for i in (chunks * 4)..len {
        sum += a[i] * b[i];
    }

    sum
}

/// Scoring tensoriel rapide des 90 numéros : Matrix (90 x F) * Weights (F x 1)
#[wasm_bindgen]
pub fn tensor_score_wasm(
    features_flat: &[f64],
    weights: &[f64],
    num_numbers: usize,
    num_features: usize,
) -> Vec<f64> {
    let mut scores = vec![0.0f64; num_numbers];

    for n in 0..num_numbers {
        let row_offset = n * num_features;
        let mut score = 0.0f64;
        for f in 0..num_features {
            score += features_flat[row_offset + f] * weights[f];
        }
        scores[n] = score;
    }

    scores
}
