//! # Inter-Draw Bivariate Matrix & Cross-Dyads Engine (Rust Core HPC)
//!
//! Calcule la matrice de transition bivariée 90x90 et les dyades croisées
//! avec filtrage statistique par z-score continu (test d'hypothèse nulle).
//!
//! Principes mathématiques AGENTS.md :
//! - Zéro nombre magique : l'espérance et la variance sont dérivées de la loi hypergéométrique/binomiale
//! - 100% Déterministe : tri f64::total_cmp, aucun appel aléatoire
//! - Continuité C^∞ : transformation continue sigmoïdale du z-score vers l'indice de certitude

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use crate::in_memory_store::{CompactDraw, TOTAL_NUMBERS, NUMBERS_PER_DRAW};

/// Représentation typée d'une dyade croisée statistiquement significative
#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WasmCrossDyad {
    pub source_number: u8,
    pub target_number: u8,
    pub occurrences: u32,
    pub expected_occurrences: f64,
    pub z_score: f64,
    pub lift: f64,
    pub significance_score: f64, // [0, 100] continue
}

#[wasm_bindgen]
impl WasmCrossDyad {
    #[wasm_bindgen(getter)]
    pub fn source_number(&self) -> u8 {
        self.source_number
    }

    #[wasm_bindgen(getter)]
    pub fn target_number(&self) -> u8 {
        self.target_number
    }

    #[wasm_bindgen(getter)]
    pub fn occurrences(&self) -> u32 {
        self.occurrences
    }

    #[wasm_bindgen(getter)]
    pub fn expected_occurrences(&self) -> f64 {
        self.expected_occurrences
    }

    #[wasm_bindgen(getter)]
    pub fn z_score(&self) -> f64 {
        self.z_score
    }

    #[wasm_bindgen(getter)]
    pub fn lift(&self) -> f64 {
        self.lift
    }

    #[wasm_bindgen(getter)]
    pub fn significance_score(&self) -> f64 {
        self.significance_score
    }
}

/// Rapport complet d'analyse bivariée des dyades croisées
#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WasmBivariateReport {
    dyads: Vec<WasmCrossDyad>,
    transition_matrix_flat: Vec<f64>, // 90 x 90 = 8100 éléments
    pub total_paired_draws: usize,
    pub mean_coupling_z: f64,
}

#[wasm_bindgen]
impl WasmBivariateReport {
    #[wasm_bindgen(getter)]
    pub fn dyads_count(&self) -> usize {
        self.dyads.len()
    }

    #[wasm_bindgen]
    pub fn get_dyad(&self, index: usize) -> Option<WasmCrossDyad> {
        self.dyads.get(index).cloned()
    }

    #[wasm_bindgen(getter)]
    pub fn transition_matrix_flat(&self) -> Vec<f64> {
        self.transition_matrix_flat.clone()
    }
}

/// Calcule les dyades croisées et la matrice de transition sur deux séries de tirages appariés
pub fn compute_bivariate_dyads_and_matrix(
    source_draws: &[CompactDraw],
    target_draws: &[CompactDraw],
    min_z_threshold: f64,
) -> WasmBivariateReport {
    let n_pairs = source_draws.len().min(target_draws.len());
    let mut transition_matrix = vec![0.0f64; TOTAL_NUMBERS * TOTAL_NUMBERS];

    if n_pairs < 2 {
        return WasmBivariateReport {
            dyads: vec![],
            transition_matrix_flat: transition_matrix,
            total_paired_draws: 0,
            mean_coupling_z: 0.0,
        };
    }

    // 1. Comptage bivarié des cooccurrences conjointes O(s, t)
    let mut counts = vec![0u32; TOTAL_NUMBERS * TOTAL_NUMBERS];
    let mut source_freqs = [0u32; TOTAL_NUMBERS + 1];

    for i in 0..n_pairs {
        let src = &source_draws[i];
        let tgt = &target_draws[i];

        for &s_num in &src.winners {
            let s_idx = s_num as usize;
            if s_idx >= 1 && s_idx <= TOTAL_NUMBERS {
                source_freqs[s_idx] += 1;
                for &t_num in &tgt.winners {
                    let t_idx = t_num as usize;
                    if t_idx >= 1 && t_idx <= TOTAL_NUMBERS {
                        counts[(s_idx - 1) * TOTAL_NUMBERS + (t_idx - 1)] += 1;
                    }
                }
            }
        }
    }

    // 2. Probabilité conjointe théorique sous l'hypothèse nulle d'indépendance stochastique
    // p_joint = (5 / 90) * (5 / 90) = 25 / 8100 = 1 / 324 ≈ 0.0030864
    let n_f = n_pairs as f64;
    let p_joint = (NUMBERS_PER_DRAW as f64 / TOTAL_NUMBERS as f64)
        * (NUMBERS_PER_DRAW as f64 / TOTAL_NUMBERS as f64);
    let expected = n_f * p_joint;
    let variance = n_f * p_joint * (1.0 - p_joint);
    let std_dev = variance.sqrt().max(1e-9);

    let mut dyads: Vec<WasmCrossDyad> = Vec::with_capacity(TOTAL_NUMBERS * TOTAL_NUMBERS);
    let mut sum_z = 0.0f64;

    for s in 1..=TOTAL_NUMBERS {
        let s_count = source_freqs[s] as f64;
        let row_offset = (s - 1) * TOTAL_NUMBERS;

        for t in 1..=TOTAL_NUMBERS {
            let o = counts[row_offset + (t - 1)] as f64;
            let o_u32 = counts[row_offset + (t - 1)];

            // Probabilité de transition conditionnelle P(t | s) avec lissage continu de Laplace
            let p_trans = (o + 1.0) / (s_count + (TOTAL_NUMBERS as f64 / NUMBERS_PER_DRAW as f64));
            transition_matrix[row_offset + (t - 1)] = p_trans;

            // Z-score statistique continu : mesure le nombre d'écarts-types au-dessus de l'aléatoire
            let z = (o - expected) / std_dev;
            sum_z += z;

            // Lift empirique mesurant la sur-représentation relative
            let lift = if expected > 0.0 { o / expected } else { 1.0 };

            // Indice de certitude continue sigmoïdale sur [0, 100]
            // sigmoid(1.2 * z) sans seuillage binaire
            let significance = 100.0 / (1.0 + (-1.2 * z).exp());

            if z >= min_z_threshold {
                dyads.push(WasmCrossDyad {
                    source_number: s as u8,
                    target_number: t as u8,
                    occurrences: o_u32,
                    expected_occurrences: (expected * 1000.0).round() / 1000.0,
                    z_score: (z * 1000.0).round() / 1000.0,
                    lift: (lift * 100.0).round() / 100.0,
                    significance_score: (significance * 10.0).round() / 10.0,
                });
            }
        }
    }

    // Tri déterministe par z-score décroissant (f64::total_cmp)
    dyads.sort_by(|a, b| b.z_score.total_cmp(&a.z_score).then_with(|| a.source_number.cmp(&b.source_number)));

    let mean_z = sum_z / ((TOTAL_NUMBERS * TOTAL_NUMBERS) as f64);

    WasmBivariateReport {
        dyads,
        transition_matrix_flat: transition_matrix,
        total_paired_draws: n_pairs,
        mean_coupling_z: (mean_z * 1000.0).round() / 1000.0,
    }
}
