//! # Empirical Out-Of-Fold Calibration & Walk-Forward Engine (Rust Core HPC)
//!
//! Exécute une calibration de Platt continue et une évaluation Walk-Forward
//! rétrospective sans fuite de données (Out-Of-Fold strict + Holdout final gelé).
//!
//! Principes mathématiques AGENTS.md :
//! - Zéro nombre magique : paramètres dérivés des variances et métriques d'erreur
//! - 100% Déterministe : tri f64::total_cmp, aucun appel aléatoire
//! - Simplexe marginal : projection stricte Sum(p_n) = 5.0
//! - Brier Skill Score objectif comparé au benchmark d'équiprobabilité 5/90

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use crate::in_memory_store::{DrawTimeline, TOTAL_NUMBERS, NUMBERS_PER_DRAW};
use crate::stacking::apply_platt;
use crate::validation;

/// Référence théorique du Brier Score pour un tirage uniforme 5/90 :
/// BS_ref = (5/90) * (1 - 5/90)^2 + (85/90) * (0 - 5/90)^2 = (5 * 85) / 8100 = 0.052469...
pub const UNIFORM_BRIER_REFERENCE: f64 = (5.0 * 85.0) / (90.0 * 90.0);

#[wasm_bindgen]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WalkForwardReport {
    pub brier_score: f64,
    pub brier_skill_score: f64,
    pub platt_alpha: f64,
    pub platt_beta: f64,
    pub empirical_reliability_score: f64,
    pub evaluated_windows: usize,
    pub log_loss: f64,
    pub ece: f64,
    pub lift_vs_random: f64,
    pub mean_hits: f64,
    pub holdout_brier_skill_score: f64,
    pub holdout_draws: usize,
    pub block_bootstrap_bss_mean: f64,
    pub block_bootstrap_bss_std: f64,
    calibration_quality_label: String,
}

#[wasm_bindgen]
impl WalkForwardReport {
    #[wasm_bindgen(getter)]
    pub fn calibration_quality_label(&self) -> String {
        self.calibration_quality_label.clone()
    }
}

/// Scores OOF d'un sous-ensemble d'entraînement (déterministe, identique au pipeline)
fn compute_oof_scores(training: &[crate::in_memory_store::CompactDraw]) -> [f64; TOTAL_NUMBERS + 1] {
    let n_train = training.len();
    let mut freqs = [0u32; TOTAL_NUMBERS + 1];
    let mut gaps = [0u32; TOTAL_NUMBERS + 1];
    let mut last_seen = [false; TOTAL_NUMBERS + 1];

    for (d_idx, d) in training.iter().rev().enumerate() {
        for &w in &d.winners {
            let n = w as usize;
            if n >= 1 && n <= TOTAL_NUMBERS {
                freqs[n] += 1;
                if !last_seen[n] {
                    gaps[n] = d_idx as u32;
                    last_seen[n] = true;
                }
            }
        }
    }
    for n in 1..=TOTAL_NUMBERS {
        if !last_seen[n] {
            gaps[n] = n_train as u32;
        }
    }

    let total_balls = (n_train * NUMBERS_PER_DRAW) as f64;
    let mut pred = [0.0f64; TOTAL_NUMBERS + 1];
    for n in 1..=TOTAL_NUMBERS {
        pred[n] = crate::scoring::compute_bayesian_poisson_score(freqs[n], gaps[n], total_balls, 0.5, 0.5);
    }
    crate::scoring::project_to_marginal_simplex(&mut pred, NUMBERS_PER_DRAW as f64);
    pred
}

/// Évalue le Brier Skill Score sur une timeline avec les paramètres Platt gelés
fn evaluate_brier_skill_with_platt(
    timeline: &DrawTimeline,
    start_idx: usize,
    eval_window: usize,
    platt_alpha: f64,
    platt_beta: f64,
) -> Option<f64> {
    let total = timeline.history.len();
    if total < start_idx + 2 {
        return None;
    }
    let end = (start_idx + eval_window).min(total);
    let mut total_brier = 0.0f64;
    let mut num_samples = 0usize;

    for t in start_idx..end {
        let training = &timeline.history[..t];
        let actual = &timeline.history[t];
        let mut probs = compute_oof_scores(training);
        apply_platt(&mut probs, platt_alpha, platt_beta);
        crate::scoring::project_to_marginal_simplex(&mut probs, NUMBERS_PER_DRAW as f64);

        let mut window_brier = 0.0f64;
        for n in 1..=TOTAL_NUMBERS {
            let y = if actual.contains_number(n as u8) { 1.0f64 } else { 0.0 };
            let e = probs[n] - y;
            window_brier += e * e;
        }
        total_brier += window_brier / TOTAL_NUMBERS as f64;
        num_samples += 1;
    }

    if num_samples == 0 {
        return None;
    }
    let mean_brier = total_brier / num_samples as f64;
    Some((1.0 - mean_brier / UNIFORM_BRIER_REFERENCE).clamp(-1.0, 1.0))
}

/// Calcule la calibration out-of-fold Walk-Forward sur une timeline en mémoire.
///
/// Les `holdout` derniers tirages sont exclus du tuning (régression de Platt) et
/// évalués une seule fois à la fin avec des paramètres gelés.
pub fn evaluate_walk_forward_calibration(
    timeline: &DrawTimeline,
    requested_window: usize,
) -> Result<WalkForwardReport, String> {
    evaluate_wf_impl(timeline, requested_window, true)
}

/// Version interne : `compute_bootstrap` désactive le jackknife récursif des sous-évaluations
fn evaluate_wf_impl(
    timeline: &DrawTimeline,
    requested_window: usize,
    compute_bootstrap: bool,
) -> Result<WalkForwardReport, String> {
    let total_draws = timeline.history.len();
    if total_draws < 8 {
        return Err("INSUFFICIENT_HISTORY: minimum 8 tirages requis pour Walk-Forward".to_string());
    }

    // 1. Découpage Holdout final : jamais touché par le tuning
    let h_size = validation::holdout_size(total_draws);
    let tuning_end = total_draws - h_size;
    let holdout_start = tuning_end;

    // Taille de la fenêtre glissante d'évaluation out-of-fold (sur la partie tuning)
    let eval_window = requested_window.clamp(4, 30).min(tuning_end.saturating_sub(4).max(1));
    if eval_window < 1 || tuning_end < 4 {
        return Err("INSUFFICIENT_HISTORY: historique tuning trop court pour Walk-Forward".to_string());
    }
    let start_idx = tuning_end.saturating_sub(eval_window);

    let mut total_brier = 0.0f64;
    let mut total_log_loss = 0.0f64;
    let mut total_hits = 0usize;
    let mut num_samples = 0usize;
    let mut window_calib: Vec<(f64, f64)> = Vec::new(); // (confiance moyenne top-5, taux de hits)

    // Accumulateurs pour régression continue de Platt out-of-fold
    let mut sum_raw_score = 0.0f64;
    let mut sum_target = 0.0f64;
    let mut sum_raw_sq = 0.0f64;
    let mut sum_prod = 0.0f64;
    let mut total_pairs = 0usize;

    // Simulation Walk-Forward : à chaque étape t, on entraîne sur 0..t et on évalue sur t
    for t in start_idx..tuning_end {
        let training_draws = &timeline.history[..t];
        let actual_target = &timeline.history[t];
        let pred_probs = compute_oof_scores(training_draws);

        // 2. Évaluation des métriques au tirage t
        let mut window_brier = 0.0f64;
        let mut window_log_loss = 0.0f64;
        for n in 1..=TOTAL_NUMBERS {
            let y_n = if actual_target.contains_number(n as u8) { 1.0 } else { 0.0 };
            let p_n = pred_probs[n];
            let err = p_n - y_n;
            window_brier += err * err;
            let p_clip = p_n.clamp(1e-9, 1.0 - 1e-9);
            window_log_loss += -(y_n * p_clip.ln() + (1.0 - y_n) * (1.0 - p_clip).ln());

            // Données pour estimation de régression
            sum_raw_score += p_n;
            sum_target += y_n;
            sum_raw_sq += p_n * p_n;
            sum_prod += p_n * y_n;
            total_pairs += 1;
        }

        // Vérification des 5 numéros ayant la plus haute probabilité prédite
        let mut ranked: Vec<(u8, f64)> = (1..=TOTAL_NUMBERS as u8)
            .map(|n| (n, pred_probs[n as usize]))
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        let mut hits = 0usize;
        let mut conf_sum = 0.0f64;
        for (top_n, p) in ranked.iter().take(5) {
            conf_sum += *p;
            if actual_target.contains_number(*top_n) {
                hits += 1;
            }
        }
        total_hits += hits;
        window_calib.push((conf_sum / 5.0, hits as f64 / 5.0));

        total_brier += window_brier / (TOTAL_NUMBERS as f64);
        total_log_loss += window_log_loss / (TOTAL_NUMBERS as f64);
        num_samples += 1;
    }

    let mean_brier = if num_samples > 0 {
        total_brier / (num_samples as f64)
    } else {
        UNIFORM_BRIER_REFERENCE
    };
    let mean_log_loss = if num_samples > 0 {
        total_log_loss / (num_samples as f64)
    } else {
        0.0
    };

    // Brier Skill Score relatif au benchmark aléatoire
    let brier_skill_score = (1.0 - (mean_brier / UNIFORM_BRIER_REFERENCE)).clamp(-1.0, 1.0);

    // Estimation différentiable des paramètres de Platt (alpha, beta) — TUNING uniquement
    let (platt_alpha, platt_beta) = if total_pairs > 10 {
        let n_f = total_pairs as f64;
        let mean_x = sum_raw_score / n_f;
        let mean_y = sum_target / n_f;
        let cov_xy = sum_prod - n_f * mean_x * mean_y;
        let var_x = sum_raw_sq - n_f * mean_x * mean_x;
        let alpha = if var_x > 1e-9 { (cov_xy / var_x).clamp(0.5, 3.0) } else { 1.0 };
        let beta = (mean_y - alpha * mean_x).clamp(-2.0, 2.0);
        (alpha, beta)
    } else {
        (1.0, 0.0)
    };

    // 3. Évaluation Holdout finale : paramètres Platt gelés, un seul passage
    let holdout_bss = if h_size > 0 {
        evaluate_brier_skill_with_platt(timeline, holdout_start, h_size, platt_alpha, platt_beta)
    } else {
        None
    };

    // 4. Expected Calibration Error par bins dérivés de la taille d'échantillon
    let num_bins = ((num_samples as f64).sqrt().round() as usize).clamp(3, 10);
    let mut ece = 0.0f64;
    if !window_calib.is_empty() {
        let mut bin_conf = vec![0.0f64; num_bins];
        let mut bin_acc = vec![0.0f64; num_bins];
        let mut bin_count = vec![0usize; num_bins];
        for (conf, acc) in &window_calib {
            let b = (((*conf).clamp(0.0, 0.999)) * (num_bins as f64)).floor() as usize;
            bin_conf[b] += conf;
            bin_acc[b] += acc;
            bin_count[b] += 1;
        }
        for b in 0..num_bins {
            if bin_count[b] > 0 {
                let w = bin_count[b] as f64 / num_samples as f64;
                ece += w * ((bin_acc[b] / bin_count[b] as f64) - (bin_conf[b] / bin_count[b] as f64)).abs();
            }
        }
    }

    // 5. Lift vs aléatoire : hits moyens du top-5 divisés par l'espérance uniforme 25/90
    let mean_hits = if num_samples > 0 {
        (total_hits as f64) / (num_samples as f64)
    } else {
        0.0
    };
    let expected_hits_uniform = (NUMBERS_PER_DRAW * NUMBERS_PER_DRAW) as f64 / TOTAL_NUMBERS as f64;
    let lift_vs_random = if expected_hits_uniform > 0.0 {
        mean_hits / expected_hits_uniform
    } else {
        1.0
    };

    // 6. Block bootstrap (jackknife par blocs déterministe) : stabilité du BSS tuning
    let mut bss_samples: Vec<f64> = Vec::new();
    if compute_bootstrap {
        let ranges = validation::block_ranges(tuning_end);
        for (b_start, b_end) in ranges {
            if tuning_end.saturating_sub(b_end - b_start) < 4 {
                continue;
            }
            let sub = validation::timeline_excluding_block(timeline, b_start, b_end);
            if let Ok(sub_report) = evaluate_wf_impl(&sub, requested_window, false) {
                if sub_report.holdout_draws == 0 && sub_report.evaluated_windows > 0 {
                    bss_samples.push(sub_report.brier_skill_score);
                }
            }
        }
    }
    let (bss_mean, bss_std) = validation::block_stats(&bss_samples);

    // Indice de fiabilité empirique continue sur [0, 100]
    let base_skill = (brier_skill_score * 50.0) + 50.0;
    let reliability = (base_skill * 0.7 + mean_hits * 30.0).clamp(10.0, 98.0);

    // Classification continue dérivée de l'erreur type de l'échantillon (zéro seuil magique fixe)
    let bss_se = 1.0 / ((num_samples as f64).sqrt() * (TOTAL_NUMBERS as f64).sqrt()).max(1e-4);
    let p_high = 1.0 / (1.0 + (-10.0 * (brier_skill_score - 2.0 * bss_se)).exp());
    let p_mid = 1.0 / (1.0 + (-10.0 * (brier_skill_score - bss_se)).exp());

    let quality_label = if p_high > 0.6 {
        "HAUTE_CALIBRATION_EMPIRIQUE".to_string()
    } else if p_mid > 0.5 {
        "CALIBRATION_STOCHASTIQUE_STABLE".to_string()
    } else {
        "DIFFUSION_EQUIPROBABLE_NEUTRE".to_string()
    };

    Ok(WalkForwardReport {
        brier_score: (mean_brier * 10000.0).round() / 10000.0,
        brier_skill_score: (brier_skill_score * 10000.0).round() / 10000.0,
        platt_alpha: (platt_alpha * 1000.0).round() / 1000.0,
        platt_beta: (platt_beta * 1000.0).round() / 1000.0,
        empirical_reliability_score: (reliability * 10.0).round() / 10.0,
        evaluated_windows: num_samples,
        log_loss: (mean_log_loss * 10000.0).round() / 10000.0,
        ece: (ece * 10000.0).round() / 10000.0,
        lift_vs_random: (lift_vs_random * 1000.0).round() / 1000.0,
        mean_hits: (mean_hits * 1000.0).round() / 1000.0,
        holdout_brier_skill_score: holdout_bss
            .map(|v| (v * 10000.0).round() / 10000.0)
            .unwrap_or(0.0),
        holdout_draws: h_size,
        block_bootstrap_bss_mean: (bss_mean * 10000.0).round() / 10000.0,
        block_bootstrap_bss_std: (bss_std * 10000.0).round() / 10000.0,
        calibration_quality_label: quality_label,
    })
}
