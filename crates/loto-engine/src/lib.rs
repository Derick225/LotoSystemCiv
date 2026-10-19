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
pub mod interdraw_dynamics;
pub mod simulation_core;
pub mod spatial_service;
pub mod strategy_whatif;
pub mod temporal_service;
pub mod aco;
pub mod neural_optimizer;
pub mod delta_stats;
pub mod in_memory_store;
pub mod prediction_pipeline;
pub mod core_prediction_engine;
pub mod calibration;
pub mod scoring;
pub mod validation;

// Noyau mathématique pur (crate `loto-core`, sans wasm-bindgen).
pub use loto_core::{combinatorics, hyperparams, stacking};

use wasm_bindgen::prelude::*;

/// Export WASM (binding fin) : optimise les poids de stacking L2 sur sorties OOF aplaties.
///
/// Layout `oof_flat` : [sample][channel][91] (indice 0 inutilisé)
/// Layout `targets_flat` : [sample][91] (1.0 = numéro sorti, 0.0 sinon)
/// Retourne les K poids du simplexe (somme = 1.0).
#[wasm_bindgen]
pub fn stack_channel_weights_wasm(
    oof_flat: &[f64],
    targets_flat: &[f64],
    num_channels: usize,
    num_samples: usize,
) -> Vec<f64> {
    let stride = loto_core::TOTAL_NUMBERS + 1;
    let mut oof: Vec<Vec<Vec<f64>>> = Vec::with_capacity(num_samples);
    let mut targets: Vec<Vec<f64>> = Vec::with_capacity(num_samples);

    for s in 0..num_samples {
        let sample_base = s * num_channels * stride;
        let mut channels = Vec::with_capacity(num_channels);
        for k in 0..num_channels {
            let offset = sample_base + k * stride;
            let end = (offset + stride).min(oof_flat.len());
            let mut vec = vec![0.0f64; stride];
            if offset < oof_flat.len() {
                let n = end - offset;
                vec[..n].copy_from_slice(&oof_flat[offset..end]);
            }
            channels.push(vec);
        }
        oof.push(channels);

        let t_offset = s * stride;
        let t_end = (t_offset + stride).min(targets_flat.len());
        let mut tgt = vec![0.0f64; stride];
        if t_offset < targets_flat.len() {
            let n = t_end - t_offset;
            tgt[..n].copy_from_slice(&targets_flat[t_offset..t_end]);
        }
        targets.push(tgt);
    }

    stacking::stack_channels_l2(&oof, &targets, num_channels).channel_weights
}

#[cfg(feature = "console_error_panic_hook")]
use console_error_panic_hook::set_once as set_panic_hook;

/// Version sémantique du moteur Rust, extraite de Cargo.toml à la compilation.
/// Permet au bridge TS de vérifier la cohérence binaire/source.
#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Hash FNV-1a déterministe des exports WASM publics du moteur.
/// Le bridge TS compare cette valeur à sa propre liste d'appels attendus.
/// Si les deux divergent, le build CI échoue avant déploiement.
#[wasm_bindgen]
pub fn abi_hash() -> String {
    // Liste canonique triée des exports wasm-bindgen publics.
    // Mise à jour requise à chaque ajout/suppression d'export.
    const EXPORTS: &[&str] = &[
        "AcoResultHpc",
        "AnnealingOptimizationResult",
        "ClosedLoopAutopsyResultHpc",
        "CooccurrenceTensorResult",
        "CrossHawkesWasmResult",
        "HybridRegimeOptimizationHpc",
        "InMemoryDrawStore",
        "NativePredictionResult",
        "PriorAnalysisReport",
        "SpectralAnalysisResult",
        "TopologicalLyapunovResult",
        "WalkForwardReport",
        "WasmDominoResult",
        "WasmPredictionPortfolio",
        "abi_hash",
        "analyze_signal_spectrum",
        "batch_fractal_hurst_analysis",
        "compute_butterfly_lyapunov_wasm",
        "compute_chain_reaction_resonance_wasm",
        "compute_closed_loop_autopsy_wasm",
        "compute_cooccurrence_tensor_wasm",
        "compute_cross_hawkes_kernel",
        "compute_domino_advection_wasm",
        "compute_fft_power_spectrum",
        "compute_frequency_counts_wasm",
        "compute_graph_heat_kernel_wasm",
        "compute_hybrid_regime_weights_wasm",
        "compute_markov_transition_matrix_wasm",
        "compute_pair_pmi_wasm",
        "compute_robust_hurst_wasm",
        "compute_topological_lyapunov_wasm",
        "dot_product_f64",
        "engine_version",
        "init_engine",
        "project_markov_next_state",
        "run_aco_optimization_wasm",
        "run_native_prediction_pipeline",
        "solve_combinatorial_annealing_wasm",
        "stack_channel_weights_wasm",
        "tensor_score_wasm",
    ];

    // FNV-1a 64-bit déterministe
    let mut hash: u64 = 0xcbf29ce484222325;
    for name in EXPORTS {
        for byte in name.bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        // Séparateur entre noms
        hash ^= 0xff;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

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
