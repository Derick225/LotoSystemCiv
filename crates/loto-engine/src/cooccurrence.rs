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

    CooccurrenceTensorResult {
        target_pair_hits,
        conditioned_pair_hits,
        dyad_matrix,
        total_pairs_evaluated,
    }
}
