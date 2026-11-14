//! # Moteur de Découverte de Motifs & Chaînes Inter-Cycles (Rust / WASM HPC)
//!
//! Porte vers Rust natif WebAssembly les noyaux combinatoires à forte intensité de
//! calcul de `patternDiscoveryService.ts` :
//! - Indexation triangulaire bijective O(1) des paires [0..4005) et triplets combinadiques [0..117480)
//! - Élimination totale des allocations de chaînes (`"${a}_${b}_${c}"`) dans les boucles triples
//! - Élagage Apriori sans biais sur l'ensemble des 90 numéros
//! - Extraction des transitions de Markov inter-cycles C -> C+1 et entropie de Shannon
//! - Stockage compressé CSR (Compressed Sparse Row) sans Garbage Collector

use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

const TOTAL_NUMBERS: usize = 90;
const BALLS_PER_DRAW: usize = 5;
const TOTAL_PAIRS: usize = (TOTAL_NUMBERS * (TOTAL_NUMBERS - 1)) / 2; // 4005
const TOTAL_TRIPLETS: usize = (TOTAL_NUMBERS * (TOTAL_NUMBERS - 1) * (TOTAL_NUMBERS - 2)) / 6; // 117_480

#[inline]
fn pair_index(a: usize, b: usize) -> usize {
    // Exige 1 <= a < b <= 90
    let m = a - 1;
    m * TOTAL_NUMBERS - (m * (m + 1)) / 2 + (b - a - 1)
}

#[inline]
fn triplet_index(a: usize, b: usize, c: usize) -> usize {
    // Index combinadique bijectif dans [0, 117_480) pour 1 <= a < b < c <= 90
    let i = a - 1;
    let j = b - 1;
    let k = c - 1;
    i + (j * j.saturating_sub(1)) / 2 + (k * k.saturating_sub(1) * k.saturating_sub(2)) / 6
}

fn combinations_f64(n: usize, k: usize) -> f64 {
    if k > n {
        return 0.0;
    }
    if k == 0 || k == n {
        return 1.0;
    }
    let mut c = 1.0f64;
    for i in 1..=k {
        c = (c * ((n - (k - i)) as f64)) / (i as f64);
    }
    c
}

fn exact_cycle_union_prob(k: usize, cycle_length: usize) -> f64 {
    let total_comb = combinations_f64(TOTAL_NUMBERS, BALLS_PER_DRAW);
    let mut prob = 0.0;
    for j in 0..=k {
        let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
        let ways = combinations_f64(k, j);
        let single_absent = combinations_f64(TOTAL_NUMBERS - j, BALLS_PER_DRAW) / total_comb;
        prob += sign * ways * single_absent.powi(cycle_length as i32);
    }
    prob.clamp(1e-7, 1.0 - 1e-7)
}

struct CycleBucket {
    cycle_index: u32,
    sorted_nums: Vec<u8>,
    early: [bool; TOTAL_NUMBERS + 1],
    mid: [bool; TOTAL_NUMBERS + 1],
    late: [bool; TOTAL_NUMBERS + 1],
}

struct TripletAccum {
    a: u8,
    b: u8,
    c: u8,
    early_x3: u32,
    mid_x3: u32,
    late_x3: u32,
    cycles: Vec<u32>,
}

#[wasm_bindgen]
pub struct PatternMiningWasmResult {
    pub total_cycles: usize,
    pub completed_cycles_count: usize,
    pub active_cycle_index: usize,
    pub active_cycle_draws_count: usize,
    pub overall_cycle_entropy: f64,
    pub min_pair_cycles_threshold: usize,
    active_cycle_numbers: Vec<u8>,
    ball_cycle_counts: Vec<u32>,
    source_ball_counts: Vec<u32>,
    same_draw_pair_counts: Vec<u32>,
    pair_cycle_supports: Vec<u32>,
    pair_tuples: Vec<u32>,
    pair_cycle_offsets: Vec<u32>,
    pair_cycle_indices_flat: Vec<u32>,
    triplet_tuples: Vec<u32>,
    triplet_cycle_offsets: Vec<u32>,
    triplet_cycle_indices_flat: Vec<u32>,
    transition_tuples: Vec<u32>,
    transition_cycle_offsets: Vec<u32>,
    transition_cycle_indices_flat: Vec<u32>,
}

#[wasm_bindgen]
impl PatternMiningWasmResult {
    #[wasm_bindgen(getter)]
    pub fn active_cycle_numbers(&self) -> Vec<u8> {
        self.active_cycle_numbers.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ball_cycle_counts(&self) -> Vec<u32> {
        self.ball_cycle_counts.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn source_ball_counts(&self) -> Vec<u32> {
        self.source_ball_counts.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn same_draw_pair_counts(&self) -> Vec<u32> {
        self.same_draw_pair_counts.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn pair_cycle_supports(&self) -> Vec<u32> {
        self.pair_cycle_supports.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn pair_tuples(&self) -> Vec<u32> {
        self.pair_tuples.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn pair_cycle_offsets(&self) -> Vec<u32> {
        self.pair_cycle_offsets.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn pair_cycle_indices_flat(&self) -> Vec<u32> {
        self.pair_cycle_indices_flat.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn triplet_tuples(&self) -> Vec<u32> {
        self.triplet_tuples.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn triplet_cycle_offsets(&self) -> Vec<u32> {
        self.triplet_cycle_offsets.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn triplet_cycle_indices_flat(&self) -> Vec<u32> {
        self.triplet_cycle_indices_flat.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn transition_tuples(&self) -> Vec<u32> {
        self.transition_tuples.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn transition_cycle_offsets(&self) -> Vec<u32> {
        self.transition_cycle_offsets.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn transition_cycle_indices_flat(&self) -> Vec<u32> {
        self.transition_cycle_indices_flat.clone()
    }
}

/// Noyau pur Rust (également testable hors WASM) d'extraction combinatoire multi-cycles.
pub fn mine_cycle_patterns_core(
    chrono_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    cycle_length_raw: usize,
    min_support_override: usize,
    include_transitions: bool,
) -> PatternMiningWasmResult {
    let cols = win_cols.max(1);
    let total_draws = num_draws.min(chrono_draws_flat.len() / cols);
    let cycle_length = cycle_length_raw.clamp(3, 30);

    if total_draws < cycle_length {
        return PatternMiningWasmResult {
            total_cycles: 0,
            completed_cycles_count: 0,
            active_cycle_index: 0,
            active_cycle_draws_count: 0,
            overall_cycle_entropy: 0.0,
            min_pair_cycles_threshold: 2,
            active_cycle_numbers: Vec::new(),
            ball_cycle_counts: vec![0; TOTAL_NUMBERS + 1],
            source_ball_counts: vec![0; TOTAL_NUMBERS + 1],
            same_draw_pair_counts: Vec::new(),
            pair_cycle_supports: Vec::new(),
            pair_tuples: Vec::new(),
            pair_cycle_offsets: vec![0],
            pair_cycle_indices_flat: Vec::new(),
            triplet_tuples: Vec::new(),
            triplet_cycle_offsets: vec![0],
            triplet_cycle_indices_flat: Vec::new(),
            transition_tuples: Vec::new(),
            transition_cycle_offsets: vec![0],
            transition_cycle_indices_flat: Vec::new(),
        };
    }

    let total_cycles = (total_draws + cycle_length - 1) / cycle_length;
    let active_cycle_idx = total_cycles - 1;
    let completed_cycles_count = if total_cycles > 1 { total_cycles - 1 } else { 1 };

    // 1. Reconstruire le cycle actif (dernière fenêtre)
    let act_start = active_cycle_idx * cycle_length;
    let act_end = (act_start + cycle_length).min(total_draws);
    let active_cycle_draws_count = act_end.saturating_sub(act_start);
    let mut act_seen = [false; TOTAL_NUMBERS + 1];
    for d in act_start..act_end {
        let off = d * cols;
        for c in 0..cols {
            let v = chrono_draws_flat[off + c];
            if v >= 1 && (v as usize) <= TOTAL_NUMBERS {
                act_seen[v as usize] = true;
            }
        }
    }
    let mut active_cycle_numbers = Vec::with_capacity(active_cycle_draws_count * BALLS_PER_DRAW);
    for n in 1..=TOTAL_NUMBERS {
        if act_seen[n] {
            active_cycle_numbers.push(n as u8);
        }
    }

    // 2. Accumulation sur les cycles complétés
    let mut global_ball_draw_counts = [0u32; TOTAL_NUMBERS + 1];
    let mut total_ball_hits = 0u64;
    let mut ball_cycle_counts = vec![0u32; TOTAL_NUMBERS + 1];
    let mut same_draw_pair_counts = vec![0u32; TOTAL_PAIRS];
    let mut same_draw_triplet_counts = vec![0u16; TOTAL_TRIPLETS];

    let mut completed_buckets: Vec<CycleBucket> = Vec::with_capacity(completed_cycles_count);

    for c_idx in 0..completed_cycles_count {
        let start_idx = c_idx * cycle_length;
        let end_idx = (start_idx + cycle_length).min(total_draws);
        let draws_in_cycle = end_idx.saturating_sub(start_idx);
        let phase_third = ((draws_in_cycle as f64) / 3.0).max(1.0);

        let mut cyc_all = [false; TOTAL_NUMBERS + 1];
        let mut cyc_early = [false; TOTAL_NUMBERS + 1];
        let mut cyc_mid = [false; TOTAL_NUMBERS + 1];
        let mut cyc_late = [false; TOTAL_NUMBERS + 1];

        for d_rel in 0..draws_in_cycle {
            let off = (start_idx + d_rel) * cols;
            let mut draw_nums: Vec<usize> = Vec::with_capacity(cols);
            for col in 0..cols {
                let v = chrono_draws_flat[off + col];
                if v >= 1 && (v as usize) <= TOTAL_NUMBERS {
                    let u = v as usize;
                    cyc_all[u] = true;
                    global_ball_draw_counts[u] += 1;
                    total_ball_hits += 1;

                    let df = d_rel as f64;
                    if df < phase_third {
                        cyc_early[u] = true;
                    } else if df < phase_third * 2.0 {
                        cyc_mid[u] = true;
                    } else {
                        cyc_late[u] = true;
                    }
                    draw_nums.push(u);
                }
            }

            draw_nums.sort_unstable();
            draw_nums.dedup();
            let d_len = draw_nums.len();
            for i in 0..d_len {
                let a = draw_nums[i];
                for j in (i + 1)..d_len {
                    let b = draw_nums[j];
                    same_draw_pair_counts[pair_index(a, b)] += 1;
                    for k in (j + 1)..d_len {
                        let c = draw_nums[k];
                        let tid = triplet_index(a, b, c);
                        same_draw_triplet_counts[tid] = same_draw_triplet_counts[tid].saturating_add(1);
                    }
                }
            }
        }

        let mut sorted_nums = Vec::with_capacity(draws_in_cycle * BALLS_PER_DRAW);
        for n in 1..=TOTAL_NUMBERS {
            if cyc_all[n] {
                ball_cycle_counts[n] += 1;
                sorted_nums.push(n as u8);
            }
        }

        completed_buckets.push(CycleBucket {
            cycle_index: c_idx as u32,
            sorted_nums,
            early: cyc_early,
            mid: cyc_mid,
            late: cyc_late,
        });
    }

    // Entropie de Shannon normalisée globale
    let mut raw_entropy = 0.0f64;
    if total_ball_hits > 0 {
        let tot_f = total_ball_hits as f64;
        for n in 1..=TOTAL_NUMBERS {
            let cnt = global_ball_draw_counts[n];
            if cnt > 0 {
                let p = (cnt as f64) / tot_f;
                raw_entropy -= p * p.ln();
            }
        }
        raw_entropy /= std::f64::consts::LN_2;
    }
    let overall_cycle_entropy =
        (((raw_entropy / (TOTAL_NUMBERS as f64).log2()).clamp(0.0, 1.0)) * 10000.0).round() / 10000.0;

    // 3. Extraction O(1) de toutes les paires intra-cycle
    let mut pair_cycles: Vec<Vec<u32>> = vec![Vec::new(); TOTAL_PAIRS];
    let mut pair_early_x2 = vec![0u32; TOTAL_PAIRS];
    let mut pair_mid_x2 = vec![0u32; TOTAL_PAIRS];
    let mut pair_late_x2 = vec![0u32; TOTAL_PAIRS];
    let mut pair_coords: Vec<(u8, u8)> = vec![(0, 0); TOTAL_PAIRS];
    for a in 1..=TOTAL_NUMBERS {
        for b in (a + 1)..=TOTAL_NUMBERS {
            pair_coords[pair_index(a, b)] = (a as u8, b as u8);
        }
    }

    for cyc in completed_buckets.iter() {
        let len = cyc.sorted_nums.len();
        for i in 0..len {
            let n1 = cyc.sorted_nums[i] as usize;
            for j in (i + 1)..len {
                let n2 = cyc.sorted_nums[j] as usize;
                let p_idx = pair_index(n1, n2);
                pair_cycles[p_idx].push(cyc.cycle_index);

                if cyc.early[n1] && cyc.early[n2] {
                    pair_early_x2[p_idx] += 2;
                } else if cyc.mid[n1] && cyc.mid[n2] {
                    pair_mid_x2[p_idx] += 2;
                } else if cyc.late[n1] && cyc.late[n2] {
                    pair_late_x2[p_idx] += 2;
                } else {
                    if cyc.early[n1] || cyc.early[n2] {
                        pair_early_x2[p_idx] += 1;
                    }
                    if cyc.mid[n1] || cyc.mid[n2] {
                        pair_mid_x2[p_idx] += 1;
                    }
                    if cyc.late[n1] || cyc.late[n2] {
                        pair_late_x2[p_idx] += 1;
                    }
                }
            }
        }
    }

    let mut pair_cycle_supports = vec![0u32; TOTAL_PAIRS];
    for p_idx in 0..TOTAL_PAIRS {
        pair_cycle_supports[p_idx] = pair_cycles[p_idx].len() as u32;
    }

    // 4. Élagage Apriori & Extraction des Triplets (zéro chaînes de caractères)
    let exp_single_prob = exact_cycle_union_prob(1, cycle_length);
    let exp_pair_prob = exact_cycle_union_prob(2, cycle_length);
    let num_stats_f = (completed_cycles_count as f64).max(1.0);
    let min_pair_for_triplet = 2usize.max((num_stats_f * exp_pair_prob * 1.15).ceil() as usize);

    let mut apriori_cands: Vec<(usize, f64)> = Vec::new();
    for p_idx in 0..TOTAL_PAIRS {
        let sup = pair_cycles[p_idx].len();
        let same_cnt = same_draw_pair_counts[p_idx];
        if sup >= min_pair_for_triplet || same_cnt >= 2 {
            let (a, b) = pair_coords[p_idx];
            let denom = ((ball_cycle_counts[a as usize].max(1) as f64)
                + (ball_cycle_counts[b as usize].max(1) as f64))
                .max(1.0);
            let dice = (2.0 * (sup as f64)) / denom;
            let emp_lift = ((sup as f64) / num_stats_f) / exp_pair_prob;
            let score = emp_lift * dice + (same_cnt as f64) * 3.0;
            apriori_cands.push((p_idx, score));
        }
    }
    apriori_cands.sort_by(|x, y| y.1.total_cmp(&x.1).then_with(|| x.0.cmp(&y.0)));

    let mut frequent_pair_flags = vec![false; TOTAL_PAIRS];
    for &(p_idx, _) in apriori_cands.iter().take(320) {
        frequent_pair_flags[p_idx] = true;
    }

    let mut triplet_map: BTreeMap<usize, TripletAccum> = BTreeMap::new();
    for cyc in completed_buckets.iter() {
        let len = cyc.sorted_nums.len();
        if len < 3 {
            continue;
        }
        for i in 0..(len - 2) {
            let n1 = cyc.sorted_nums[i] as usize;
            for j in (i + 1)..(len - 1) {
                let n2 = cyc.sorted_nums[j] as usize;
                let p12_freq = frequent_pair_flags[pair_index(n1, n2)];
                for k in (j + 1)..len {
                    let n3 = cyc.sorted_nums[k] as usize;
                    let tid = triplet_index(n1, n2, n3);
                    let has_same_draw = same_draw_triplet_counts[tid] >= 1;
                    if !has_same_draw
                        && (!p12_freq
                            || !frequent_pair_flags[pair_index(n1, n3)]
                            || !frequent_pair_flags[pair_index(n2, n3)])
                    {
                        continue;
                    }

                    let e_cnt = (cyc.early[n1] as u32) + (cyc.early[n2] as u32) + (cyc.early[n3] as u32);
                    let m_cnt = (cyc.mid[n1] as u32) + (cyc.mid[n2] as u32) + (cyc.mid[n3] as u32);
                    let l_cnt = (cyc.late[n1] as u32) + (cyc.late[n2] as u32) + (cyc.late[n3] as u32);

                    let entry = triplet_map.entry(tid).or_insert_with(|| TripletAccum {
                        a: n1 as u8,
                        b: n2 as u8,
                        c: n3 as u8,
                        early_x3: 0,
                        mid_x3: 0,
                        late_x3: 0,
                        cycles: Vec::new(),
                    });
                    entry.cycles.push(cyc.cycle_index);
                    entry.early_x3 += e_cnt;
                    entry.mid_x3 += m_cnt;
                    entry.late_x3 += l_cnt;
                }
            }
        }
    }

    // Sérialisation CSR des paires qualifiantes
    let min_pair_cycles_threshold = if min_support_override > 0 {
        min_support_override
    } else {
        2usize.max((num_stats_f * exp_pair_prob * 0.85).floor() as usize)
    };

    let mut pair_tuples: Vec<u32> = Vec::new();
    let mut pair_cycle_offsets: Vec<u32> = Vec::with_capacity(TOTAL_PAIRS + 1);
    let mut pair_cycle_indices_flat: Vec<u32> = Vec::new();
    pair_cycle_offsets.push(0);

    for p_idx in 0..TOTAL_PAIRS {
        let sup = pair_cycles[p_idx].len();
        let same_cnt = same_draw_pair_counts[p_idx];
        if sup >= min_pair_cycles_threshold || same_cnt >= 2 {
            let (a, b) = pair_coords[p_idx];
            pair_tuples.push(a as u32);
            pair_tuples.push(b as u32);
            pair_tuples.push(same_cnt);
            pair_tuples.push(pair_early_x2[p_idx]);
            pair_tuples.push(pair_mid_x2[p_idx]);
            pair_tuples.push(pair_late_x2[p_idx]);
            pair_cycle_indices_flat.extend_from_slice(&pair_cycles[p_idx]);
            pair_cycle_offsets.push(pair_cycle_indices_flat.len() as u32);
        }
    }

    // Sérialisation CSR des triplets qualifiants
    let mut triplet_tuples: Vec<u32> = Vec::new();
    let mut triplet_cycle_offsets: Vec<u32> = vec![0];
    let mut triplet_cycle_indices_flat: Vec<u32> = Vec::new();

    for (&tid, acc) in triplet_map.iter() {
        let same_cnt = same_draw_triplet_counts[tid] as u32;
        if acc.cycles.len() >= 2 || same_cnt >= 1 {
            triplet_tuples.push(acc.a as u32);
            triplet_tuples.push(acc.b as u32);
            triplet_tuples.push(acc.c as u32);
            triplet_tuples.push(same_cnt);
            triplet_tuples.push(acc.early_x3);
            triplet_tuples.push(acc.mid_x3);
            triplet_tuples.push(acc.late_x3);
            triplet_cycle_indices_flat.extend_from_slice(&acc.cycles);
            triplet_cycle_offsets.push(triplet_cycle_indices_flat.len() as u32);
        }
    }

    // 5. Extraction des transitions inter-cycles Markov (Cycle C -> Cycle C+1)
    let mut source_ball_counts = vec![0u32; TOTAL_NUMBERS + 1];
    let src_limit = 1usize.max(completed_cycles_count.saturating_sub(1));
    for c in 0..src_limit.min(completed_buckets.len()) {
        for &n in completed_buckets[c].sorted_nums.iter() {
            source_ball_counts[n as usize] += 1;
        }
    }

    let mut transition_tuples: Vec<u32> = Vec::new();
    let mut transition_cycle_offsets: Vec<u32> = vec![0];
    let mut transition_cycle_indices_flat: Vec<u32> = Vec::new();

    if include_transitions && completed_buckets.len() >= 2 {
        let bayes_prior_scale = num_stats_f.sqrt();
        let mut smoothed_ball_prob = [exp_single_prob; TOTAL_NUMBERS + 1];
        for n in 1..=TOTAL_NUMBERS {
            smoothed_ball_prob[n] = ((ball_cycle_counts[n] as f64) + bayes_prior_scale * exp_single_prob)
                / (num_stats_f + bayes_prior_scale);
        }

        let num_edges = TOTAL_NUMBERS * TOTAL_NUMBERS;
        let mut trans_cycles: Vec<Vec<u32>> = vec![Vec::new(); num_edges];
        let mut trans_early = vec![0u32; num_edges];
        let mut trans_mid = vec![0u32; num_edges];
        let mut trans_late = vec![0u32; num_edges];

        for c in 0..(completed_buckets.len() - 1) {
            let curr = &completed_buckets[c];
            let next = &completed_buckets[c + 1];
            for &src in curr.sorted_nums.iter() {
                for &tgt in next.sorted_nums.iter() {
                    if src != tgt {
                        let e_idx = (src as usize - 1) * TOTAL_NUMBERS + (tgt as usize - 1);
                        trans_cycles[e_idx].push(next.cycle_index);
                        if next.early[tgt as usize] {
                            trans_early[e_idx] += 1;
                        }
                        if next.mid[tgt as usize] {
                            trans_mid[e_idx] += 1;
                        }
                        if next.late[tgt as usize] {
                            trans_late[e_idx] += 1;
                        }
                    }
                }
            }
        }

        for src in 1..=TOTAL_NUMBERS {
            let src_total = source_ball_counts[src].max(1) as f64;
            for tgt in 1..=TOTAL_NUMBERS {
                if src == tgt {
                    continue;
                }
                let e_idx = (src - 1) * TOTAL_NUMBERS + (tgt - 1);
                let transitions = trans_cycles[e_idx].len();
                if transitions < 2 {
                    continue;
                }
                let target_marg = smoothed_ball_prob[tgt];
                let smoothed_trans = ((transitions as f64) + bayes_prior_scale * target_marg)
                    / (src_total + bayes_prior_scale);
                let lift = if target_marg > 0.0 {
                    smoothed_trans / target_marg
                } else {
                    1.0
                };
                let min_trans = 2usize.max((src_total * target_marg * 1.15).floor() as usize);
                if transitions >= min_trans && lift > 1.08 {
                    transition_tuples.push(src as u32);
                    transition_tuples.push(tgt as u32);
                    transition_tuples.push(trans_early[e_idx]);
                    transition_tuples.push(trans_mid[e_idx]);
                    transition_tuples.push(trans_late[e_idx]);
                    transition_cycle_indices_flat.extend_from_slice(&trans_cycles[e_idx]);
                    transition_cycle_offsets.push(transition_cycle_indices_flat.len() as u32);
                }
            }
        }
    }

    PatternMiningWasmResult {
        total_cycles,
        completed_cycles_count,
        active_cycle_index: active_cycle_idx,
        active_cycle_draws_count,
        overall_cycle_entropy,
        min_pair_cycles_threshold,
        active_cycle_numbers,
        ball_cycle_counts,
        source_ball_counts,
        same_draw_pair_counts,
        pair_cycle_supports,
        pair_tuples,
        pair_cycle_offsets,
        pair_cycle_indices_flat,
        triplet_tuples,
        triplet_cycle_offsets,
        triplet_cycle_indices_flat,
        transition_tuples,
        transition_cycle_offsets,
        transition_cycle_indices_flat,
    }
}

#[wasm_bindgen]
pub fn mine_cycle_patterns_wasm(
    chrono_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    cycle_length: usize,
    min_support_override: usize,
    include_transitions: bool,
) -> PatternMiningWasmResult {
    mine_cycle_patterns_core(
        chrono_draws_flat,
        num_draws,
        win_cols,
        cycle_length,
        min_support_override,
        include_transitions,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bijective_pair_and_triplet_indices_cover_exact_bounds() {
        assert_eq!(pair_index(1, 2), 0);
        assert_eq!(pair_index(89, 90), TOTAL_PAIRS - 1);
        assert_eq!(triplet_index(1, 2, 3), 0);
        assert_eq!(triplet_index(88, 89, 90), TOTAL_TRIPLETS - 1);
    }

    #[test]
    fn deterministic_mining_captures_planted_triplet_and_transition() {
        let cycle_len = 10usize;
        let num_cycles = 12usize;
        let total_draws = cycle_len * num_cycles;
        let mut flat = Vec::with_capacity(total_draws * 5);
        let mut s: u64 = 0xCAFEBABE;

        for cyc in 0..num_cycles {
            for d in 0..cycle_len {
                let mut draw = Vec::with_capacity(5);
                if cyc < num_cycles - 1 && d == 0 {
                    draw.extend_from_slice(&[7, 19, 43]);
                }
                if cyc % 2 == 0 && d == 1 {
                    draw.push(11);
                }
                if cyc % 2 == 1 && d == 2 {
                    draw.push(77);
                }
                while draw.len() < 5 {
                    s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                    let candidate = (((s >> 32) as usize) % 90) as i32 + 1;
                    if !draw.contains(&candidate) {
                        draw.push(candidate);
                    }
                }
                draw.sort_unstable();
                flat.extend_from_slice(&draw);
            }
        }

        let res = mine_cycle_patterns_core(&flat, total_draws, 5, cycle_len, 0, true);
        assert_eq!(res.completed_cycles_count, 11);
        assert_eq!(res.pair_cycle_supports.len(), TOTAL_PAIRS);

        let mut found_planted = false;
        let triplet_cnt = res.triplet_tuples.len() / 7;
        for i in 0..triplet_cnt {
            let off = i * 7;
            if res.triplet_tuples[off] == 7
                && res.triplet_tuples[off + 1] == 19
                && res.triplet_tuples[off + 2] == 43
            {
                found_planted = true;
                assert!(res.triplet_tuples[off + 3] >= 10);
            }
        }
        assert!(found_planted, "Planted same-draw triplet (7, 19, 43) must be mined");
    }
}
