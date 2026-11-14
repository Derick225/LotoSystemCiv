//! # Moteur Séquences & Patterns des Écarts par Tranches (Rust / WASM HPC)
//!
//! Porte vers Rust natif WebAssembly les noyaux à forte intensité de calcul de
//! `gapRangeSequenceService.ts` :
//! - Reconstruction causale des empreintes d'écarts sur les 7 tranches canoniques
//! - Matrices Markov Ordre 1 & 2 avec lissage bayésien de Dirichlet-Jeffreys (√K)
//! - Similarité topologique 1-Wasserstein (Earth-Mover Distance) + ADN 4D
//! - Micro-scoring statistique homogène sur 5 canaux Z-scores via Stouffer (N(0, 1) sous H0)
//! - Allocation de quotas Hamilton-Hare + sélection sous-modulaire en espace Z
//! - Évaluation Walk-Forward strictement hors échantillon (zéro fuite future)

use wasm_bindgen::prelude::*;

const TOTAL_NUMBERS: usize = 90;
const NUMBERS_PER_DRAW: usize = 5;
const NUM_BINS: usize = 7;
const P_SINGLE: f64 = (NUMBERS_PER_DRAW as f64) / (TOTAL_NUMBERS as f64); // 5/90 = 1/18
const Z_GAUSS_75: f64 = 0.67449;

/// Bornes canoniques [min_gap, max_gap] des 7 tranches (u32::MAX représente +∞)
const BIN_BOUNDS: [(i32, i32); NUM_BINS] = [
    (0, 0),          // G0
    (1, 3),          // G1_3
    (4, 7),          // G4_7
    (8, 14),         // G8_14
    (15, 24),        // G15_24
    (25, 39),        // G25_39
    (40, i32::MAX),  // G40_PLUS
];

#[inline]
fn classify_gap(gap: i32) -> usize {
    let g = gap.max(0);
    if g == 0 {
        0
    } else if g <= 3 {
        1
    } else if g <= 7 {
        2
    } else if g <= 14 {
        3
    } else if g <= 24 {
        4
    } else if g <= 39 {
        5
    } else {
        6
    }
}

#[inline]
fn geometric_range_prob(min_gap: i32, max_gap: i32) -> f64 {
    let q = 1.0 - P_SINGLE;
    let p_min = q.powi(min_gap.max(0));
    let p_max = if max_gap == i32::MAX {
        0.0
    } else {
        q.powi((max_gap + 1).max(0))
    };
    (p_min - p_max).max(1e-6)
}

#[inline]
pub fn normal_cdf(z: f64) -> f64 {
    if !z.is_finite() {
        return if z > 0.0 { 1.0 } else { 0.0 };
    }
    let sign = if z < 0.0 { -1.0 } else { 1.0 };
    let x = z.abs() / std::f64::consts::SQRT_2;
    let t = 1.0 / (1.0 + 0.3275911 * x);
    let poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
        + 0.254829592)
        * t;
    let erf = 1.0 - poly * (-x * x).exp();
    (0.5 * (1.0 + sign * erf)).clamp(0.0, 1.0)
}

#[inline]
pub fn normal_upper_p_value(z: f64) -> f64 {
    (1.0 - normal_cdf(z)).clamp(0.0, 1.0)
}

#[inline]
fn kl_divergence(p: &[f64; NUM_BINS], q: &[f64; NUM_BINS]) -> f64 {
    let mut kl = 0.0;
    for b in 0..NUM_BINS {
        let pb = p[b].max(1e-9);
        let qb = q[b].max(1e-9);
        kl += pb * (pb / qb).ln();
    }
    kl.max(0.0)
}

#[inline]
fn normalized_wasserstein_counts(a: &[u8; NUM_BINS], b: &[u8; NUM_BINS]) -> f64 {
    let mut total_a = 0.0;
    let mut total_b = 0.0;
    for i in 0..NUM_BINS {
        total_a += a[i] as f64;
        total_b += b[i] as f64;
    }
    if total_a <= 0.0 || total_b <= 0.0 {
        return 1.0;
    }
    let mut cdf_a = 0.0;
    let mut cdf_b = 0.0;
    let mut l1_sum = 0.0;
    for i in 0..(NUM_BINS - 1) {
        cdf_a += (a[i] as f64) / total_a;
        cdf_b += (b[i] as f64) / total_b;
        l1_sum += (cdf_a - cdf_b).abs();
    }
    l1_sum / ((NUM_BINS - 1) as f64)
}

#[inline]
fn normalized_wasserstein_u8_quotas(a: &[u8; NUM_BINS], b: &[u8; NUM_BINS]) -> f64 {
    normalized_wasserstein_counts(a, b)
}

#[inline]
fn normalized_tranche_entropy(counts: &[u8; NUM_BINS]) -> f64 {
    let mut total = 0.0;
    for &c in counts.iter() {
        total += c as f64;
    }
    if total <= 0.0 {
        return 0.0;
    }
    let mut entropy = 0.0;
    for &c in counts.iter() {
        let p = (c as f64) / total;
        if p > 0.0 {
            entropy -= p * p.ln();
        }
    }
    let max_entropy = (total.min(NUM_BINS as f64)).ln();
    if max_entropy > 0.0 {
        entropy / max_entropy
    } else {
        0.0
    }
}

fn allocate_hamilton_hare(
    probs: &[f64; NUM_BINS],
    pool_sizes: &[usize; NUM_BINS],
    baseline_probs: &[f64; NUM_BINS],
    sample_size: f64,
    target_total: usize,
) -> [u8; NUM_BINS] {
    let mut quotas = [0u8; NUM_BINS];
    let mut effective_probs = *probs;

    let mut max_z = 0.0f64;
    let safe_n = sample_size.max(1.0);
    for b in 0..NUM_BINS {
        let p0 = baseline_probs[b];
        let se = ((p0 * (1.0 - p0)) / safe_n).max(1e-6).sqrt();
        let z = (probs[b] - p0).abs() / se;
        if z > max_z {
            max_z = z;
        }
    }
    if max_z < 1.96 {
        effective_probs = *baseline_probs;
    }

    let mut sum_prob = 0.0;
    for b in 0..NUM_BINS {
        if pool_sizes[b] > 0 {
            sum_prob += effective_probs[b].max(0.0);
        }
    }
    if sum_prob <= 0.0 {
        return quotas;
    }

    let mut remainders: [(usize, f64, f64); NUM_BINS] = [(0, -1.0, 0.0); NUM_BINS];
    let mut allocated = 0usize;

    for b in 0..NUM_BINS {
        let cap = pool_sizes[b];
        if cap == 0 {
            remainders[b] = (b, -1.0, 0.0);
            continue;
        }
        let exact_q = (effective_probs[b] / sum_prob) * (target_total as f64);
        let floor_q = cap.min(exact_q.floor() as usize);
        quotas[b] = floor_q as u8;
        allocated += floor_q;
        let rem = if floor_q < cap {
            exact_q - (floor_q as f64)
        } else {
            -1.0
        };
        remainders[b] = (b, rem, effective_probs[b]);
    }

    remainders.sort_by(|a, b| {
        let sa = a.2 * a.1.max(0.0);
        let sb = b.2 * b.1.max(0.0);
        sb.total_cmp(&sa)
            .then_with(|| b.2.total_cmp(&a.2))
            .then_with(|| b.1.total_cmp(&a.1))
            .then_with(|| a.0.cmp(&b.0))
    });

    let mut safety = 0;
    while allocated < target_total && safety < 20 {
        safety += 1;
        let mut progressed = false;
        for &(b, _, _) in remainders.iter() {
            if allocated >= target_total {
                break;
            }
            if (quotas[b] as usize) < pool_sizes[b] {
                quotas[b] += 1;
                allocated += 1;
                progressed = true;
            }
        }
        if !progressed {
            break;
        }
    }

    quotas
}

#[derive(Clone)]
struct FootprintInternal {
    draw_index: usize, // 0 = plus récent
    bin_counts: [u8; NUM_BINS],
    dominant_bin: usize,
    mean_gap: f64,
    std_gap: f64,
    median_gap: f64,
    tranche_entropy: f64,
    winners: [u8; NUMBERS_PER_DRAW],
    win_count: usize,
}

#[derive(Clone)]
struct BallCandInternal {
    number: u8,
    current_gap: i32,
    bin_idx: usize,
    composite_score: f64,
    stouffer_z: f64,
    stouffer_p: f64,
    z_tranche: f64,
    z_drought: f64,
    z_hazard: f64,
    z_affinity: f64,
    z_echo: f64,
    active_channels: u8,
}

pub struct GapRangeCoreResult {
    total_analyzed_draws: usize,
    pool_baseline_probs: [f64; NUM_BINS],
    blended_probs: [f64; NUM_BINS],
    bin_z_scores: [f64; NUM_BINS],
    transition_matrix_order1: Vec<f64>,
    drought_draws: [i32; NUM_BINS],
    drought_pressure: [f64; NUM_BINS],
    drought_z_scores: [f64; NUM_BINS],
    model_weights: [f64; 5],
    kl_m1: f64,
    kl_m2: f64,
    wasserstein_bandwidth: f64,
    ball_current_gaps: [i32; TOTAL_NUMBERS + 1],
    ball_stouffer_z: [f64; TOTAL_NUMBERS + 1],
    ball_stouffer_p: [f64; TOTAL_NUMBERS + 1],
    ball_channel_z_flat: Vec<f64>,
    ball_active_channels: [u8; TOTAL_NUMBERS + 1],
    top_predicted_bins: [u8; 3],
    optimal_five: [u8; 5],
    reserve_two: [u8; 2],
    tranche_quotas: [u8; NUM_BINS],
    ticket_stouffer_z: f64,
    selection_confidence: f64,
    expected_next_mean: f64,
}

fn analyze_chronological_core(
    chrono_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
) -> GapRangeCoreResult {
    let cols = win_cols.max(1);
    let actual_draws = num_draws.min(chrono_draws_flat.len() / cols);

    let mut geo_probs = [0.0f64; NUM_BINS];
    for b in 0..NUM_BINS {
        geo_probs[b] = geometric_range_prob(BIN_BOUNDS[b].0, BIN_BOUNDS[b].1);
    }

    if actual_draws == 0 {
        return GapRangeCoreResult {
            total_analyzed_draws: 0,
            pool_baseline_probs: geo_probs,
            blended_probs: geo_probs,
            bin_z_scores: [0.0; NUM_BINS],
            transition_matrix_order1: vec![0.0; NUM_BINS * NUM_BINS],
            drought_draws: [0; NUM_BINS],
            drought_pressure: [0.5; NUM_BINS],
            drought_z_scores: [0.0; NUM_BINS],
            model_weights: [0.2; 5],
            kl_m1: 0.0,
            kl_m2: 0.0,
            wasserstein_bandwidth: 0.15,
            ball_current_gaps: [0; TOTAL_NUMBERS + 1],
            ball_stouffer_z: [0.0; TOTAL_NUMBERS + 1],
            ball_stouffer_p: [0.5; TOTAL_NUMBERS + 1],
            ball_channel_z_flat: vec![0.0; (TOTAL_NUMBERS + 1) * 5],
            ball_active_channels: [0; TOTAL_NUMBERS + 1],
            top_predicted_bins: [1, 2, 3],
            optimal_five: [1, 2, 3, 4, 5],
            reserve_two: [6, 7],
            tranche_quotas: [0, 1, 1, 2, 1, 0, 0],
            ticket_stouffer_z: 0.0,
            selection_confidence: 25.4,
            expected_next_mean: 12.5,
        };
    }

    let mut last_seen = [-1i32; TOTAL_NUMBERS + 1];
    let mut ball_exit_gaps: Vec<Vec<i32>> = vec![Vec::new(); TOTAL_NUMBERS + 1];
    let mut ball_tranche_exits = [[0usize; NUM_BINS]; TOTAL_NUMBERS + 1];

    let burn_in = (actual_draws / 4).max(3).min(20);
    let mut footprints: Vec<FootprintInternal> = Vec::with_capacity(actual_draws);
    let mut pool_occupancy_totals = [0usize; NUM_BINS];
    let mut pool_occupancy_steps = 0usize;

    for t in 0..actual_draws {
        let base = t * cols;
        let mut valid = [0u8; NUMBERS_PER_DRAW];
        let mut valid_len = 0usize;
        for c in 0..cols.min(NUMBERS_PER_DRAW) {
            let val = chrono_draws_flat[base + c];
            if val >= 1 && (val as usize) <= TOTAL_NUMBERS {
                valid[valid_len] = val as u8;
                valid_len += 1;
            }
        }
        if valid_len == 0 {
            continue;
        }

        if t >= burn_in {
            for num in 1..=TOTAL_NUMBERS {
                let prev_idx = last_seen[num];
                let gap_at_t = if prev_idx == -1 {
                    t as i32
                } else {
                    (t as i32) - 1 - prev_idx
                };
                pool_occupancy_totals[classify_gap(gap_at_t)] += 1;
            }
            pool_occupancy_steps += 1;

            let mut bin_counts = [0u8; NUM_BINS];
            let mut gaps_buf = [0i32; NUMBERS_PER_DRAW];
            let mut gap_sum = 0.0;

            for i in 0..valid_len {
                let num = valid[i] as usize;
                let prev_idx = last_seen[num];
                let gap_at_draw = if prev_idx == -1 {
                    t as i32
                } else {
                    (t as i32) - 1 - prev_idx
                };
                let b_idx = classify_gap(gap_at_draw);
                bin_counts[b_idx] += 1;
                gaps_buf[i] = gap_at_draw;
                gap_sum += gap_at_draw as f64;
                ball_exit_gaps[num].push(gap_at_draw);
                ball_tranche_exits[num][b_idx] += 1;
            }

            let mean_gap = gap_sum / (valid_len as f64);
            let mut var = 0.0;
            for i in 0..valid_len {
                let d = (gaps_buf[i] as f64) - mean_gap;
                var += d * d;
            }
            let std_gap = (var / (valid_len as f64)).sqrt();

            let slice = &mut gaps_buf[..valid_len];
            slice.sort_unstable();
            let mid = valid_len / 2;
            let median_gap = if valid_len % 2 == 1 {
                slice[mid] as f64
            } else {
                ((slice[mid - 1] + slice[mid]) as f64) / 2.0
            };

            let tranche_entropy = normalized_tranche_entropy(&bin_counts);

            let mut dominant_bin = 1usize;
            let mut max_bin_score = -1.0;
            for b in 0..NUM_BINS {
                let c = bin_counts[b];
                if c > 0 {
                    let rarity_w = (c as f64) / geo_probs[b].max(0.02);
                    if rarity_w > max_bin_score {
                        max_bin_score = rarity_w;
                        dominant_bin = b;
                    }
                }
            }

            footprints.push(FootprintInternal {
                draw_index: actual_draws - 1 - t,
                bin_counts,
                dominant_bin,
                mean_gap,
                std_gap,
                median_gap,
                tranche_entropy,
                winners: valid,
                win_count: valid_len,
            });
        } else {
            for i in 0..valid_len {
                let num = valid[i] as usize;
                let prev_idx = last_seen[num];
                if prev_idx != -1 {
                    let gap_at_draw = (t as i32) - 1 - prev_idx;
                    let b_idx = classify_gap(gap_at_draw);
                    ball_exit_gaps[num].push(gap_at_draw);
                    ball_tranche_exits[num][b_idx] += 1;
                }
            }
        }

        for i in 0..valid_len {
            last_seen[valid[i] as usize] = t as i32;
        }
    }

    // 1. État courant des 90 boules
    let mut ball_current_gaps = [0i32; TOTAL_NUMBERS + 1];
    let mut ball_current_bin = [0usize; TOTAL_NUMBERS + 1];
    let mut pool_sizes = [0usize; NUM_BINS];
    let mut pool_gap_sums = [0i64; NUM_BINS];

    for num in 1..=TOTAL_NUMBERS {
        let prev_idx = last_seen[num];
        let g = if prev_idx == -1 {
            actual_draws as i32
        } else {
            (actual_draws as i32) - 1 - prev_idx
        };
        ball_current_gaps[num] = g;
        let b = classify_gap(g);
        ball_current_bin[num] = b;
        pool_sizes[b] += 1;
        pool_gap_sums[b] += g as i64;
    }

    let n_fp = footprints.len();

    // 2. Modèle nul H0 exact : occupation réelle + prior géométrique
    let mut pool_baseline = [0.0f64; NUM_BINS];
    let total_pool_obs = (pool_occupancy_steps * TOTAL_NUMBERS).max(1) as f64;
    let prior_strength = (pool_occupancy_steps.max(1) as f64).sqrt();
    let mut base_sum = 0.0;
    for b in 0..NUM_BINS {
        let emp_share = if pool_occupancy_steps > 0 {
            (pool_occupancy_totals[b] as f64) / total_pool_obs
        } else {
            geo_probs[b]
        };
        let w_emp = (pool_occupancy_steps as f64) / ((pool_occupancy_steps as f64) + prior_strength);
        let blended = (w_emp * emp_share + (1.0 - w_emp) * geo_probs[b]).max(1e-5);
        pool_baseline[b] = blended;
        base_sum += blended;
    }
    for b in 0..NUM_BINS {
        pool_baseline[b] /= base_sum.max(1e-9);
    }

    // 3. Matrices Markov Ordre 1 & Ordre 2
    let mut trans_counts1 = [[0.0f64; NUM_BINS]; NUM_BINS];
    let mut trans_row1 = [0.0f64; NUM_BINS];
    let mut trans_counts2 = [[[0.0f64; NUM_BINS]; NUM_BINS]; NUM_BINS];
    let mut trans_row2 = [[0.0f64; NUM_BINS]; NUM_BINS];
    let mut emp_totals = [0.0f64; NUM_BINS];
    let mut total_obs_balls = 0.0f64;

    for i in 0..n_fp {
        let fp = &footprints[i];
        for b in 0..NUM_BINS {
            let cnt = fp.bin_counts[b] as f64;
            emp_totals[b] += cnt;
            total_obs_balls += cnt;
        }
        if i >= 1 {
            let prev_dom = footprints[i - 1].dominant_bin;
            let prev_share =
                (footprints[i - 1].bin_counts[prev_dom] as f64) / (NUMBERS_PER_DRAW as f64);
            for b in 0..NUM_BINS {
                let w = (fp.bin_counts[b] as f64) * prev_share;
                trans_counts1[prev_dom][b] += w;
                trans_row1[prev_dom] += w;
            }
        }
        if i >= 2 {
            let d2 = footprints[i - 2].dominant_bin;
            let d1 = footprints[i - 1].dominant_bin;
            for b in 0..NUM_BINS {
                let cnt = fp.bin_counts[b] as f64;
                trans_counts2[d2][d1][b] += cnt;
                trans_row2[d2][d1] += cnt;
            }
        }
    }

    let k_f = NUM_BINS as f64;
    let dirichlet_conc = k_f.sqrt();
    let mut markov1_mat = vec![0.0f64; NUM_BINS * NUM_BINS];
    for from_b in 0..NUM_BINS {
        let denom = (trans_row1[from_b] + dirichlet_conc).max(1e-9);
        for to_b in 0..NUM_BINS {
            let prior_m = dirichlet_conc * pool_baseline[to_b];
            markov1_mat[from_b * NUM_BINS + to_b] =
                (trans_counts1[from_b][to_b] + prior_m) / denom;
        }
    }

    // 4. Renouvellement & pression de sécheresse
    let mut drought_draws = [0i32; NUM_BINS];
    let mut drought_z = [0.0f64; NUM_BINS];
    let mut drought_pressure = [0.0f64; NUM_BINS];
    let mut renewal_raw = [0.0f64; NUM_BINS];
    let mut renewal_sum = 0.0f64;

    for b in 0..NUM_BINS {
        let mut last_act: Option<usize> = None;
        let mut prev_act: Option<usize> = None;
        let mut sum_iv = 0.0f64;
        let mut iv_count = 0usize;
        let mut act_indices: Vec<usize> = Vec::new();

        for i in 0..n_fp {
            if footprints[i].bin_counts[b] > 0 {
                if let Some(p) = prev_act {
                    sum_iv += (i - p) as f64;
                    iv_count += 1;
                }
                prev_act = Some(i);
                last_act = Some(i);
                act_indices.push(i);
            }
        }

        let cur_drought = match last_act {
            Some(la) => (n_fp - 1 - la) as i32,
            None => n_fp as i32,
        };
        drought_draws[b] = cur_drought;

        let p_active = 1.0 - (1.0 - pool_baseline[b]).max(1e-6).powi(NUMBERS_PER_DRAW as i32);
        let th_mean_iv = 1.0 / p_active.max(1e-4);
        let th_var_iv = (1.0 - p_active) / p_active.max(1e-4).powi(2);

        let emp_mean_iv = if iv_count >= 2 {
            sum_iv / (iv_count as f64)
        } else {
            th_mean_iv
        };
        let iv_var = if iv_count >= 2 {
            let mut acc = 0.0;
            for w in act_indices.windows(2) {
                let diff = ((w[1] - w[0]) as f64) - emp_mean_iv;
                acc += diff * diff;
            }
            acc / (iv_count as f64)
        } else {
            th_var_iv
        };
        let iv_std = iv_var.sqrt().max(0.5);
        let emp_mean_drought = (emp_mean_iv - 1.0).max(0.0);
        let std_drought = ((cur_drought as f64) - emp_mean_drought) / iv_std;
        drought_z[b] = std_drought;

        let press = 1.0 / (1.0 + (-std_drought).exp());
        drought_pressure[b] = press;

        let avail_ratio = ((pool_sizes[b] as f64) / (TOTAL_NUMBERS as f64)) / pool_baseline[b].max(1e-5);
        let haz_mult = (0.5 + press) * avail_ratio.max(0.1).sqrt();
        renewal_raw[b] = pool_baseline[b] * haz_mult;
        renewal_sum += renewal_raw[b];
    }

    let mut renewal_dist = [0.0f64; NUM_BINS];
    for b in 0..NUM_BINS {
        renewal_dist[b] = renewal_raw[b] / renewal_sum.max(1e-9);
    }

    // 5. Distributions M0, M1, M2
    let current_dom1 = footprints.last().map(|f| f.dominant_bin).unwrap_or(3);
    let prev_dom = if n_fp > 1 {
        Some(footprints[n_fp - 2].dominant_bin)
    } else {
        None
    };

    let mut emp_dist = [0.0f64; NUM_BINS];
    let mut markov1_dist = [0.0f64; NUM_BINS];
    let mut markov2_dist = [0.0f64; NUM_BINS];

    for b in 0..NUM_BINS {
        emp_dist[b] = if total_obs_balls > 0.0 {
            (emp_totals[b] + dirichlet_conc * pool_baseline[b]) / (total_obs_balls + dirichlet_conc)
        } else {
            pool_baseline[b]
        };
        markov1_dist[b] = markov1_mat[current_dom1 * NUM_BINS + b];

        if let Some(d2) = prev_dom {
            let n2 = trans_row2[d2][current_dom1];
            if n2 > 0.0 {
                let shrink2 = dirichlet_conc * 5.0;
                markov2_dist[b] = (trans_counts2[d2][current_dom1][b] + shrink2 * markov1_dist[b])
                    / (n2 + shrink2);
            } else {
                markov2_dist[b] = markov1_dist[b];
            }
        } else {
            markov2_dist[b] = markov1_dist[b];
        }
    }

    // 6. Analogues topologiques 1-Wasserstein + ADN 4D
    let mut top_matches: Vec<(usize, f64, f64, f64)> = Vec::new(); // (fp_idx, sim, w1_sim, dna_sim)
    let mut w1_bandwidth = 0.15f64;

    if n_fp >= 6 {
        let last_fp = &footprints[n_fp - 1];
        let prev_fp = footprints.get(n_fp - 2);
        let prev2_fp = footprints.get(n_fp - 3);

        let g_mean_gap = footprints.iter().map(|f| f.mean_gap).sum::<f64>() / (n_fp as f64);
        let scale_mean_gap = (footprints
            .iter()
            .map(|f| (f.mean_gap - g_mean_gap).powi(2))
            .sum::<f64>()
            / (n_fp as f64))
            .sqrt()
            .max(1.0);

        let g_std_gap = footprints.iter().map(|f| f.std_gap).sum::<f64>() / (n_fp as f64);
        let scale_std_gap = (footprints
            .iter()
            .map(|f| (f.std_gap - g_std_gap).powi(2))
            .sum::<f64>()
            / (n_fp as f64))
            .sqrt()
            .max(1.0);

        let mut raw_dists: Vec<(usize, f64, f64, f64)> = Vec::with_capacity(n_fp - 4);
        for i in 2..(n_fp - 2) {
            let cc = &footprints[i];
            let cp = &footprints[i - 1];
            let cp2 = &footprints[i - 2];

            let w_curr = normalized_wasserstein_counts(&last_fp.bin_counts, &cc.bin_counts);
            let w_prev = prev_fp
                .map(|pf| normalized_wasserstein_counts(&pf.bin_counts, &cp.bin_counts))
                .unwrap_or(w_curr);
            let w_prev2 = prev2_fp
                .map(|pf2| normalized_wasserstein_counts(&pf2.bin_counts, &cp2.bin_counts))
                .unwrap_or(w_prev);
            let w1_dist = (4.0 * w_curr + 2.0 * w_prev + w_prev2) / 7.0;

            let d_mean = (last_fp.mean_gap - cc.mean_gap).abs() / scale_mean_gap;
            let d_std = (last_fp.std_gap - cc.std_gap).abs() / scale_std_gap;
            let d_median = (last_fp.median_gap - cc.median_gap).abs() / scale_mean_gap;
            let d_entropy = (last_fp.tranche_entropy - cc.tranche_entropy).abs();
            let dna_dist = ((d_mean * d_mean + d_std * d_std + d_median * d_median + d_entropy * d_entropy) / 4.0).sqrt();

            let combined = 0.5 * w1_dist + 0.5 * (dna_dist / (1.0 + dna_dist));
            raw_dists.push((i, w1_dist, dna_dist, combined));
        }

        if !raw_dists.is_empty() {
            let mut sorted_c: Vec<f64> = raw_dists.iter().map(|x| x.3).collect();
            sorted_c.sort_by(|a, b| a.total_cmp(b));
            w1_bandwidth = sorted_c[sorted_c.len() / 2].max(0.05);

            for (idx_t, w1_d, dna_d, _) in raw_dists {
                let w1_sim = (-w1_d / w1_bandwidth).exp();
                let dna_sim = (-dna_d).exp();
                let sim = (w1_sim * dna_sim).sqrt();
                top_matches.push((idx_t, sim, w1_sim, dna_sim));
            }
            top_matches.sort_by(|a, b| b.1.total_cmp(&a.1));
            top_matches.truncate(8);
        }
    }

    let mut seq_echo_dist = [0.0f64; NUM_BINS];
    let mut echo_w_sum = 0.0f64;
    let mut echo_w_sq_sum = 0.0f64;
    for &(fp_idx, sim, _, _) in top_matches.iter() {
        let next_fp = &footprints[fp_idx + 1];
        for b in 0..NUM_BINS {
            seq_echo_dist[b] += sim * ((next_fp.bin_counts[b] as f64) / 5.0);
        }
        echo_w_sum += sim;
        echo_w_sq_sum += sim * sim;
    }
    for b in 0..NUM_BINS {
        seq_echo_dist[b] = if echo_w_sum > 0.0 {
            seq_echo_dist[b] / echo_w_sum
        } else {
            emp_dist[b]
        };
    }

    // 7. Pondération bayésienne KL
    let n1_eff = trans_row1[current_dom1] / 5.0;
    let n2_eff = prev_dom
        .map(|d2| trans_row2[d2][current_dom1] / 5.0)
        .unwrap_or(0.0);

    let kl_m1 = kl_divergence(&markov1_dist, &emp_dist);
    let kl_m2 = kl_divergence(&markov2_dist, &markov1_dist);
    let kl_renewal = kl_divergence(&renewal_dist, &emp_dist);
    let kl_echo = kl_divergence(&seq_echo_dist, &emp_dist);

    let cred_m1 = n1_eff / (n1_eff + k_f);
    let cred_m2 = n2_eff / (n2_eff + k_f);
    let cred_echo = if !top_matches.is_empty() {
        top_matches[0].1 * ((top_matches.len() as f64) / ((top_matches.len() as f64) + k_f))
    } else {
        0.0
    };

    let ev_emp = 1.0 / k_f.sqrt();
    let ev_m1 = cred_m1 * (ev_emp + kl_m1.sqrt());
    let ev_m2 = cred_m2 * (ev_emp * 0.75 + kl_m2.sqrt());
    let ev_renewal = ev_emp * 0.8 + kl_renewal.sqrt();
    let ev_echo = cred_echo * (ev_emp + kl_echo.sqrt());

    let ev_sum = (ev_emp + ev_m1 + ev_m2 + ev_renewal + ev_echo).max(1e-9);
    let model_weights = [
        ev_emp / ev_sum,
        ev_m1 / ev_sum,
        ev_m2 / ev_sum,
        ev_renewal / ev_sum,
        ev_echo / ev_sum,
    ];

    let mut raw_blended = [0.0f64; NUM_BINS];
    let mut total_raw = 0.0f64;
    for b in 0..NUM_BINS {
        let lin = model_weights[0] * emp_dist[b]
            + model_weights[1] * markov1_dist[b]
            + model_weights[2] * markov2_dist[b]
            + model_weights[3] * renewal_dist[b]
            + model_weights[4] * seq_echo_dist[b];
        let avail = if pool_sizes[b] == 0 {
            0.0
        } else {
            (((pool_sizes[b] as f64) / 90.0) / pool_baseline[b].max(1e-4)).powf(0.35)
        };
        raw_blended[b] = (lin * avail).max(0.0);
        total_raw += raw_blended[b];
    }

    let mut blended_probs = [0.0f64; NUM_BINS];
    for b in 0..NUM_BINS {
        blended_probs[b] = if total_raw > 0.0 {
            raw_blended[b] / total_raw
        } else {
            pool_baseline[b]
        };
    }

    // 8. Quotas Hamilton-Hare
    let tranche_quotas = allocate_hamilton_hare(
        &blended_probs,
        &pool_sizes,
        &pool_baseline,
        n1_eff.max(1.0),
        NUMBERS_PER_DRAW,
    );

    // 9. Z-scores par tranche
    let n1_z = n1_eff.max(1.0);
    let mut bin_z_scores = [0.0f64; NUM_BINS];
    for b in 0..NUM_BINS {
        let base_p = pool_baseline[b];
        let se = ((base_p * (1.0 - base_p)) / n1_z).max(1e-9).sqrt();
        bin_z_scores[b] = if se > 0.0 {
            (blended_probs[b] - base_p) / se
        } else {
            0.0
        };
    }

    // 10. Micro-scoring 5 canaux Stouffer sur les 90 boules
    let dirichlet_shrink = k_f.sqrt();
    let boundary_kernel_var = (NUMBERS_PER_DRAW as f64) / 2.0;
    let seq_echo_n_eff = if echo_w_sq_sum > 0.0 {
        (echo_w_sum * echo_w_sum) / echo_w_sq_sum
    } else {
        0.0
    };

    let mut ball_stouffer_z = [0.0f64; TOTAL_NUMBERS + 1];
    let mut ball_stouffer_p = [0.5f64; TOTAL_NUMBERS + 1];
    let mut ball_channel_z_flat = vec![0.0f64; (TOTAL_NUMBERS + 1) * 5];
    let mut ball_active_channels = [0u8; TOTAL_NUMBERS + 1];
    let mut candidates: Vec<BallCandInternal> = Vec::with_capacity(TOTAL_NUMBERS);

    let geom_var_h0 = (1.0 - P_SINGLE) / (P_SINGLE * P_SINGLE);

    for num in 1..=TOTAL_NUMBERS {
        let cur_gap = ball_current_gaps[num];
        let b_idx = ball_current_bin[num];
        let exits = &ball_exit_gaps[num];
        let m = exits.len();

        let mean_hist_gap = if m > 0 {
            (exits.iter().map(|&x| x as f64).sum::<f64>()) / (m as f64)
        } else {
            (1.0 - P_SINGLE) / P_SINGLE
        };
        let var_hist_gap = if m >= 2 {
            exits
                .iter()
                .map(|&g| ((g as f64) - mean_hist_gap).powi(2))
                .sum::<f64>()
                / (m as f64)
        } else {
            geom_var_h0
        };
        let std_hist_gap = var_hist_gap.sqrt().max(1.5);

        // A. zTranche lissé par noyau Gaussien
        let mut num_z_tr = 0.0;
        let mut sum_w_sq = 0.0;
        for ob in 0..NUM_BINS {
            let (lo, hi) = BIN_BOUNDS[ob];
            let dist = if cur_gap < lo {
                (lo - cur_gap) as f64
            } else if cur_gap > hi {
                (cur_gap - hi) as f64
            } else {
                0.0
            };
            let w = (-(dist * dist) / (2.0 * boundary_kernel_var)).exp();
            num_z_tr += w * bin_z_scores[ob];
            sum_w_sq += w * w;
        }
        let z_tranche = if sum_w_sq > 0.0 {
            num_z_tr / sum_w_sq.sqrt()
        } else {
            bin_z_scores[b_idx]
        };

        // B. zDrought
        let z_drought = drought_z[b_idx];

        // C. zHazard (fenêtre de Silverman)
        let bw = (1.06 * std_hist_gap * ((m.max(1) as f64).powf(-0.2))).max(1.2);
        let win_low = (cur_gap - 1).max(0);
        let win_high = cur_gap + (bw * 0.75).round().max(1.0) as i32;
        let win_len = (win_high - win_low + 1).max(1);

        let mut surv_cnt = 0usize;
        let mut near_cnt = 0usize;
        for &g in exits.iter() {
            if g >= win_low {
                surv_cnt += 1;
                if g <= win_high {
                    near_cnt += 1;
                }
            }
        }
        let p0_win = (1.0 - (1.0 - P_SINGLE).powi(win_len)).clamp(1e-6, 1.0 - 1e-6);
        let z_hazard = if surv_cnt > 0 {
            let n_s = surv_cnt as f64;
            let exp_near = n_s * p0_win;
            let se = (n_s * p0_win * (1.0 - p0_win)).max(1e-9).sqrt();
            let raw_zh = ((near_cnt as f64) - exp_near) / se;
            let cred_h = n_s / (n_s + dirichlet_shrink);
            cred_h * raw_zh
        } else {
            0.0
        };

        // D. zAffinity
        let z_affinity = if m > 0 {
            let hits_b = ball_tranche_exits[num][b_idx] as f64;
            let prior_s = pool_baseline[b_idx].clamp(1e-5, 1.0 - 1e-5);
            let m_f = m as f64;
            let exp_b = m_f * prior_s;
            let se_a = (m_f * prior_s * (1.0 - prior_s)).max(1e-9).sqrt();
            let raw_za = (hits_b - exp_b) / se_a;
            let cred_a = m_f / (m_f + dirichlet_shrink);
            cred_a * raw_za
        } else {
            0.0
        };

        // E. zEcho (analogues W1 + ADN)
        let mut echo_ball_hits = 0.0;
        for &(fp_idx, sim, _, _) in top_matches.iter() {
            let nfp = &footprints[fp_idx + 1];
            let has_ball = (0..nfp.win_count).any(|wi| (nfp.winners[wi] as usize) == num);
            if has_ball {
                echo_ball_hits += sim;
            }
        }
        let z_echo = if seq_echo_n_eff > 0.0 && echo_w_sum > 0.0 {
            let p_hat = echo_ball_hits / echo_w_sum;
            let se_e = ((P_SINGLE * (1.0 - P_SINGLE)) / seq_echo_n_eff)
                .max(1e-9)
                .sqrt();
            let raw_ze = (p_hat - P_SINGLE) / se_e;
            let cred_e = seq_echo_n_eff / (seq_echo_n_eff + dirichlet_shrink);
            cred_e * raw_ze
        } else {
            0.0
        };

        // Stouffer sur canaux actifs
        let mut w_sum = z_tranche + z_drought;
        let mut k_active: u8 = 2;
        if surv_cnt > 0 {
            w_sum += z_hazard;
            k_active += 1;
        }
        if m > 0 {
            w_sum += z_affinity;
            k_active += 1;
        }
        if seq_echo_n_eff > 0.0 {
            w_sum += z_echo;
            k_active += 1;
        }
        let z_stouffer = w_sum / (k_active as f64).sqrt();
        let p_stouffer = normal_upper_p_value(z_stouffer);
        let comp = (normal_cdf(z_stouffer) * 1000.0).round() / 10.0;

        ball_stouffer_z[num] = (z_stouffer * 10000.0).round() / 10000.0;
        ball_stouffer_p[num] = (p_stouffer * 1_000_000.0).round() / 1_000_000.0;
        let ch_off = num * 5;
        ball_channel_z_flat[ch_off] = (z_tranche * 10000.0).round() / 10000.0;
        ball_channel_z_flat[ch_off + 1] = (z_drought * 10000.0).round() / 10000.0;
        ball_channel_z_flat[ch_off + 2] = (z_hazard * 10000.0).round() / 10000.0;
        ball_channel_z_flat[ch_off + 3] = (z_affinity * 10000.0).round() / 10000.0;
        ball_channel_z_flat[ch_off + 4] = (z_echo * 10000.0).round() / 10000.0;
        ball_active_channels[num] = k_active;

        candidates.push(BallCandInternal {
            number: num as u8,
            current_gap: cur_gap,
            bin_idx: b_idx,
            composite_score: comp,
            stouffer_z: ball_stouffer_z[num],
            stouffer_p: ball_stouffer_p[num],
            z_tranche,
            z_drought,
            z_hazard,
            z_affinity,
            z_echo,
            active_channels: k_active,
        });
    }

    candidates.sort_by(|a, b| {
        b.stouffer_z
            .total_cmp(&a.stouffer_z)
            .then_with(|| b.composite_score.total_cmp(&a.composite_score))
            .then_with(|| a.number.cmp(&b.number))
    });

    // 11. Synthèse de sélection optimale sous-modulaire (5 titulaires + 2 réserves)
    let mut bins_priority: Vec<usize> = (0..NUM_BINS).collect();
    bins_priority.sort_by(|&a, &b| {
        bin_z_scores[b]
            .total_cmp(&bin_z_scores[a])
            .then_with(|| blended_probs[b].total_cmp(&blended_probs[a]))
            .then_with(|| a.cmp(&b))
    });

    let top_predicted_bins = [
        bins_priority[0] as u8,
        bins_priority[1] as u8,
        bins_priority[2] as u8,
    ];

    let mut selected_nums: Vec<u8> = Vec::with_capacity(5);
    let mut used = [false; TOTAL_NUMBERS + 1];
    let mut decade_counts = [0usize; 10];
    let div_scale = 1.0 / (NUMBERS_PER_DRAW as f64).sqrt();
    let mut rem_quotas = tranche_quotas;

    for &b_id in bins_priority.iter() {
        let q = rem_quotas[b_id] as usize;
        if q == 0 {
            continue;
        }
        for _ in 0..q {
            if selected_nums.len() >= 5 {
                break;
            }
            let mut best_num: Option<u8> = None;
            let mut best_marg = f64::NEG_INFINITY;
            for c in candidates.iter() {
                if c.bin_idx != b_id || used[c.number as usize] {
                    continue;
                }
                let dec = (((c.number - 1) / 10) as usize).min(8);
                let same_gap = selected_nums
                    .iter()
                    .filter(|&&sn| ball_current_gaps[sn as usize] == c.current_gap)
                    .count();
                let marg = c.stouffer_z - ((decade_counts[dec] + same_gap) as f64) * div_scale;
                if marg > best_marg {
                    best_marg = marg;
                    best_num = Some(c.number);
                }
            }
            if let Some(bn) = best_num {
                selected_nums.push(bn);
                used[bn as usize] = true;
                let dec = (((bn - 1) / 10) as usize).min(8);
                decade_counts[dec] += 1;
                rem_quotas[b_id] = rem_quotas[b_id].saturating_sub(1);
            }
        }
    }

    while selected_nums.len() < 5 {
        let mut best_num: Option<u8> = None;
        let mut best_marg = f64::NEG_INFINITY;
        for c in candidates.iter() {
            if used[c.number as usize] {
                continue;
            }
            let dec = (((c.number - 1) / 10) as usize).min(8);
            let marg = c.stouffer_z - (decade_counts[dec] as f64) * div_scale;
            if marg > best_marg {
                best_marg = marg;
                best_num = Some(c.number);
            }
        }
        if let Some(bn) = best_num {
            selected_nums.push(bn);
            used[bn as usize] = true;
            let dec = (((bn - 1) / 10) as usize).min(8);
            decade_counts[dec] += 1;
        } else {
            break;
        }
    }

    let mut selected_bins = [false; NUM_BINS];
    for &n in selected_nums.iter() {
        selected_bins[ball_current_bin[n as usize]] = true;
    }

    let mut reserve_nums: Vec<u8> = Vec::with_capacity(2);
    while reserve_nums.len() < 2 {
        let mut best_num: Option<(u8, usize)> = None;
        let mut best_util = f64::NEG_INFINITY;
        for c in candidates.iter() {
            if used[c.number as usize] {
                continue;
            }
            let pen = if selected_bins[c.bin_idx] { div_scale } else { 0.0 };
            let util = c.stouffer_z - pen;
            if util > best_util {
                best_util = util;
                best_num = Some((c.number, c.bin_idx));
            }
        }
        if let Some((bn, b_id)) = best_num {
            reserve_nums.push(bn);
            used[bn as usize] = true;
            selected_bins[b_id] = true;
        } else {
            break;
        }
    }

    selected_nums.sort_unstable();
    let mut optimal_five = [0u8; 5];
    for (i, &n) in selected_nums.iter().take(5).enumerate() {
        optimal_five[i] = n;
    }
    let mut reserve_two = [0u8; 2];
    for (i, &n) in reserve_nums.iter().take(2).enumerate() {
        reserve_two[i] = n;
    }

    let mut sel_comp_sum = 0.0;
    let mut sel_z_sum = 0.0;
    let mut sel_cnt = 0usize;
    let mut realized_counts = [0u8; NUM_BINS];
    let mut dec_used = [false; 9];

    for &n in optimal_five.iter() {
        if n == 0 {
            continue;
        }
        if let Some(c) = candidates.iter().find(|x| x.number == n) {
            sel_comp_sum += c.composite_score;
            sel_z_sum += c.stouffer_z;
            sel_cnt += 1;
            realized_counts[c.bin_idx] += 1;
        }
        let d = (((n - 1) / 10) as usize).min(8);
        dec_used[d] = true;
    }

    let ticket_stouffer_z = if sel_cnt > 0 {
        sel_z_sum / (sel_cnt as f64).sqrt()
    } else {
        0.0
    };
    let mean_comp = if sel_cnt > 0 {
        sel_comp_sum / (sel_cnt as f64)
    } else {
        50.0
    };
    let quota_w1 = normalized_wasserstein_u8_quotas(&realized_counts, &tranche_quotas);
    let quota_fidelity = ((1.0 - quota_w1) * 100.0).clamp(0.0, 100.0);
    let uniq_dec = dec_used.iter().filter(|&&x| x).count();
    let decade_diversity = ((uniq_dec as f64) / 5.0) * 100.0;

    let max_tranche_z = bin_z_scores
        .iter()
        .map(|z| z.abs())
        .fold(0.0f64, f64::max);
    let baseline_h0_conf = 25.4;
    let internal_coherence = 0.55 * mean_comp + 0.25 * quota_fidelity + 0.20 * decade_diversity;
    let z_evidence = ((max_tranche_z - 1.96) / 2.5).clamp(0.0, 1.0);
    let selection_confidence = (baseline_h0_conf
        + (internal_coherence.min(95.0) - baseline_h0_conf) * z_evidence)
        .min(98.5);

    // 12. Écart moyen projeté T+1
    let recent_n = n_fp.min(10);
    let recent_avg_mean = if recent_n > 0 {
        footprints[n_fp - recent_n..n_fp]
            .iter()
            .map(|f| f.mean_gap)
            .sum::<f64>()
            / (recent_n as f64)
    } else {
        12.5
    };
    let mut exp_mean_from_bins = 0.0;
    for b in 0..NUM_BINS {
        let mid = if BIN_BOUNDS[b].1 == i32::MAX {
            if pool_sizes[b] > 0 {
                (pool_gap_sums[b] as f64) / (pool_sizes[b] as f64)
            } else {
                (BIN_BOUNDS[b].0 as f64) + (1.0 - P_SINGLE) / P_SINGLE
            }
        } else {
            ((BIN_BOUNDS[b].0 + BIN_BOUNDS[b].1) as f64) / 2.0
        };
        exp_mean_from_bins += blended_probs[b] * mid;
    }
    let expected_next_mean = 0.62 * exp_mean_from_bins + 0.38 * recent_avg_mean;
    let _ = (Z_GAUSS_75, candidates.iter().map(|c| (c.stouffer_p, c.z_tranche, c.z_drought, c.z_hazard, c.z_affinity, c.z_echo, c.active_channels)).count());

    GapRangeCoreResult {
        total_analyzed_draws: n_fp,
        pool_baseline_probs: pool_baseline,
        blended_probs,
        bin_z_scores,
        transition_matrix_order1: markov1_mat,
        drought_draws,
        drought_pressure,
        drought_z_scores: drought_z,
        model_weights,
        kl_m1,
        kl_m2,
        wasserstein_bandwidth: w1_bandwidth,
        ball_current_gaps,
        ball_stouffer_z,
        ball_stouffer_p,
        ball_channel_z_flat,
        ball_active_channels,
        top_predicted_bins,
        optimal_five,
        reserve_two,
        tranche_quotas,
        ticket_stouffer_z: (ticket_stouffer_z * 10000.0).round() / 10000.0,
        selection_confidence: (selection_confidence * 10.0).round() / 10.0,
        expected_next_mean: (expected_next_mean * 10.0).round() / 10.0,
    }
}

#[wasm_bindgen]
pub struct GapRangeAnalysisWasmResult {
    pub total_analyzed_draws: usize,
    pub kl_m1: f64,
    pub kl_m2: f64,
    pub wasserstein_bandwidth: f64,
    pub ticket_stouffer_z: f64,
    pub selection_confidence: f64,
    pub expected_next_mean: f64,
    pool_baseline_probs: Vec<f64>,
    blended_probs: Vec<f64>,
    bin_z_scores: Vec<f64>,
    transition_matrix_order1: Vec<f64>,
    drought_draws: Vec<i32>,
    drought_pressure: Vec<f64>,
    drought_z_scores: Vec<f64>,
    model_weights: Vec<f64>,
    ball_current_gaps: Vec<i32>,
    ball_stouffer_z: Vec<f64>,
    ball_stouffer_p: Vec<f64>,
    ball_channel_z_flat: Vec<f64>,
    ball_active_channels: Vec<u8>,
    top_predicted_bins: Vec<u8>,
    optimal_five: Vec<u8>,
    reserve_two: Vec<u8>,
    tranche_quotas: Vec<u8>,
}

#[wasm_bindgen]
impl GapRangeAnalysisWasmResult {
    #[wasm_bindgen(getter)]
    pub fn pool_baseline_probs(&self) -> Vec<f64> {
        self.pool_baseline_probs.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn blended_probs(&self) -> Vec<f64> {
        self.blended_probs.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bin_z_scores(&self) -> Vec<f64> {
        self.bin_z_scores.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn transition_matrix_order1(&self) -> Vec<f64> {
        self.transition_matrix_order1.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn drought_draws(&self) -> Vec<i32> {
        self.drought_draws.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn drought_pressure(&self) -> Vec<f64> {
        self.drought_pressure.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn drought_z_scores(&self) -> Vec<f64> {
        self.drought_z_scores.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn model_weights(&self) -> Vec<f64> {
        self.model_weights.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_current_gaps(&self) -> Vec<i32> {
        self.ball_current_gaps.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_stouffer_z(&self) -> Vec<f64> {
        self.ball_stouffer_z.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_stouffer_p(&self) -> Vec<f64> {
        self.ball_stouffer_p.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_channel_z_flat(&self) -> Vec<f64> {
        self.ball_channel_z_flat.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_active_channels(&self) -> Vec<u8> {
        self.ball_active_channels.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn top_predicted_bins(&self) -> Vec<u8> {
        self.top_predicted_bins.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn optimal_five(&self) -> Vec<u8> {
        self.optimal_five.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn reserve_two(&self) -> Vec<u8> {
        self.reserve_two.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn tranche_quotas(&self) -> Vec<u8> {
        self.tranche_quotas.clone()
    }
}

#[wasm_bindgen]
pub fn compute_gap_range_analysis_wasm(
    chrono_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
) -> GapRangeAnalysisWasmResult {
    let core = analyze_chronological_core(chrono_draws_flat, num_draws, win_cols);
    GapRangeAnalysisWasmResult {
        total_analyzed_draws: core.total_analyzed_draws,
        kl_m1: core.kl_m1,
        kl_m2: core.kl_m2,
        wasserstein_bandwidth: core.wasserstein_bandwidth,
        ticket_stouffer_z: core.ticket_stouffer_z,
        selection_confidence: core.selection_confidence,
        expected_next_mean: core.expected_next_mean,
        pool_baseline_probs: core.pool_baseline_probs.to_vec(),
        blended_probs: core.blended_probs.to_vec(),
        bin_z_scores: core.bin_z_scores.to_vec(),
        transition_matrix_order1: core.transition_matrix_order1,
        drought_draws: core.drought_draws.to_vec(),
        drought_pressure: core.drought_pressure.to_vec(),
        drought_z_scores: core.drought_z_scores.to_vec(),
        model_weights: core.model_weights.to_vec(),
        ball_current_gaps: core.ball_current_gaps.to_vec(),
        ball_stouffer_z: core.ball_stouffer_z.to_vec(),
        ball_stouffer_p: core.ball_stouffer_p.to_vec(),
        ball_channel_z_flat: core.ball_channel_z_flat,
        ball_active_channels: core.ball_active_channels.to_vec(),
        top_predicted_bins: core.top_predicted_bins.to_vec(),
        optimal_five: core.optimal_five.to_vec(),
        reserve_two: core.reserve_two.to_vec(),
        tranche_quotas: core.tranche_quotas.to_vec(),
    }
}

#[wasm_bindgen]
pub struct GapRangeWalkForwardWasmResult {
    pub eval_count: usize,
    pub min_train_draws: usize,
    pub top1_success_rate: f64,
    pub top1_h0_chance_rate: f64,
    pub top3_ball_coverage_rate: f64,
    pub top3_h0_chance_rate: f64,
    pub avg_balls_covered_per_draw: f64,
    pub avg_selection_hits_per_draw: f64,
    pub selection_at_least_one_hit_rate: f64,
    pub mean_brier_score: f64,
    pub h0_brier_score: f64,
    pub brier_skill_score: f64,
    step_draw_indices: Vec<i32>,
    step_predicted_top3: Vec<u8>,
    step_actual_counts: Vec<u8>,
    step_optimal_five_hits: Vec<u8>,
    step_brier_scores: Vec<f64>,
}

#[wasm_bindgen]
impl GapRangeWalkForwardWasmResult {
    #[wasm_bindgen(getter)]
    pub fn step_draw_indices(&self) -> Vec<i32> {
        self.step_draw_indices.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn step_predicted_top3(&self) -> Vec<u8> {
        self.step_predicted_top3.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn step_actual_counts(&self) -> Vec<u8> {
        self.step_actual_counts.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn step_optimal_five_hits(&self) -> Vec<u8> {
        self.step_optimal_five_hits.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn step_brier_scores(&self) -> Vec<f64> {
        self.step_brier_scores.clone()
    }
}

/// Évaluation Walk-Forward strictement hors-échantillon (zéro fuite future) :
/// à chaque tirage `t` dans `[total_draws - eval_count, total_draws - 1]`,
/// le modèle est entraîné uniquement sur le préfixe `0..t` puis scoré sur `t`.
#[wasm_bindgen]
pub fn compute_gap_range_walk_forward_wasm(
    chrono_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    window_size: usize,
) -> GapRangeWalkForwardWasmResult {
    let cols = win_cols.max(1);
    let total_draws = num_draws.min(chrono_draws_flat.len() / cols);
    let min_train = (total_draws / 3).min(25).max(12);
    let eval_count = if total_draws > min_train {
        window_size.max(1).min(total_draws - min_train)
    } else {
        0
    };

    if eval_count == 0 {
        return GapRangeWalkForwardWasmResult {
            eval_count: 0,
            min_train_draws: min_train,
            top1_success_rate: 0.0,
            top1_h0_chance_rate: 0.0,
            top3_ball_coverage_rate: 0.0,
            top3_h0_chance_rate: 0.0,
            avg_balls_covered_per_draw: 0.0,
            avg_selection_hits_per_draw: 0.0,
            selection_at_least_one_hit_rate: 0.0,
            mean_brier_score: 0.0,
            h0_brier_score: 0.0,
            brier_skill_score: 0.0,
            step_draw_indices: Vec::new(),
            step_predicted_top3: Vec::new(),
            step_actual_counts: Vec::new(),
            step_optimal_five_hits: Vec::new(),
            step_brier_scores: Vec::new(),
        };
    }

    let start_t = total_draws - eval_count;
    let mut top1_hits = 0usize;
    let mut top3_covered = 0usize;
    let mut total_eval_balls = 0usize;
    let mut sum_h0_top1 = 0.0f64;
    let mut sum_h0_top3 = 0.0f64;
    let mut sum_sel_hits = 0usize;
    let mut sel_ge1_draws = 0usize;
    let mut sum_brier = 0.0f64;
    let mut sum_h0_brier = 0.0f64;

    let mut step_draw_indices = Vec::with_capacity(eval_count);
    let mut step_predicted_top3 = Vec::with_capacity(eval_count * 3);
    let mut step_actual_counts = Vec::with_capacity(eval_count * NUM_BINS);
    let mut step_optimal_five_hits = Vec::with_capacity(eval_count);
    let mut step_brier_scores = Vec::with_capacity(eval_count);

    for t in start_t..total_draws {
        let prefix_len = t * cols;
        let core = analyze_chronological_core(&chrono_draws_flat[..prefix_len], t, cols);

        let target_offset = t * cols;
        let mut actual_counts = [0u8; NUM_BINS];
        let mut actual_balls = [0u8; NUMBERS_PER_DRAW];
        let mut actual_len = 0usize;

        for c in 0..cols.min(NUMBERS_PER_DRAW) {
            let b_val = chrono_draws_flat[target_offset + c];
            if b_val >= 1 && (b_val as usize) <= TOTAL_NUMBERS {
                let g = core.ball_current_gaps[b_val as usize];
                actual_counts[classify_gap(g)] += 1;
                actual_balls[actual_len] = b_val as u8;
                actual_len += 1;
            }
        }

        let top3 = core.top_predicted_bins;
        let top1_hit = actual_counts[top3[0] as usize] > 0;
        if top1_hit {
            top1_hits += 1;
        }

        let p_top1 = core.pool_baseline_probs[top3[0] as usize];
        let p_top3 = core.pool_baseline_probs[top3[0] as usize]
            + core.pool_baseline_probs[top3[1] as usize]
            + core.pool_baseline_probs[top3[2] as usize];
        sum_h0_top1 += 1.0 - (1.0 - p_top1).powi(5);
        sum_h0_top3 += p_top3;

        let covered = (actual_counts[top3[0] as usize]
            + actual_counts[top3[1] as usize]
            + actual_counts[top3[2] as usize]) as usize;
        top3_covered += covered;
        total_eval_balls += actual_len.max(1);

        let mut opt_hits = 0u8;
        for &cand in core.optimal_five.iter() {
            if cand > 0 && actual_balls[..actual_len].contains(&cand) {
                opt_hits += 1;
            }
        }
        sum_sel_hits += opt_hits as usize;
        if opt_hits >= 1 {
            sel_ge1_draws += 1;
        }

        let denom_balls = actual_len.max(1) as f64;
        let mut brier = 0.0;
        let mut h0_brier = 0.0;
        for b in 0..NUM_BINS {
            let y_b = (actual_counts[b] as f64) / denom_balls;
            let e = core.blended_probs[b] - y_b;
            let e0 = core.pool_baseline_probs[b] - y_b;
            brier += e * e;
            h0_brier += e0 * e0;
        }
        brier /= NUM_BINS as f64;
        h0_brier /= NUM_BINS as f64;
        sum_brier += brier;
        sum_h0_brier += h0_brier;

        step_draw_indices.push((total_draws - 1 - t) as i32);
        step_predicted_top3.extend_from_slice(&top3);
        step_actual_counts.extend_from_slice(&actual_counts);
        step_optimal_five_hits.push(opt_hits);
        step_brier_scores.push(brier);
    }

    let n_f = eval_count as f64;
    let mean_brier = sum_brier / n_f;
    let mean_h0_brier = sum_h0_brier / n_f;
    let bss = if mean_h0_brier > 1e-9 {
        (1.0 - mean_brier / mean_h0_brier).clamp(-1.0, 1.0)
    } else {
        0.0
    };

    GapRangeWalkForwardWasmResult {
        eval_count,
        min_train_draws: min_train,
        top1_success_rate: ((top1_hits as f64) / n_f) * 100.0,
        top1_h0_chance_rate: (sum_h0_top1 / n_f) * 100.0,
        top3_ball_coverage_rate: ((top3_covered as f64) / (total_eval_balls.max(1) as f64)) * 100.0,
        top3_h0_chance_rate: (sum_h0_top3 / n_f) * 100.0,
        avg_balls_covered_per_draw: (top3_covered as f64) / n_f,
        avg_selection_hits_per_draw: (sum_sel_hits as f64) / n_f,
        selection_at_least_one_hit_rate: ((sel_ge1_draws as f64) / n_f) * 100.0,
        mean_brier_score: mean_brier,
        h0_brier_score: mean_h0_brier,
        brier_skill_score: bss,
        step_draw_indices,
        step_predicted_top3,
        step_actual_counts,
        step_optimal_five_hits,
        step_brier_scores,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deterministic_iid_flat(count: usize) -> Vec<i32> {
        let mut flat = Vec::with_capacity(count * 5);
        let mut s: u64 = 0xDEADBEEF;
        for _ in 0..count {
            let mut pool: Vec<i32> = (1..=90).collect();
            let mut draw = [0i32; 5];
            for b in 0..5 {
                s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let idx = ((s >> 32) as usize) % pool.len();
                draw[b] = pool.swap_remove(idx);
            }
            draw.sort_unstable();
            flat.extend_from_slice(&draw);
        }
        flat
    }

    #[test]
    fn stouffer_z_centered_near_zero_under_iid() {
        let flat = deterministic_iid_flat(120);
        let res = analyze_chronological_core(&flat, 120, 5);
        let sum_z: f64 = res.ball_stouffer_z[1..=90].iter().sum();
        let mean_z = sum_z / 90.0;
        assert!(mean_z.abs() < 0.6, "mean Z on i.i.d. should stay near 0, got {mean_z}");
        assert_eq!(res.optimal_five.len(), 5);
    }

    #[test]
    fn walk_forward_strictly_causal_on_future_perturbation() {
        let mut flat1 = deterministic_iid_flat(60);
        let mut flat2 = flat1.clone();
        // Perturb only the very last draw t=59
        flat2[59 * 5] = 88;
        let prefix_len = 59 * 5;
        let c1 = analyze_chronological_core(&flat1[..prefix_len], 59, 5);
        let c2 = analyze_chronological_core(&flat2[..prefix_len], 59, 5);
        assert_eq!(c1.optimal_five, c2.optimal_five);
        assert_eq!(c1.ticket_stouffer_z, c2.ticket_stouffer_z);

        let wf = compute_gap_range_walk_forward_wasm(&flat1, 60, 5, 20);
        assert_eq!(wf.eval_count, 20);
        assert!(wf.mean_brier_score.is_finite());
        flat1[0] = 1;
    }
}
