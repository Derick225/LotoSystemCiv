//! Module de scoring et projection simplexe unifiés (AGENTS.md)
//! Centralise les calculs bayésiens de Laplace, les ratios de Poisson et les projections simplexe.

use crate::in_memory_store::{NUMBERS_PER_DRAW, TOTAL_NUMBERS};

/// Calcule le score composite continu fréquence (Laplace) + écart (Poisson)
#[inline]
pub fn compute_bayesian_poisson_score(
    freq: u32,
    gap: u32,
    total_balls_drawn: f64,
    frequency_weight: f64,
    gap_weight: f64,
) -> f64 {
    let expected_gap = (TOTAL_NUMBERS as f64) / (NUMBERS_PER_DRAW as f64);
    // Fréquence bayésienne lissée par Laplace
    let f_score = (freq as f64 + 1.0) / (total_balls_drawn + TOTAL_NUMBERS as f64);
    // Ratio d'écart Poisson continu (C^∞ via tanh)
    let gap_ratio = (gap as f64) / expected_gap;
    let g_score = (gap_ratio.min(3.0) / 3.0).tanh();

    // Normalisation dimensionnelle : f_score * TOTAL_NUMBERS centre l'espérance autour de 1.0
    frequency_weight * (f_score * (TOTAL_NUMBERS as f64)) + gap_weight * g_score
}

/// Normalisation et projection stricte sur le simplexe des probabilités marginales (Sum = 5.0, p_i in [0, 1])
pub fn project_to_marginal_simplex(scores: &mut [f64], target_sum: f64) {
    let sum: f64 = scores[1..=TOTAL_NUMBERS].iter().sum();
    if sum > 0.0 {
        for n in 1..=TOTAL_NUMBERS {
            scores[n] = ((scores[n] / sum) * target_sum).clamp(0.0, 1.0);
        }
        let clamped_sum: f64 = scores[1..=TOTAL_NUMBERS].iter().sum();
        if clamped_sum > 0.0 && (clamped_sum - target_sum).abs() > 1e-6 {
            let renormalize = target_sum / clamped_sum;
            for n in 1..=TOTAL_NUMBERS {
                scores[n] = (scores[n] * renormalize).clamp(0.0, 1.0);
            }
        }
    }
}
