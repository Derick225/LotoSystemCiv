use wasm_bindgen::prelude::*;

const NUM_STATES: usize = 90;
const PAIRS_COUNT: usize = (NUM_STATES * (NUM_STATES - 1)) / 2; // 4005 paires

/// Structure de résultat pour l'analyse des cooccurrences inter-tirages
#[wasm_bindgen]
pub struct CooccurrenceTensorResult {
    target_pair_hits: Vec<i32>,
    conditioned_pair_hits: Vec<i32>,
    dyad_matrix: Vec<i32>,
    total_pairs_evaluated: usize,
}

#[wasm_bindgen]
impl CooccurrenceTensorResult {
    #[wasm_bindgen(getter)]
    pub fn target_pair_hits(&self) -> Vec<i32> {
        self.target_pair_hits.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn conditioned_pair_hits(&self) -> Vec<i32> {
        self.conditioned_pair_hits.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn dyad_matrix(&self) -> Vec<i32> {
        self.dyad_matrix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn total_pairs_evaluated(&self) -> usize {
        self.total_pairs_evaluated
    }
}

#[inline]
fn pair_index(t1: usize, t2: usize) -> usize {
    let (min_t, max_t) = if t1 < t2 { (t1, t2) } else { (t2, t1) };
    // Formule canonique pour indexer les paires (min_t, max_t) dans 0..4005
    // min_t dans 1..89, max_t dans (min_t + 1)..90
    let m = min_t - 1;
    let offset = m * NUM_STATES - (m * (m + 1)) / 2;
    offset + (max_t - min_t - 1)
}

/// Analyse tensorielle haute performance des cooccurrences inter-tirages en WebAssembly
///
/// Calcule en mémoire continue contiguë :
/// - La matrice complète des dyades (91 x 91)
/// - Le dénombrement inconditionnel des 4005 paires cibles
/// - Le dénombrement conditionné par la présence des numéros actifs du tirage prédécesseur
#[wasm_bindgen]
pub fn compute_cooccurrence_tensor_wasm(
    pred_draws_flat: &[i32],
    target_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    active_pred_numbers: &[i32],
) -> CooccurrenceTensorResult {
    let (target_pair_hits, conditioned_pair_hits, dyad_matrix, total_pairs_evaluated) =
        compute_cooccurrence_counts(pred_draws_flat, target_draws_flat, num_draws, win_cols, active_pred_numbers);

    CooccurrenceTensorResult {
        target_pair_hits,
        conditioned_pair_hits,
        dyad_matrix,
        total_pairs_evaluated,
    }
}

/// Cœur de calcul partagé entre le tenseur de comptages bruts et le PMI lissé
fn compute_cooccurrence_counts(
    pred_draws_flat: &[i32],
    target_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    active_pred_numbers: &[i32],
) -> (Vec<i32>, Vec<i32>, Vec<i32>, usize) {
    let mut target_pair_hits = vec![0i32; PAIRS_COUNT];
    let mut conditioned_pair_hits = vec![0i32; PAIRS_COUNT];
    let mut dyad_matrix = vec![0i32; 91 * 91];

    let mut active_mask = [false; 91];
    for &num in active_pred_numbers {
        if num >= 1 && num <= 90 {
            active_mask[num as usize] = true;
        }
    }

    let mut total_pairs_evaluated = 0usize;

    for d in 0..num_draws {
        let pred_offset = d * win_cols;
        let target_offset = d * win_cols;

        if target_offset + win_cols > target_draws_flat.len() || pred_offset + win_cols > pred_draws_flat.len() {
            break;
        }

        // 1. Calcul du chevauchement avec les numéros actifs du prédécesseur
        let mut active_overlap = 0i32;
        for c in 0..win_cols {
            let p = pred_draws_flat[pred_offset + c] as usize;
            if p >= 1 && p <= 90 {
                if active_mask[p] {
                    active_overlap += 1;
                }

                // Matrice des dyades p -> t
                let row_idx = p * 91;
                for tc in 0..win_cols {
                    let t = target_draws_flat[target_offset + tc] as usize;
                    if t >= 1 && t <= 90 {
                        dyad_matrix[row_idx + t] += 1;
                    }
                }
            }
        }

        // 2. Cooccurrences cibles C(5, 2) = 10 paires par tirage
        for i in 0..win_cols {
            let t1 = target_draws_flat[target_offset + i] as usize;
            if t1 < 1 || t1 > 90 { continue; }

            for j in (i + 1)..win_cols {
                let t2 = target_draws_flat[target_offset + j] as usize;
                if t2 < 1 || t2 > 90 || t1 == t2 { continue; }

                let p_idx = pair_index(t1, t2);
                if p_idx < PAIRS_COUNT {
                    target_pair_hits[p_idx] += 1;
                    if active_overlap > 0 {
                        conditioned_pair_hits[p_idx] += active_overlap;
                    }
                    total_pairs_evaluated += 1;
                }
            }
        }
    }

    (target_pair_hits, conditioned_pair_hits, dyad_matrix, total_pairs_evaluated)
}

/// PMI (Pointwise Mutual Information) lissé de Laplace pour les 4005 paires.
///
/// Remplace les comptages bruts par une mesure d'association normalisée :
/// PMI(i,j) = ln[ P_smoothed(i,j) / (P_smoothed(i) * P_smoothed(j)) ]
/// avec lissage alpha = nombre moyen de paires par cellule (dérivé des données).
#[wasm_bindgen]
pub fn compute_pair_pmi_wasm(
    pred_draws_flat: &[i32],
    target_draws_flat: &[i32],
    num_draws: usize,
    win_cols: usize,
    active_pred_numbers: &[i32],
) -> Vec<f64> {
    let (target_pair_hits, _conditioned, dyad_matrix, total_pairs_evaluated) =
        compute_cooccurrence_counts(pred_draws_flat, target_draws_flat, num_draws, win_cols, active_pred_numbers);

    // Degrés marginaux depuis la matrice des dyades (symétrisation ordre i->j / j->i)
    let mut degrees = [0.0f64; 91];
    for i in 1..=90usize {
        let row = i * 91;
        for j in 1..=90usize {
            let v = dyad_matrix.get(row + j).copied().unwrap_or(0) as f64;
            degrees[i] += v;
        }
    }

    let total_pairs = (total_pairs_evaluated.max(1)) as f64;
    let num_cells = PAIRS_COUNT as f64;
    // Lissage de Laplace : intensité moyenne observée par cellule
    let alpha = (total_pairs / num_cells).max(1e-3);

    let mut pmi = vec![0.0f64; PAIRS_COUNT];
    let mut idx = 0usize;
    for t1 in 1..=90usize {
        for t2 in (t1 + 1)..=90usize {
            let count = target_pair_hits.get(idx).copied().unwrap_or(0) as f64;
            let p_ij = (count + alpha) / (total_pairs + alpha * num_cells);
            let p_i = (degrees[t1] + alpha * 89.0) / (2.0 * total_pairs + alpha * 90.0 * 89.0);
            let p_j = (degrees[t2] + alpha * 89.0) / (2.0 * total_pairs + alpha * 90.0 * 89.0);
            let denom = (p_i * p_j).max(1e-12);
    pmi
}

/// Structure de résultat pour le calcul de matrice Jaccard SIMD
#[wasm_bindgen]
pub struct JaccardMatrixResult {
    jaccard_matrix: Vec<f64>,
    gating_matrix: Vec<f64>,
    num_tickets: usize,
}

#[wasm_bindgen]
impl JaccardMatrixResult {
    #[wasm_bindgen(getter)]
    pub fn jaccard_matrix(&self) -> Vec<f64> {
        self.jaccard_matrix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn gating_matrix(&self) -> Vec<f64> {
        self.gating_matrix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn num_tickets(&self) -> usize {
        self.num_tickets
    }
}

/// Calcul continu du Jaccard Pondéré entre deux combinaisons en Rust (Accélération WASM)
#[wasm_bindgen]
pub fn compute_weighted_jaccard_distance_wasm(
    ticket_a: &[i32],
    ticket_b: &[i32],
    weights: &[f64],
) -> f64 {
    if ticket_a.is_empty() || ticket_b.is_empty() {
        return 0.0;
    }

    let mut set_b = [false; 91];
    for &b in ticket_b {
        if b >= 1 && b <= 90 {
            set_b[b as usize] = true;
        }
    }

    let mut inter_w = 0.0f64;
    let mut union_w = 0.0f64;
    let mut union_mask = [false; 91];

    for &a in ticket_a {
        if a >= 1 && a <= 90 {
            let au = a as usize;
            union_mask[au] = true;
            if set_b[au] {
                let w = if weights.len() > au { weights[au].max(0.01) } else { 1.0 };
                inter_w += w;
            }
        }
    }

    for &b in ticket_b {
        if b >= 1 && b <= 90 {
            union_mask[b as usize] = true;
        }
    }

    for n in 1..=90 {
        if union_mask[n] {
            let w = if weights.len() > n { weights[n].max(0.01) } else { 1.0 };
            union_w += w;
        }
    }

    if union_w > 0.0 {
        inter_w / union_w
    } else {
        0.0
    }
}

/// Fonction d'inhibition continue C^∞ par Gating Sigmoïde de Jaccard en Rust
#[wasm_bindgen]
pub fn compute_continuous_jaccard_gating_wasm(
    jaccard_index: f64,
    jaccard_threshold: f64,
    steepness: f64,
) -> f64 {
    let diff = jaccard_index - jaccard_threshold;
    1.0 / (1.0 + (steepness * diff).exp())
}

/// Calcul matriciel N x N vectorisé des similarités de Jaccard pondérées et du gating sigmoïde C^∞
#[wasm_bindgen]
pub fn compute_jaccard_matrix_simd_wasm(
    tickets_flat: &[i32],
    num_tickets: usize,
    ticket_size: usize,
    weights_flat: &[f64],
    j0: f64,
    steepness: f64,
) -> JaccardMatrixResult {
    let n = num_tickets;
    let sz = ticket_size.max(1);
    if n == 0 || tickets_flat.len() < n * sz {
        return JaccardMatrixResult {
            jaccard_matrix: vec![],
            gating_matrix: vec![],
            num_tickets: 0,
        };
    }

    let mut jaccard_matrix = vec![0.0f64; n * n];
    let mut gating_matrix = vec![1.0f64; n * n];

    let t_j0 = if j0 > 0.0 { j0 } else { 0.35 };
    let k = if steepness > 0.0 { steepness } else { 12.0 };

    for i in 0..n {
        let t1 = &tickets_flat[i * sz..(i + 1) * sz];
        jaccard_matrix[i * n + i] = 1.0;
        gating_matrix[i * n + i] = compute_continuous_jaccard_gating_wasm(1.0, t_j0, k);

        for j in (i + 1)..n {
            let t2 = &tickets_flat[j * sz..(j + 1) * sz];
            let jw = compute_weighted_jaccard_distance_wasm(t1, t2, weights_flat);
            let g = compute_continuous_jaccard_gating_wasm(jw, t_j0, k);

            jaccard_matrix[i * n + j] = jw;
            jaccard_matrix[j * n + i] = jw;
            gating_matrix[i * n + j] = g;
            gating_matrix[j * n + i] = g;
        }
    }

    JaccardMatrixResult {
        jaccard_matrix,
        gating_matrix,
        num_tickets: n,
    }
}
