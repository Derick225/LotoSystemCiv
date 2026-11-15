//! # Noyau Épistasique & Génomique EpiGenome-SQ (Rust / WASM HPC)
//!
//! Porte vers Rust natif WebAssembly les calculs matriciels et combinatoires intensifs
//! d'EpiGenome-SQ (`dnaGeneSequenceService.ts`) conformément à AGENTS.md :
//! - Matrice épistasique rétrécie K×K et covariance longitudinale de lignée ADN
//! - Stabilité inter-générationnelle des poids, synergie épistasique et pas Exponentiated Gradient
//! - Distances d'ordre de séquence Kendall-Tau & Spearman Footrule sur identifiants entiers O(K²)
//! - Évaluation Walk-Forward double ensemble (EpiGenome vs Baseline) et score de Brier en une passe

use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const TOTAL_NUMBERS: usize = 90;
const TICKET_SIZE: usize = 5;

#[wasm_bindgen]
pub struct EpigenomeMatrixWasmResult {
    pub num_genes: usize,
    epistatic_matrix_flat: Vec<f64>,
    evidence_samples_flat: Vec<f64>,
    gene_stability: Vec<f64>,
    epistatic_synergy: Vec<f64>,
    post_mortem_signal: Vec<f64>,
    raw_target_weights: Vec<f64>,
}

#[wasm_bindgen]
impl EpigenomeMatrixWasmResult {
    #[wasm_bindgen(getter)]
    pub fn epistatic_matrix_flat(&self) -> Vec<f64> {
        self.epistatic_matrix_flat.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn evidence_samples_flat(&self) -> Vec<f64> {
        self.evidence_samples_flat.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn gene_stability(&self) -> Vec<f64> {
        self.gene_stability.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn epistatic_synergy(&self) -> Vec<f64> {
        self.epistatic_synergy.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn post_mortem_signal(&self) -> Vec<f64> {
        self.post_mortem_signal.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn raw_target_weights(&self) -> Vec<f64> {
        self.raw_target_weights.clone()
    }
}

#[wasm_bindgen]
pub struct EpigenomeWalkForwardWasmResult {
    pub hits_top5_epi: u32,
    pub hits_top5_base: u32,
    pub hits_top10_epi: u32,
    pub hits_top10_base: u32,
    pub brier_epi: f64,
    pub brier_base: f64,
    pub expected_hits_top5_epi: f64,
    pub expected_hits_top5_base: f64,
    top5_epi: Vec<u8>,
    top5_base: Vec<u8>,
    epi_inc_probs: Vec<f64>,
}

#[wasm_bindgen]
impl EpigenomeWalkForwardWasmResult {
    #[wasm_bindgen(getter)]
    pub fn top5_epi(&self) -> Vec<u8> {
        self.top5_epi.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn top5_base(&self) -> Vec<u8> {
        self.top5_base.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn epi_inc_probs(&self) -> Vec<f64> {
        self.epi_inc_probs.clone()
    }
}

/// Noyau pur Rust (testable hors WASM) : covariance de lignée ADN, matrice épistasique K×K,
/// synergie épistasique et vecteur cible pré-projection Exponentiated Gradient.
#[allow(clippy::too_many_arguments)]
pub fn compute_epigenome_matrix_core(
    raw_epistasis_flat: &[f64],
    epistasis_samples_flat: &[f64],
    lineage_weights_flat: &[f64],
    num_lineage: usize,
    initial_weights: &[f64],
    arm_ids: &[u8],
    proof_flags: &[u8],
    proof_scores: &[f64],
    base_analysis_signals: &[f64],
    forced_zero_flags: &[u8],
    num_genes: usize,
    hurst: f64,
    entropy_norm: f64,
    total_evidence_units: f64,
) -> EpigenomeMatrixWasmResult {
    let k = num_genes;
    if k == 0 {
        return EpigenomeMatrixWasmResult {
            num_genes: 0,
            epistatic_matrix_flat: Vec::new(),
            evidence_samples_flat: Vec::new(),
            gene_stability: Vec::new(),
            epistatic_synergy: Vec::new(),
            post_mortem_signal: Vec::new(),
            raw_target_weights: Vec::new(),
        };
    }

    let mut raw_ep = vec![0.0f64; k * k];
    let mut samp_ep = vec![0.0f64; k * k];
    let copy_len = (k * k).min(raw_epistasis_flat.len()).min(epistasis_samples_flat.len());
    raw_ep[..copy_len].copy_from_slice(&raw_epistasis_flat[..copy_len]);
    samp_ep[..copy_len].copy_from_slice(&epistasis_samples_flat[..copy_len]);

    let uniform_share = 1.0 / (k as f64);

    // 1. Stabilité longitudinale & covariance de lignée ADN
    let effective_lineage = if k > 0 {
        num_lineage.min(lineage_weights_flat.len() / k)
    } else {
        0
    };

    let mut means = vec![0.0f64; k];
    let mut stds = vec![0.0f64; k];
    let mut gene_stability = vec![1.0f64; k];

    if effective_lineage >= 2 {
        let l_f = effective_lineage as f64;
        for g in 0..k {
            let mut sum = 0.0;
            for t in 0..effective_lineage {
                sum += lineage_weights_flat[t * k + g];
            }
            let mean = sum / l_f;
            means[g] = mean;
            let mut var = 0.0;
            for t in 0..effective_lineage {
                let d = lineage_weights_flat[t * k + g] - mean;
                var += d * d;
            }
            let std = (var / l_f).sqrt();
            stds[g] = std;
            gene_stability[g] = (-std / uniform_share).exp();
        }
    }

    if effective_lineage >= 3 {
        let l_f = effective_lineage as f64;
        let w_lin = l_f.sqrt() / (l_f.sqrt() + (k as f64).sqrt());
        for i in 0..k {
            if stds[i] <= 1e-7 {
                continue;
            }
            for j in (i + 1)..k {
                if stds[j] <= 1e-7 {
                    continue;
                }
                let mut cov = 0.0;
                for t in 0..effective_lineage {
                    cov += (lineage_weights_flat[t * k + i] - means[i])
                        * (lineage_weights_flat[t * k + j] - means[j]);
                }
                let corr = (cov / l_f) / (stds[i] * stds[j]);
                raw_ep[i * k + j] += corr * w_lin;
                raw_ep[j * k + i] += corr * w_lin;
                samp_ep[i * k + j] += w_lin;
                samp_ep[j * k + i] += w_lin;
            }
        }
    }

    // 2. Shrinkage continu vers l'indépendance 0
    let shrinkage_prior = (k as f64).sqrt();
    let mut epistatic_matrix = vec![0.0f64; k * k];
    for i in 0..k {
        for j in (i + 1)..k {
            let s = samp_ep[i * k + j];
            if s > 0.0 {
                let mean_raw = raw_ep[i * k + j] / s;
                let shrunk = ((s / (s + shrinkage_prior)) * mean_raw).clamp(-1.0, 1.0);
                epistatic_matrix[i * k + j] = shrunk;
                epistatic_matrix[j * k + i] = shrunk;
            }
        }
    }

    // 3. Synergie épistasique, signal post-mortem unifié & pas Exponentiated Gradient
    let sqrt_k = (k as f64).sqrt();
    let k_f = k as f64;
    let persistence_bias = (2.5 * (hurst - 0.5)).tanh();
    let complexity_bias = (2.0 * (entropy_norm - 0.5)).tanh();
    let eta = if total_evidence_units > 0.0 {
        1.0 / (k_f * (1.0 + 1.0 / total_evidence_units.sqrt())).sqrt()
    } else {
        1.0 / k_f
    };

    let mut epistatic_synergy = vec![0.0f64; k];
    let mut post_mortem_signal = vec![0.0f64; k];
    let mut raw_target_weights = vec![0.0f64; k];

    for i in 0..k {
        let forced_zero = forced_zero_flags.get(i).copied().unwrap_or(0) != 0;
        if forced_zero {
            epistatic_synergy[i] = 0.0;
            post_mortem_signal[i] = 0.0;
            raw_target_weights[i] = 0.0;
            continue;
        }

        let mut ep_sum = 0.0;
        let row_off = i * k;
        for j in 0..k {
            if j == i {
                continue;
            }
            let partner_w = initial_weights.get(j).copied().unwrap_or(uniform_share);
            let partner_excess = (partner_w - uniform_share) * k_f;
            ep_sum += epistatic_matrix[row_off + j] * partner_excess.tanh();
        }
        let ep_syn = (ep_sum / sqrt_k).tanh();
        epistatic_synergy[i] = ep_syn;

        let has_proof = proof_flags.get(i).copied().unwrap_or(0) != 0;
        let p_score = proof_scores.get(i).copied().unwrap_or(0.0);
        let proof_drive = (p_score / 2.0).tanh();
        let base_sig = base_analysis_signals.get(i).copied().unwrap_or(0.0);

        let composite = (0.65 * base_sig
            + 0.20 * if has_proof { proof_drive } else { proof_drive.min(0.0) }
            + 0.15 * ep_syn)
            .clamp(-1.0, 1.0);
        post_mortem_signal[i] = composite;

        let regime_mod = if !has_proof {
            0.0
        } else {
            let p_str = p_score.tanh();
            match arm_ids.get(i).copied().unwrap_or(0) {
                1 => -0.5 * persistence_bias * p_str,
                2 => 0.5 * complexity_bias * p_str,
                0 => 0.35 * (1.0 - persistence_bias.abs()) * p_str,
                _ => 0.4 * persistence_bias * p_str,
            }
        };

        let init_w = initial_weights.get(i).copied().unwrap_or(uniform_share);
        let base_w = if init_w > 0.0 { init_w } else { uniform_share };
        let stab_weight = 0.5 + 0.5 * gene_stability[i];
        let exponent = (eta * (composite + regime_mod) * stab_weight * sqrt_k).clamp(-2.5, 2.5);
        raw_target_weights[i] = base_w * exponent.exp();
    }

    EpigenomeMatrixWasmResult {
        num_genes: k,
        epistatic_matrix_flat: epistatic_matrix,
        evidence_samples_flat: samp_ep,
        gene_stability,
        epistatic_synergy,
        post_mortem_signal,
        raw_target_weights,
    }
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn compute_epigenome_matrix_wasm(
    raw_epistasis_flat: &[f64],
    epistasis_samples_flat: &[f64],
    lineage_weights_flat: &[f64],
    num_lineage: usize,
    initial_weights: &[f64],
    arm_ids: &[u8],
    proof_flags: &[u8],
    proof_scores: &[f64],
    base_analysis_signals: &[f64],
    forced_zero_flags: &[u8],
    num_genes: usize,
    hurst: f64,
    entropy_norm: f64,
    total_evidence_units: f64,
) -> EpigenomeMatrixWasmResult {
    compute_epigenome_matrix_core(
        raw_epistasis_flat,
        epistasis_samples_flat,
        lineage_weights_flat,
        num_lineage,
        initial_weights,
        arm_ids,
        proof_flags,
        proof_scores,
        base_analysis_signals,
        forced_zero_flags,
        num_genes,
        hurst,
        entropy_norm,
        total_evidence_units,
    )
}

/// Calcul O(K²) des distances normalisées d'ordre de séquence [Kendall-Tau, Spearman Footrule].
pub fn compute_sequence_order_metrics_core(seq_a: &[u32], seq_b: &[u32]) -> Vec<f64> {
    let common: Vec<u32> = seq_a.iter().copied().filter(|k| seq_b.contains(k)).collect();
    let n = common.len();
    if n < 2 {
        return vec![0.0, 0.0];
    }

    let find_pos = |arr: &[u32], target: u32| -> isize {
        arr.iter()
            .position(|&x| x == target)
            .map(|p| p as isize)
            .unwrap_or(0)
    };

    let mut discordant = 0usize;
    for i in 0..n {
        let r_bi = find_pos(seq_b, common[i]);
        for j in (i + 1)..n {
            let r_bj = find_pos(seq_b, common[j]);
            if r_bi > r_bj {
                discordant += 1;
            }
        }
    }

    let max_pairs = (n * (n - 1)) / 2;
    let kendall_tau = if max_pairs > 0 {
        (discordant as f64) / (max_pairs as f64)
    } else {
        0.0
    };

    let mut abs_diff_sum = 0usize;
    for &k in &common {
        let r_a = find_pos(seq_a, k);
        let r_b = find_pos(seq_b, k);
        abs_diff_sum += (r_a - r_b).unsigned_abs();
    }
    let max_footrule = (n * n) / 2;
    let spearman = if max_footrule > 0 {
        ((abs_diff_sum as f64) / (max_footrule as f64)).min(1.0)
    } else {
        0.0
    };

    vec![kendall_tau, spearman]
}

#[wasm_bindgen]
pub fn compute_sequence_order_metrics_wasm(seq_a: &[u32], seq_b: &[u32]) -> Vec<f64> {
    compute_sequence_order_metrics_core(seq_a, seq_b)
}

/// Évalue simultanément sur les 90 numéros les ensembles EpiGenome-SQ et Baseline
/// pour un pas hors-échantillon Walk-Forward.
pub fn score_epigenome_walk_forward_step_core(
    plugin_scores_flat: &[f64],
    epi_weights: &[f64],
    base_weights: &[f64],
    num_genes: usize,
    actual_winners: &[u8],
) -> EpigenomeWalkForwardWasmResult {
    let mut winner_mask = [false; TOTAL_NUMBERS + 1];
    for &w in actual_winners {
        let idx = w as usize;
        if (1..=TOTAL_NUMBERS).contains(&idx) {
            winner_mask[idx] = true;
        }
    }

    let mut epi_scores = [0.0f64; TOTAL_NUMBERS];
    let mut base_scores = [0.0f64; TOTAL_NUMBERS];

    let max_k = num_genes
        .min(epi_weights.len())
        .min(base_weights.len())
        .min(plugin_scores_flat.len() / TOTAL_NUMBERS);

    for k in 0..max_k {
        let w_epi = epi_weights[k];
        let w_base = base_weights[k];
        let row_off = k * TOTAL_NUMBERS;
        for n in 0..TOTAL_NUMBERS {
            let s = plugin_scores_flat[row_off + n];
            epi_scores[n] += s * w_epi;
            base_scores[n] += s * w_base;
        }
    }

    let evaluate_ensemble = |scores: &[f64; TOTAL_NUMBERS]| {
        let sum: f64 = scores.iter().sum();
        let mut brier = 0.0f64;
        let mut inc_probs = vec![0.0f64; TOTAL_NUMBERS];
        let mut ranked: Vec<(u8, f64)> = Vec::with_capacity(TOTAL_NUMBERS);

        for n in 0..TOTAL_NUMBERS {
            let prob = if sum > 0.0 {
                scores[n] / sum
            } else {
                1.0 / (TOTAL_NUMBERS as f64)
            };
            let p_inc = ((TICKET_SIZE as f64) * prob).clamp(0.0, 1.0);
            inc_probs[n] = p_inc;
            let y = if winner_mask[n + 1] { 1.0 } else { 0.0 };
            let diff = p_inc - y;
            brier += diff * diff;
            ranked.push(((n + 1) as u8, scores[n]));
        }

        ranked.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });

        let top5: Vec<u8> = ranked.iter().take(5).map(|r| r.0).collect();
        let hits5 = top5.iter().filter(|&&n| winner_mask[n as usize]).count() as u32;
        let hits10 = ranked
            .iter()
            .take(10)
            .filter(|r| winner_mask[r.0 as usize])
            .count() as u32;
        let exp_hits5: f64 = top5.iter().map(|&n| inc_probs[(n as usize) - 1]).sum();

        (hits5, hits10, brier / (TOTAL_NUMBERS as f64), exp_hits5, top5, inc_probs)
    };

    let (hits5_epi, hits10_epi, brier_epi, exp5_epi, top5_epi, epi_inc_probs) =
        evaluate_ensemble(&epi_scores);
    let (hits5_base, hits10_base, brier_base, exp5_base, top5_base, _) =
        evaluate_ensemble(&base_scores);

    EpigenomeWalkForwardWasmResult {
        hits_top5_epi: hits5_epi,
        hits_top5_base: hits5_base,
        hits_top10_epi: hits10_epi,
        hits_top10_base: hits10_base,
        brier_epi,
        brier_base,
        expected_hits_top5_epi: exp5_epi,
        expected_hits_top5_base: exp5_base,
        top5_epi,
        top5_base,
        epi_inc_probs,
    }
}

#[wasm_bindgen]
pub fn score_epigenome_walk_forward_step_wasm(
    plugin_scores_flat: &[f64],
    epi_weights: &[f64],
    base_weights: &[f64],
    num_genes: usize,
    actual_winners: &[u8],
) -> EpigenomeWalkForwardWasmResult {
    score_epigenome_walk_forward_step_core(
        plugin_scores_flat,
        epi_weights,
        base_weights,
        num_genes,
        actual_winners,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sequence_metrics_exact_bounds() {
        let a = vec![0u32, 1, 2, 3, 4];
        let b = vec![4u32, 3, 2, 1, 0];
        let same = compute_sequence_order_metrics_core(&a, &a);
        let rev = compute_sequence_order_metrics_core(&a, &b);
        assert!((same[0] - 0.0).abs() < 1e-12);
        assert!((same[1] - 0.0).abs() < 1e-12);
        assert!((rev[0] - 1.0).abs() < 1e-12);
        assert!((rev[1] - 1.0).abs() < 1e-12);
    }

    #[test]
    fn walk_forward_step_brier_in_unit_interval() {
        let k = 2;
        let mut flat = vec![0.5f64; k * 90];
        flat[4] = 1.0; // #5
        flat[90 + 4] = 1.0;
        let res = score_epigenome_walk_forward_step_core(
            &flat,
            &[0.5, 0.5],
            &[0.5, 0.5],
            k,
            &[5, 10, 15, 20, 25],
        );
        assert!(res.brier_epi >= 0.0 && res.brier_epi <= 1.0);
        assert_eq!(res.top5_epi[0], 5);
        assert!(res.hits_top5_epi >= 1);
    }
}
