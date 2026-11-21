//! # Noyau Épistasique & Génomique EpiGenome-SQ (Rust / WASM HPC)
//!
//! Porte vers Rust natif WebAssembly les calculs matriciels et combinatoires intensifs
//! d'EpiGenome-SQ (`dnaGeneSequenceService.ts`) conformément à AGENTS.md :
//! - Matrice épistasique rétrécie K×K sans circularité de lignée ni biais de clôture
//! - Stabilité longitudinale des poids, pondération par dispersion observée et pas Hedge / EG
//! - Distances d'ordre de séquence Kendall-Tau & Spearman Footrule sur identifiants entiers O(K²)
//! - Calibration Softmax à température τ avec projection exacte Σ q_n = 5, Log-Loss & AUC
//! - Évaluation Walk-Forward double ensemble (EpiGenome vs Baseline) et Hedge + Fixed-Share

use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const TOTAL_NUMBERS: usize = 90;
const TICKET_SIZE: usize = 5;
const PROB_EPSILON: f64 = 1e-6;

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
    pub log_loss_epi: f64,
    pub log_loss_base: f64,
    pub auc_epi: f64,
    pub auc_base: f64,
    pub expected_hits_top5_epi: f64,
    pub expected_hits_top5_base: f64,
    top5_epi: Vec<u8>,
    top5_base: Vec<u8>,
    epi_inc_probs: Vec<f64>,
    base_inc_probs: Vec<f64>,
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
    #[wasm_bindgen(getter)]
    pub fn base_inc_probs(&self) -> Vec<f64> {
        self.base_inc_probs.clone()
    }
}

/// Projection par water-filling exact (48 itérations de bissection) garantissant
/// ∀n q_n ∈ [1e-6, 1-1e-6] et Σ_{n=1}^{90} q_n = target_sum (= 5 pour 5/90).
pub fn project_simplex_to_coherent_marginals(raw_probs: &[f64], target_sum: f64) -> Vec<f64> {
    let n = raw_probs.len();
    if n == 0 {
        return Vec::new();
    }
    let clamped_target = target_sum.clamp(n as f64 * PROB_EPSILON, n as f64 * (1.0 - PROB_EPSILON));
    let safe_sum: f64 = raw_probs
        .iter()
        .map(|&v| if v.is_finite() && v > 0.0 { v } else { 0.0 })
        .sum();
    let uniform = 1.0 / (n as f64);

    let mut base = vec![0.0f64; n];
    for i in 0..n {
        let p = if safe_sum > 0.0 && raw_probs[i].is_finite() && raw_probs[i] > 0.0 {
            raw_probs[i] / safe_sum
        } else {
            uniform
        };
        base[i] = p;
    }

    let min_b = base.iter().copied().fold(f64::INFINITY, f64::min);
    let max_b = base.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let mut lo = PROB_EPSILON - clamped_target * max_b - 1.0;
    let mut hi = (1.0 - PROB_EPSILON) - clamped_target * min_b + 1.0;

    for _ in 0..48 {
        let mid = 0.5 * (lo + hi);
        let s: f64 = base
            .iter()
            .map(|&b| (clamped_target * b + mid).clamp(PROB_EPSILON, 1.0 - PROB_EPSILON))
            .sum();
        if s < clamped_target {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    let shift = 0.5 * (lo + hi);
    base.iter()
        .map(|&b| (clamped_target * b + shift).clamp(PROB_EPSILON, 1.0 - PROB_EPSILON))
        .collect()
}

/// Calibration Softmax à température τ suivie de projection exacte sur le simplexe Σ q_n = 5.
/// Lorsque τ → +∞ ou les scores sont constants, q_n = 5/90 exactement.
pub fn calibrate_scores_softmax_marginals(scores: &[f64], tau: f64) -> Vec<f64> {
    let n = scores.len();
    if n == 0 {
        return Vec::new();
    }
    let safe_tau = if tau.is_finite() && tau > 1e-4 { tau } else { 1.0 };
    let valid: Vec<f64> = scores
        .iter()
        .map(|&v| if v.is_finite() { v } else { 0.0 })
        .collect();
    let mean = valid.iter().sum::<f64>() / (n as f64);
    let var = valid.iter().map(|&v| (v - mean) * (v - mean)).sum::<f64>() / (n as f64);
    let std = var.sqrt();
    if std <= 1e-12 {
        return vec![(TICKET_SIZE as f64) / (n as f64); n];
    }

    let max_z = valid
        .iter()
        .map(|&v| ((v - mean) / std) / safe_tau)
        .fold(f64::NEG_INFINITY, f64::max);
    let mut exps = vec![0.0f64; n];
    let mut sum_exp = 0.0;
    for i in 0..n {
        let z = ((valid[i] - mean) / std) / safe_tau;
        let e = (z - max_z).clamp(-60.0, 0.0).exp();
        exps[i] = e;
        sum_exp += e;
    }
    if sum_exp > 0.0 {
        for v in &mut exps {
            *v /= sum_exp;
        }
    }
    project_simplex_to_coherent_marginals(&exps, TICKET_SIZE as f64)
}

/// AUC Mann-Whitney exacte sur 90 numéros avec gestion exacte des ex-aequo (rangs moyens).
pub fn compute_rank_auc(scores: &[f64], winner_mask: &[bool]) -> f64 {
    let n = scores.len();
    if n < 2 || winner_mask.len() < n {
        return 0.5;
    }
    let n_pos = (0..n).filter(|&i| winner_mask[i]).count();
    let n_neg = n - n_pos;
    if n_pos == 0 || n_neg == 0 {
        return 0.5;
    }

    let mut idx_scores: Vec<(usize, f64)> = scores
        .iter()
        .enumerate()
        .map(|(i, &s)| (i, if s.is_finite() { s } else { 0.0 }))
        .collect();
    idx_scores.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(Ordering::Equal).then_with(|| a.0.cmp(&b.0)));

    let mut ranks = vec![0.0f64; n];
    let mut i = 0;
    while i < n {
        let mut j = i + 1;
        while j < n && (idx_scores[j].1 - idx_scores[i].1).abs() <= 1e-12 {
            j += 1;
        }
        let avg_rank = 0.5 * ((i + 1 + j) as f64);
        for k in i..j {
            ranks[idx_scores[k].0] = avg_rank;
        }
        i = j;
    }

    let sum_pos_ranks: f64 = (0..n).filter(|&idx| winner_mask[idx]).map(|idx| ranks[idx]).sum();
    let u = sum_pos_ranks - ((n_pos * (n_pos + 1)) as f64) * 0.5;
    (u / ((n_pos * n_neg) as f64)).clamp(0.0, 1.0)
}

fn population_std(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    let m = vals.iter().sum::<f64>() / (vals.len() as f64);
    let v = vals.iter().map(|&x| (x - m) * (x - m)).sum::<f64>() / (vals.len() as f64);
    v.sqrt()
}

/// Noyau pur Rust (testable hors WASM) avec crédibilité Empirical-Bayes continue `cred ∈ [0.0, 1.0]` :
/// - Stabilité longitudinale des poids (SANS réinjecter la covariance circulaire des poids d'optimiseur
///   dans la matrice épistasique).
/// - Synergie épistasique pondérée par la fiabilité neutre des partenaires (sans biais auto-entretenu par initial_weights).
/// - Modulation continue C^∞ de l'évidence positive et du régime chromosomique par `proof_credibilities`
///   (aucun seuil binaire discontinu).
/// - Fusion des 3 signaux (base, proof, épistasie) par dispersion inverse observée (zéro constantes arbitraires).
#[allow(clippy::too_many_arguments)]
pub fn compute_epigenome_matrix_continuous_core(
    raw_epistasis_flat: &[f64],
    epistasis_samples_flat: &[f64],
    lineage_weights_flat: &[f64],
    num_lineage: usize,
    initial_weights: &[f64],
    arm_ids: &[u8],
    proof_credibilities: &[f64],
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

    // 1. Stabilité longitudinale de lignée ADN uniquement (zéro corrélation circulaire sur les poids)
    let effective_lineage = num_lineage.min(lineage_weights_flat.len() / k);
    let mut gene_stability = vec![1.0f64; k];

    if effective_lineage >= 2 {
        let l_f = effective_lineage as f64;
        for g in 0..k {
            let mut sum = 0.0;
            for t in 0..effective_lineage {
                sum += lineage_weights_flat[t * k + g];
            }
            let mean = sum / l_f;
            let mut var = 0.0;
            for t in 0..effective_lineage {
                let d = lineage_weights_flat[t * k + g] - mean;
                var += d * d;
            }
            let std = (var / l_f).sqrt();
            gene_stability[g] = (-std / uniform_share).exp();
        }
    }

    // 2. Shrinkage continu vers l'indépendance 0 avec prior dimensionnel √K
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

    let sqrt_k = (k as f64).sqrt();
    let k_f = k as f64;
    let persistence_bias = (2.5 * (hurst - 0.5)).tanh();
    let complexity_bias = (2.0 * (entropy_norm - 0.5)).tanh();
    let eta = if total_evidence_units > 0.0 {
        1.0 / (k_f * (1.0 + 1.0 / total_evidence_units.sqrt())).sqrt()
    } else {
        1.0 / k_f
    };

    // 3. Synergie épistasique pondérée par la preuve neutre du partenaire (pas par initial_weights!)
    let mut epistatic_synergy = vec![0.0f64; k];
    let mut active_base = Vec::with_capacity(k);
    let mut active_proof = Vec::with_capacity(k);
    let mut active_ep = Vec::with_capacity(k);

    let mut proof_drive_vec = vec![0.0f64; k];
    let mut base_vec = vec![0.0f64; k];

    for i in 0..k {
        let forced_zero = forced_zero_flags.get(i).copied().unwrap_or(0) != 0;
        if forced_zero {
            continue;
        }
        let mut ep_sum = 0.0;
        let row_off = i * k;
        for j in 0..k {
            if j == i || forced_zero_flags.get(j).copied().unwrap_or(0) != 0 {
                continue;
            }
            let partner_p = proof_scores.get(j).copied().unwrap_or(0.0);
            let partner_sig = base_analysis_signals.get(j).copied().unwrap_or(0.0);
            let partner_reliability = 0.5 * partner_p.tanh() + 0.5 * partner_sig.tanh();
            ep_sum += epistatic_matrix[row_off + j] * partner_reliability;
        }
        let ep_syn = (ep_sum / sqrt_k).tanh();
        epistatic_synergy[i] = ep_syn;

        let p_score = proof_scores.get(i).copied().unwrap_or(0.0);
        let p_drive = (p_score / 2.0).tanh();
        let raw_cred = proof_credibilities.get(i).copied().unwrap_or(0.0);
        let cred = if raw_cred.is_finite() { raw_cred.clamp(0.0, 1.0) } else { 0.0 };
        // Pénalités libres sous H0 ; composante positive modulée continûment par cred ∈ [0, 1]
        let p_signed = if p_drive > 0.0 { p_drive * cred } else { p_drive };
        let b_sig = base_analysis_signals.get(i).copied().unwrap_or(0.0);

        proof_drive_vec[i] = p_signed;
        base_vec[i] = b_sig;

        active_base.push(b_sig);
        active_proof.push(p_signed);
        active_ep.push(ep_syn);
    }

    // Pondération objective par dispersion observée (Zéro constantes arbitraires 0.65 / 0.20 / 0.15)
    let sd_b = population_std(&active_base);
    let sd_p = population_std(&active_proof);
    let sd_e = population_std(&active_ep);
    let sd_sum = sd_b + sd_p + sd_e;
    let (wb, wp, we) = if sd_sum > 1e-12 {
        (sd_b / sd_sum, sd_p / sd_sum, sd_e / sd_sum)
    } else {
        (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)
    };

    let mut post_mortem_signal = vec![0.0f64; k];
    let mut raw_target_weights = vec![0.0f64; k];
    let stab_floor = 1.0 / sqrt_k;

    for i in 0..k {
        let forced_zero = forced_zero_flags.get(i).copied().unwrap_or(0) != 0;
        if forced_zero {
            epistatic_synergy[i] = 0.0;
            post_mortem_signal[i] = 0.0;
            raw_target_weights[i] = 0.0;
            continue;
        }

        let composite = (wb * base_vec[i] + wp * proof_drive_vec[i] + we * epistatic_synergy[i]).clamp(-1.0, 1.0);
        post_mortem_signal[i] = composite;

        let raw_cred = proof_credibilities.get(i).copied().unwrap_or(0.0);
        let cred = if raw_cred.is_finite() { raw_cred.clamp(0.0, 1.0) } else { 0.0 };
        let p_score = proof_scores.get(i).copied().unwrap_or(0.0);
        let p_str = p_score.tanh() * cred;
        let arm_scale = 1.0 / sqrt_k;
        let regime_mod = match arm_ids.get(i).copied().unwrap_or(0) {
            1 => -arm_scale * persistence_bias * p_str,
            2 => arm_scale * complexity_bias * p_str,
            0 => arm_scale * (1.0 - persistence_bias.abs()) * p_str,
            _ => arm_scale * persistence_bias * p_str,
        };

        let init_w = initial_weights.get(i).copied().unwrap_or(uniform_share);
        let base_w = if init_w > 0.0 { init_w } else { uniform_share };
        let stab_weight = stab_floor + (1.0 - stab_floor) * gene_stability[i];
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

/// Délégation rétro-compatible pour les appelants passant des indicateurs binaires `proof_flags`.
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
    let cred_vec: Vec<f64> = (0..num_genes)
        .map(|i| {
            if proof_flags.get(i).copied().unwrap_or(0) != 0 {
                1.0
            } else {
                0.0
            }
        })
        .collect();
    compute_epigenome_matrix_continuous_core(
        raw_epistasis_flat,
        epistasis_samples_flat,
        lineage_weights_flat,
        num_lineage,
        initial_weights,
        arm_ids,
        &cred_vec,
        proof_scores,
        base_analysis_signals,
        forced_zero_flags,
        num_genes,
        hurst,
        entropy_norm,
        total_evidence_units,
    )
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn compute_epigenome_matrix_continuous_wasm(
    raw_epistasis_flat: &[f64],
    epistasis_samples_flat: &[f64],
    lineage_weights_flat: &[f64],
    num_lineage: usize,
    initial_weights: &[f64],
    arm_ids: &[u8],
    proof_credibilities: &[f64],
    proof_scores: &[f64],
    base_analysis_signals: &[f64],
    forced_zero_flags: &[u8],
    num_genes: usize,
    hurst: f64,
    entropy_norm: f64,
    total_evidence_units: f64,
) -> EpigenomeMatrixWasmResult {
    compute_epigenome_matrix_continuous_core(
        raw_epistasis_flat,
        epistasis_samples_flat,
        lineage_weights_flat,
        num_lineage,
        initial_weights,
        arm_ids,
        proof_credibilities,
        proof_scores,
        base_analysis_signals,
        forced_zero_flags,
        num_genes,
        hurst,
        entropy_norm,
        total_evidence_units,
    )
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

/// Évaluation calibrée Softmax (température τ), Brier, Log-Loss, AUC et Top-5/10.
pub fn score_epigenome_walk_forward_step_calibrated_core(
    plugin_scores_flat: &[f64],
    epi_weights: &[f64],
    base_weights: &[f64],
    num_genes: usize,
    actual_winners: &[u8],
    tau_epi: f64,
    tau_base: f64,
) -> EpigenomeWalkForwardWasmResult {
    let mut winner_mask = [false; TOTAL_NUMBERS + 1];
    let mut winner_mask_zero_idx = [false; TOTAL_NUMBERS];
    for &w in actual_winners {
        let idx = w as usize;
        if (1..=TOTAL_NUMBERS).contains(&idx) {
            winner_mask[idx] = true;
            winner_mask_zero_idx[idx - 1] = true;
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

    let evaluate_ensemble = |scores: &[f64; TOTAL_NUMBERS], tau: f64| {
        let inc_probs = calibrate_scores_softmax_marginals(scores, tau);
        let mut brier = 0.0f64;
        let mut log_loss = 0.0f64;
        let mut ranked: Vec<(u8, f64)> = Vec::with_capacity(TOTAL_NUMBERS);

        for n in 0..TOTAL_NUMBERS {
            let p_inc = inc_probs[n].clamp(PROB_EPSILON, 1.0 - PROB_EPSILON);
            let y = if winner_mask[n + 1] { 1.0 } else { 0.0 };
            let diff = p_inc - y;
            brier += diff * diff;
            log_loss -= y * p_inc.ln() + (1.0 - y) * (1.0 - p_inc).ln();
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
        let auc = compute_rank_auc(scores, &winner_mask_zero_idx);

        (
            hits5,
            hits10,
            brier / (TOTAL_NUMBERS as f64),
            log_loss / (TOTAL_NUMBERS as f64),
            auc,
            exp_hits5,
            top5,
            inc_probs,
        )
    };

    let (hits5_epi, hits10_epi, brier_epi, ll_epi, auc_epi, exp5_epi, top5_epi, epi_inc_probs) =
        evaluate_ensemble(&epi_scores, tau_epi);
    let (hits5_base, hits10_base, brier_base, ll_base, auc_base, exp5_base, top5_base, base_inc_probs) =
        evaluate_ensemble(&base_scores, tau_base);

    EpigenomeWalkForwardWasmResult {
        hits_top5_epi: hits5_epi,
        hits_top5_base: hits5_base,
        hits_top10_epi: hits10_epi,
        hits_top10_base: hits10_base,
        brier_epi,
        brier_base,
        log_loss_epi: ll_epi,
        log_loss_base: ll_base,
        auc_epi,
        auc_base,
        expected_hits_top5_epi: exp5_epi,
        expected_hits_top5_base: exp5_base,
        top5_epi,
        top5_base,
        epi_inc_probs,
        base_inc_probs,
    }
}

pub fn score_epigenome_walk_forward_step_core(
    plugin_scores_flat: &[f64],
    epi_weights: &[f64],
    base_weights: &[f64],
    num_genes: usize,
    actual_winners: &[u8],
) -> EpigenomeWalkForwardWasmResult {
    score_epigenome_walk_forward_step_calibrated_core(
        plugin_scores_flat,
        epi_weights,
        base_weights,
        num_genes,
        actual_winners,
        1.0,
        1.0,
    )
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

#[wasm_bindgen]
pub fn score_epigenome_walk_forward_step_calibrated_wasm(
    plugin_scores_flat: &[f64],
    epi_weights: &[f64],
    base_weights: &[f64],
    num_genes: usize,
    actual_winners: &[u8],
    tau_epi: f64,
    tau_base: f64,
) -> EpigenomeWalkForwardWasmResult {
    score_epigenome_walk_forward_step_calibrated_core(
        plugin_scores_flat,
        epi_weights,
        base_weights,
        num_genes,
        actual_winners,
        tau_epi,
        tau_base,
    )
}

/// Pas Hedge + Fixed-Share de Herbster & Warmuth (1998) pour régimes non stationnaires :
/// - η = sqrt(8 * ln(K) / T), α = 1 / max(2, T)
/// - Mise à jour exponentielle sur pertes normalisées dans [0, 1]
/// - Mélange Fixed-Share vers un prior (ex. a priori forensique rétréci) + masquage forced_zero
pub fn compute_hedge_fixed_share_step_core(
    current_weights: &[f64],
    channel_losses: &[f64],
    prior_weights: &[f64],
    forced_zero_flags: &[u8],
    horizon_t: f64,
) -> Vec<f64> {
    let k = current_weights.len();
    if k == 0 {
        return Vec::new();
    }
    let active_count = (0..k)
        .filter(|&i| forced_zero_flags.get(i).copied().unwrap_or(0) == 0)
        .count()
        .max(1);
    let safe_t = horizon_t.max(2.0);
    let eta = (8.0 * (active_count as f64).max(2.0).ln() / safe_t).sqrt();
    let alpha = 1.0 / safe_t;

    let mut post = vec![0.0f64; k];
    let mut sum_post = 0.0;
    for i in 0..k {
        if forced_zero_flags.get(i).copied().unwrap_or(0) != 0 {
            post[i] = 0.0;
            continue;
        }
        let w = if current_weights[i].is_finite() && current_weights[i] > 0.0 {
            current_weights[i]
        } else {
            1.0 / (active_count as f64)
        };
        let loss = channel_losses.get(i).copied().unwrap_or(0.5).clamp(0.0, 1.0);
        let val = w * (-eta * loss).exp();
        post[i] = val;
        sum_post += val;
    }

    if sum_post > 0.0 {
        for v in &mut post {
            *v /= sum_post;
        }
    } else {
        let u = 1.0 / (active_count as f64);
        for i in 0..k {
            post[i] = if forced_zero_flags.get(i).copied().unwrap_or(0) != 0 { 0.0 } else { u };
        }
    }

    let mut prior_clean = vec![0.0f64; k];
    let mut sum_prior = 0.0;
    for i in 0..k {
        if forced_zero_flags.get(i).copied().unwrap_or(0) != 0 {
            continue;
        }
        let pw = prior_weights.get(i).copied().unwrap_or(1.0 / (active_count as f64));
        if pw.is_finite() && pw > 0.0 {
            prior_clean[i] = pw;
            sum_prior += pw;
        }
    }
    if sum_prior > 0.0 {
        for v in &mut prior_clean {
            *v /= sum_prior;
        }
    } else {
        let u = 1.0 / (active_count as f64);
        for i in 0..k {
            prior_clean[i] = if forced_zero_flags.get(i).copied().unwrap_or(0) != 0 { 0.0 } else { u };
        }
    }

    let mut out = vec![0.0f64; k];
    let mut sum_out = 0.0;
    for i in 0..k {
        if forced_zero_flags.get(i).copied().unwrap_or(0) != 0 {
            out[i] = 0.0;
        } else {
            out[i] = (1.0 - alpha) * post[i] + alpha * prior_clean[i];
            sum_out += out[i];
        }
    }
    if sum_out > 0.0 {
        for v in &mut out {
            *v /= sum_out;
        }
    }
    out
}

#[wasm_bindgen]
pub fn compute_hedge_fixed_share_step_wasm(
    current_weights: &[f64],
    channel_losses: &[f64],
    prior_weights: &[f64],
    forced_zero_flags: &[u8],
    horizon_t: f64,
) -> Vec<f64> {
    compute_hedge_fixed_share_step_core(
        current_weights,
        channel_losses,
        prior_weights,
        forced_zero_flags,
        horizon_t,
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
    fn softmax_marginals_exact_sum_and_auc() {
        let scores: Vec<f64> = (1..=90).map(|i| (i as f64) / 90.0).collect();
        let m = calibrate_scores_softmax_marginals(&scores, 0.8);
        let sum: f64 = m.iter().sum();
        assert!((sum - 5.0).abs() < 1e-5);
        assert!(m.iter().all(|&p| (PROB_EPSILON..=1.0 - PROB_EPSILON).contains(&p)));

        let mut mask = vec![false; 90];
        for n in [86usize, 87, 88, 89, 90] {
            mask[n - 1] = true;
        }
        let auc = compute_rank_auc(&scores, &mask);
        assert!((auc - 1.0).abs() < 1e-12);
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
        assert!(res.log_loss_epi > 0.0);
        assert!(res.auc_epi >= 0.5);
        assert_eq!(res.top5_epi[0], 5);
        assert!(res.hits_top5_epi >= 1);
    }

    #[test]
    fn hedge_fixed_share_maintains_simplex_and_zeros() {
        let next = compute_hedge_fixed_share_step_core(
            &[0.25, 0.25, 0.25, 0.25],
            &[0.1, 0.5, 0.6, 0.0],
            &[0.25, 0.25, 0.25, 0.25],
            &[0, 0, 0, 1],
            12.0,
        );
        assert_eq!(next[3], 0.0);
        assert!(next[0] > next[1]);
        let sum: f64 = next.iter().sum();
        assert!((sum - 1.0).abs() < 1e-10);
    }

    #[test]
    fn epigenome_continuous_credibility_is_monotonic_and_respects_zeros() {
        let k = 3;
        let raw_ep = vec![0.0; k * k];
        let samp_ep = vec![0.0; k * k];
        let lineage = vec![1.0 / 3.0; k * 2];
        let init_w = vec![0.33, 0.33, 0.34];
        let arm_ids = vec![0u8, 1, 2];
        let proof_scores = vec![2.5, 0.8, 0.0];
        let base_sigs = vec![0.2, 0.2, 0.0];
        let forced_zero = vec![0u8, 0, 1];

        let low = compute_epigenome_matrix_continuous_core(
            &raw_ep,
            &samp_ep,
            &lineage,
            2,
            &init_w,
            &arm_ids,
            &[0.1, 0.1, 0.0],
            &proof_scores,
            &base_sigs,
            &forced_zero,
            k,
            0.55,
            0.9,
            10.0,
        );
        let mid = compute_epigenome_matrix_continuous_core(
            &raw_ep,
            &samp_ep,
            &lineage,
            2,
            &init_w,
            &arm_ids,
            &[0.5, 0.1, 0.0],
            &proof_scores,
            &base_sigs,
            &forced_zero,
            k,
            0.55,
            0.9,
            10.0,
        );
        let high = compute_epigenome_matrix_continuous_core(
            &raw_ep,
            &samp_ep,
            &lineage,
            2,
            &init_w,
            &arm_ids,
            &[0.95, 0.1, 0.0],
            &proof_scores,
            &base_sigs,
            &forced_zero,
            k,
            0.55,
            0.9,
            10.0,
        );

        assert_eq!(low.raw_target_weights[2], 0.0);
        assert_eq!(high.raw_target_weights[2], 0.0);
        assert!(low.raw_target_weights[0] < mid.raw_target_weights[0]);
        assert!(mid.raw_target_weights[0] < high.raw_target_weights[0]);
    }
}
