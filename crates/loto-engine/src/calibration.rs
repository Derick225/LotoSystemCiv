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

#[inline]
fn logit_prob(p: f64) -> f64 {
    let pc = p.clamp(1e-9, 1.0 - 1e-9);
    (pc / (1.0 - pc)).ln()
}

fn apply_logistic_platt_simplex(probs: &mut [f64; TOTAL_NUMBERS + 1], alpha: f64, beta: f64) {
    for n in 1..=TOTAL_NUMBERS {
        let z = (alpha * logit_prob(probs[n]) + beta).clamp(-20.0, 20.0);
        probs[n] = 1.0 / (1.0 + (-z).exp());
    }
    crate::scoring::project_to_marginal_simplex(probs, NUMBERS_PER_DRAW as f64);
}

/// Scores OOF d'ensemble causal à 6 canaux orthogonaux (parité stricte TS bridge)
fn compute_oof_scores(training: &[crate::in_memory_store::CompactDraw]) -> [f64; TOTAL_NUMBERS + 1] {
    let n_train = training.len();
    if n_train == 0 {
        let mut uniform = [0.0f64; TOTAL_NUMBERS + 1];
        for n in 1..=TOTAL_NUMBERS {
            uniform[n] = NUMBERS_PER_DRAW as f64 / TOTAL_NUMBERS as f64;
        }
        return uniform;
    }

    let mut freqs = [0u32; TOTAL_NUMBERS + 1];
    let mut gaps = [0u32; TOTAL_NUMBERS + 1];
    let mut last_seen = [false; TOTAL_NUMBERS + 1];
    let mut momentum = [0.0f64; TOTAL_NUMBERS + 1];
    let mut markov_counts = [0.0f64; TOTAL_NUMBERS + 1];
    let mut coocc_counts = [0.0f64; TOTAL_NUMBERS + 1];

    let tau_momentum = (n_train as f64).sqrt().max(2.0);
    let last_draw = &training[n_train - 1];
    let mut last_winner_mask = [false; TOTAL_NUMBERS + 1];
    let mut has_last_winners = false;
    for &w in &last_draw.winners {
        let n = w as usize;
        if n >= 1 && n <= TOTAL_NUMBERS {
            last_winner_mask[n] = true;
            has_last_winners = true;
        }
    }

    let mut total_momentum = 0.0f64;
    let mut total_markov_hits = 0.0f64;
    let mut total_coocc_hits = 0.0f64;

    for (d_idx, d) in training.iter().rev().enumerate() {
        let decay = (-(d_idx as f64) / tau_momentum).exp();
        let mut overlap_with_last = 0u32;
        if d_idx >= 1 && has_last_winners {
            for &w in &d.winners {
                let n = w as usize;
                if n >= 1 && n <= TOTAL_NUMBERS && last_winner_mask[n] {
                    overlap_with_last += 1;
                }
            }
        }

        for &w in &d.winners {
            let n = w as usize;
            if n >= 1 && n <= TOTAL_NUMBERS {
                freqs[n] += 1;
                momentum[n] += decay;
                total_momentum += decay;
                if !last_seen[n] {
                    gaps[n] = d_idx as u32;
                    last_seen[n] = true;
                }
                if overlap_with_last > 0 {
                    coocc_counts[n] += overlap_with_last as f64;
                    total_coocc_hits += overlap_with_last as f64;
                }
            }
        }

        if d_idx >= 1 && d_idx < n_train && has_last_winners {
            let prev_draw = &training[n_train - 1 - d_idx];
            let next_draw = &training[n_train - d_idx];
            let mut prev_overlap = 0u32;
            for &wp in &prev_draw.winners {
                let n = wp as usize;
                if n >= 1 && n <= TOTAL_NUMBERS && last_winner_mask[n] {
                    prev_overlap += 1;
                }
            }
            if prev_overlap > 0 {
                for &wn in &next_draw.winners {
                    let n = wn as usize;
                    if n >= 1 && n <= TOTAL_NUMBERS {
                        markov_counts[n] += prev_overlap as f64;
                        total_markov_hits += prev_overlap as f64;
                    }
                }
            }
        }
    }

    for n in 1..=TOTAL_NUMBERS {
        if !last_seen[n] {
            gaps[n] = n_train as u32;
        }
    }

    let total_balls = ((n_train * NUMBERS_PER_DRAW) as f64).max(5.0);
    let expected_gap = TOTAL_NUMBERS as f64 / NUMBERS_PER_DRAW as f64;
    let two_sigma_sq = 2.0 * (TOTAL_NUMBERS as f64 / 25.0);
    let laplace_prior = NUMBERS_PER_DRAW as f64 / TOTAL_NUMBERS as f64;

    let mut ch_freq = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ch_gap = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ch_mom = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ch_markov = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ch_coocc = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ch_spatial = [0.0f64; TOTAL_NUMBERS + 1];

    for n in 1..=TOTAL_NUMBERS {
        ch_freq[n] = (freqs[n] as f64 + 0.5) / (total_balls + 45.0);
        let g_ratio = (gaps[n] as f64) / expected_gap;
        ch_gap[n] = 0.25 + 0.75 * (g_ratio.min(3.0) / 3.0).tanh();
        ch_mom[n] = (momentum[n] + laplace_prior) / (total_momentum + 5.0);
        ch_markov[n] = (markov_counts[n] + laplace_prior) / (total_markov_hits + 5.0);
        ch_coocc[n] = (coocc_counts[n] + laplace_prior) / (total_coocc_hits + 5.0);

        let mut sp_acc = laplace_prior;
        for lw in 1..=TOTAL_NUMBERS {
            if last_winner_mask[lw] {
                let diff = if n >= lw { n - lw } else { lw - n };
                let circ = diff.min(TOTAL_NUMBERS - diff) as f64;
                sp_acc += (-(circ * circ) / two_sigma_sq).exp();
            }
        }
        ch_spatial[n] = sp_acc;
    }

    crate::scoring::project_to_marginal_simplex(&mut ch_freq, NUMBERS_PER_DRAW as f64);
    crate::scoring::project_to_marginal_simplex(&mut ch_gap, NUMBERS_PER_DRAW as f64);
    crate::scoring::project_to_marginal_simplex(&mut ch_mom, NUMBERS_PER_DRAW as f64);
    crate::scoring::project_to_marginal_simplex(&mut ch_markov, NUMBERS_PER_DRAW as f64);
    crate::scoring::project_to_marginal_simplex(&mut ch_coocc, NUMBERS_PER_DRAW as f64);
    crate::scoring::project_to_marginal_simplex(&mut ch_spatial, NUMBERS_PER_DRAW as f64);

    let mut pred = [0.0f64; TOTAL_NUMBERS + 1];
    let inv_channels = 1.0 / 6.0;
    for n in 1..=TOTAL_NUMBERS {
        let log_mix = inv_channels
            * (ch_freq[n].max(1e-9).ln()
                + ch_gap[n].max(1e-9).ln()
                + ch_mom[n].max(1e-9).ln()
                + ch_markov[n].max(1e-9).ln()
                + ch_coocc[n].max(1e-9).ln()
                + ch_spatial[n].max(1e-9).ln());
        pred[n] = log_mix.exp();
    }
    crate::scoring::project_to_marginal_simplex(&mut pred, NUMBERS_PER_DRAW as f64);
    pred
}

/// Régression logistique de Platt régularisée L2 autour de (1.0, 0.0) par Newton-Raphson
fn fit_regularized_logistic_platt(pairs: &[(f64, f64, usize)]) -> (f64, f64) {
    if pairs.len() <= 10 {
        return (1.0, 0.0);
    }

    let lambda_reg = 1.0f64;
    let mut alpha = 1.0f64;
    let mut beta = 0.0f64;

    for _ in 0..15 {
        let mut g_a = lambda_reg * (alpha - 1.0);
        let mut g_b = lambda_reg * beta;
        let mut h_aa = lambda_reg;
        let mut h_ab = 0.0f64;
        let mut h_bb = lambda_reg;

        for &(p, y, _) in pairs {
            let x = logit_prob(p);
            let z = (alpha * x + beta).clamp(-20.0, 20.0);
            let q = 1.0 / (1.0 + (-z).exp());
            let diff = q - y;
            let w = (q * (1.0 - q)).max(1e-9);

            g_a += diff * x;
            g_b += diff;
            h_aa += w * x * x;
            h_ab += w * x;
            h_bb += w;
        }

        let det = h_aa * h_bb - h_ab * h_ab;
        if !(det > 1e-12) {
            break;
        }

        let step_a = (h_bb * g_a - h_ab * g_b) / det;
        let step_b = (h_aa * g_b - h_ab * g_a) / det;

        alpha = (alpha - step_a).clamp(0.5, 3.0);
        beta = (beta - step_b).clamp(-2.0, 2.0);

        if step_a.abs() + step_b.abs() < 1e-7 {
            break;
        }
    }

    (alpha, beta)
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
        apply_logistic_platt_simplex(&mut probs, platt_alpha, platt_beta);

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
    let mut total_pairs = 0usize;
    let mut oof_pairs: Vec<(f64, f64, usize)> = Vec::new();

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
            oof_pairs.push((p_clip, y_n, total_pairs));
            total_pairs += 1;
        }

        // Vérification des 5 numéros ayant la plus haute probabilité prédite
        let mut ranked: Vec<(u8, f64)> = (1..=TOTAL_NUMBERS as u8)
            .map(|n| (n, pred_probs[n as usize]))
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        let mut hits = 0usize;
        for (top_n, _) in ranked.iter().take(5) {
            if actual_target.contains_number(*top_n) {
                hits += 1;
            }
        }
        total_hits += hits;

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

    // Estimation logistique régularisée L2 des paramètres de Platt (alpha, beta) — TUNING uniquement
    let (platt_alpha, platt_beta) = fit_regularized_logistic_platt(&oof_pairs);

    // 3. Évaluation Holdout finale : paramètres Platt figés, un seul passage
    let holdout_bss = if h_size > 0 {
        evaluate_brier_skill_with_platt(timeline, holdout_start, h_size, platt_alpha, platt_beta)
    } else {
        None
    };

    // 4. Expected Calibration Error par déciles quantiles réels sur les paires OOF
    let mut ece = 0.0f64;
    if oof_pairs.len() >= 10 {
        oof_pairs.sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.2.cmp(&b.2)));
        let n_pairs = oof_pairs.len();
        for b in 0..10 {
            let b_start = (b * n_pairs) / 10;
            let b_end = ((b + 1) * n_pairs) / 10;
            let cnt = b_end - b_start;
            if cnt > 0 {
                let mut sum_p = 0.0f64;
                let mut sum_y = 0.0f64;
                for i in b_start..b_end {
                    sum_p += oof_pairs[i].0;
                    sum_y += oof_pairs[i].1;
                }
                let w = cnt as f64 / n_pairs as f64;
                ece += w * ((sum_y / cnt as f64) - (sum_p / cnt as f64)).abs();
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

    // Indice de fiabilité empirique continue sur (0, 100) : moyenne centrée du BSS et du lift top-5
    let base_skill = (brier_skill_score * 50.0) + 50.0;
    let hit_skill = 100.0 / (1.0 + (-(lift_vs_random - 1.0)).exp());
    let eps_pct = 100.0 / (TOTAL_NUMBERS as f64);
    let reliability = (0.5 * base_skill + 0.5 * hit_skill).clamp(eps_pct, 100.0 - eps_pct);

    // Classification continue standardisée par l'erreur type de l'échantillon (Z_BSS = BSS / SE)
    let bss_se = (1.0 / ((num_samples as f64).sqrt() * (TOTAL_NUMBERS as f64).sqrt())).max(1e-4);
    let z_bss = brier_skill_score / bss_se;
    let p_high = 1.0 / (1.0 + (-(z_bss - 2.0)).exp());
    let p_mid = 1.0 / (1.0 + (-(z_bss - 1.0)).exp());

    let quality_label = if p_high > 0.5 {
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
