//! # Prediction Pipeline Orchestrator (Rust Core HPC)
//!
//! Exécute l'intégralité du pipeline d'inférence stochastique en local dans le moteur Rust.
//! Supprime totalement la nécessité de faire appel aux Edge Functions Supabase pour
//! le calcul prédictif.
//!
//! Respecte les principes AGENTS.md :
//! - 100% Déterministe : tri f64::total_cmp, reproductibilité binaire
//! - Zéro fausse donnée : ne fabrique aucune quinte synthétique si l'historique est vide
//! - Simplexe marginal : normalisation sur la somme exacte des 5 probabilités d'inclusion (Sum = 5.0)

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use crate::in_memory_store::{TOTAL_NUMBERS, NUMBERS_PER_DRAW};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct NativePredictionResult {
    top_5: Vec<u8>,
    top_10: Vec<u8>,
    scores: Vec<f64>,
    pub shannon_entropy: f64,
    pub hurst_exponent: f64,
    pub confidence_score: f64,
}

#[wasm_bindgen]
impl NativePredictionResult {
    #[wasm_bindgen(getter)]
    pub fn top_5(&self) -> Vec<u8> {
        self.top_5.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn top_10(&self) -> Vec<u8> {
        self.top_10.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn scores(&self) -> Vec<f64> {
        self.scores.clone()
    }
}

/// Pipeline de prédiction local ultra-rapide exécuté en RAM contiguë
#[wasm_bindgen]
pub fn run_native_prediction_pipeline(
    flat_winners: &[u8],
    num_draws: usize,
    frequency_weight: f64,
    gap_weight: f64,
    _markov_weight: f64,
    _hurst_weight: f64,
) -> NativePredictionResult {
    let mut scores = vec![0.0f64; TOTAL_NUMBERS + 1];
    // Éradication stricte de toute donnée simulée : aucun [1, 2, 3, 4, 5] inventé
    if num_draws == 0 || flat_winners.is_empty() {
        return NativePredictionResult {
            top_5: vec![],
            top_10: vec![],
            scores,
            shannon_entropy: 0.0,
            hurst_exponent: 0.5,
            confidence_score: 0.0,
        };
    }

    let cols = NUMBERS_PER_DRAW;
    let actual_draws = num_draws.min(flat_winners.len() / cols);
    if actual_draws == 0 {
        return NativePredictionResult {
            top_5: vec![],
            top_10: vec![],
            scores,
            shannon_entropy: 0.0,
            hurst_exponent: 0.5,
            confidence_score: 0.0,
        };
    }

    // 1. Fréquences avec lissage de Laplace continu
    let mut freqs = [0u32; TOTAL_NUMBERS + 1];
    let mut current_gaps = [0u32; TOTAL_NUMBERS + 1];
    let mut last_seen = [false; TOTAL_NUMBERS + 1];

    for d in 0..actual_draws {
        let offset = d * cols;
        for c in 0..cols {
            let n = flat_winners[offset + c] as usize;
            if n >= 1 && n <= TOTAL_NUMBERS {
                freqs[n] += 1;
                if !last_seen[n] {
                    current_gaps[n] = d as u32;
                    last_seen[n] = true;
                }
            }
        }
    }

    for n in 1..=TOTAL_NUMBERS {
        if !last_seen[n] {
            current_gaps[n] = actual_draws as u32;
        }
    }

    // 2. Scoring factorisé via le module unifié (Laplace + Poisson + projection simplexe)
    let total_balls_drawn = (actual_draws * cols) as f64;

    for n in 1..=TOTAL_NUMBERS {
        scores[n] = crate::scoring::compute_bayesian_poisson_score(
            freqs[n],
            current_gaps[n],
            total_balls_drawn,
            frequency_weight,
            gap_weight,
        );
    }
    crate::scoring::project_to_marginal_simplex(&mut scores, NUMBERS_PER_DRAW as f64);

    // 3. Calcul de l'Entropie de Shannon normalisée
    let mut entropy = 0.0f64;
    let max_entropy = (TOTAL_NUMBERS as f64).ln();
    for n in 1..=TOTAL_NUMBERS {
        let p = scores[n] / (NUMBERS_PER_DRAW as f64);
        if p > 1e-9 {
            entropy -= p * p.ln();
        }
    }
    let normalized_entropy = (entropy / max_entropy).clamp(0.0, 1.0);

    // 4. Calcul de l'Exposant de Hurst R/S adaptatif sur le signal d'énergie des tirages
    let sample_size = actual_draws.min(256);
    let mut energy_signal: Vec<f64> = Vec::with_capacity(sample_size);
    for d in (0..actual_draws).rev().take(sample_size) {
        let offset = d * cols;
        let sum_w: f64 = (0..cols).map(|c| flat_winners[offset + c] as f64).sum();
        energy_signal.push(sum_w);
    }
    let hurst = crate::hurst::compute_robust_hurst_wasm(&energy_signal);

    // 5. Tri déterministe via f64::total_cmp pour extraire les top numéros
    let mut indexed: Vec<(u8, f64)> = (1..=TOTAL_NUMBERS as u8)
        .map(|n| (n, scores[n as usize]))
        .collect();

    indexed.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let top_5: Vec<u8> = indexed.iter().take(5).map(|(num, _)| *num).collect();
    let top_10: Vec<u8> = indexed.iter().take(10).map(|(num, _)| *num).collect();

    // 6. Confiance continue différentiable C^∞ :
    // - Baseline théorique combinatoire exacte : P(Hit >= 1) dans un tirage 5/90
    //   calculée par coefficients binomiaux exacts (hypergéométrique) — zéro constante en dur
    // - Poids de saturation d'échantillon w_N = 1 - exp(-actual_draws / TOTAL_NUMBERS)
    // - Gain d'information Shannon I = 1.0 - normalized_entropy
    // - Écart au bruit brownien d_H = 2.0 * |hurst - 0.5|
    let p_hit_base = crate::combinatorics::ticket_prob_at_least_one() * 100.0;
    let sample_saturation = 1.0 - (-(actual_draws as f64) / (TOTAL_NUMBERS as f64)).exp();
    let info_divergence = 1.0 - normalized_entropy;
    let hurst_divergence = (hurst - 0.5).abs() * 2.0;
    let confidence = p_hit_base + (95.0 - p_hit_base) * sample_saturation * (0.7 * info_divergence + 0.3 * hurst_divergence);

    NativePredictionResult {
        top_5,
        top_10,
        scores,
        shannon_entropy: normalized_entropy,
        hurst_exponent: hurst,
        confidence_score: confidence.clamp(10.0, 95.0),
    }
}
