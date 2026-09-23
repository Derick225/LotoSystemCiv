use wasm_bindgen::prelude::*;

/// Résultat vectorisé du Noyau de Hawkes Croisé (Cross-Exciting Hawkes Process)
#[wasm_bindgen]
pub struct CrossHawkesWasmResult {
    intensities: Vec<f64>,
    net_excitations: Vec<f64>,
    lag_excitations: Vec<f64>,
    total_energy: f64,
}

#[wasm_bindgen]
impl CrossHawkesWasmResult {
    #[wasm_bindgen(getter)]
    pub fn intensities(&self) -> Vec<f64> {
        self.intensities.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn net_excitations(&self) -> Vec<f64> {
        self.net_excitations.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn lag_excitations(&self) -> Vec<f64> {
        self.lag_excitations.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn total_energy(&self) -> f64 {
        self.total_energy
    }
}

/// Noyau de Hawkes Croisé Vectorisé en Rust Natif WebAssembly
/// 
/// Modélise l'excitation stochastique continue entre tirages au sein d'une famille étanche :
/// lambda_i(t) = mu_i + sum_{l=1}^L exp(-beta * l) * sum_{j in D_pred(t-l)} A_{j, i}
/// 
/// # Arguments
/// - `pred_occurrences` : tranche aplatie de `lag_count * win_cols` entiers (numéros 1..90)
/// - `lag_count` : profondeur M des tirages antérieurs du prédécesseur
/// - `win_cols` : 5 numéros par tirage
/// - `target_baseline` : tranche de 91 f64 (intensité de base mu_i)
/// - `coupling_matrix` : tranche aplatie de 91 x 91 f64 (matrice de couplage inter-tirages A_ji)
/// - `beta_decay` : coefficient continu d'amortissement temporel
#[wasm_bindgen]
pub fn compute_cross_hawkes_kernel(
    pred_occurrences: &[i32],
    lag_count: usize,
    win_cols: usize,
    target_baseline: &[f64],
    coupling_matrix: &[f64],
    beta_decay: f64,
) -> CrossHawkesWasmResult {
    const NUM_STATES: usize = 90;
    const STRIDE: usize = 91;

    let mut intensities = vec![0.0f64; STRIDE];
    let mut net_excitations = vec![0.0f64; STRIDE];
    let mut lag_excitations = vec![0.0f64; lag_count.max(1)];
    let mut total_energy = 0.0f64;

    // 1. Initialisation vectorielle avec le niveau de base mu_i
    let default_mu = 1.0 / (NUM_STATES as f64);
    for i in 1..=NUM_STATES {
        let mu = if i < target_baseline.len() && target_baseline[i] > 0.0 {
            target_baseline[i]
        } else {
            default_mu
        };
        intensities[i] = mu;
    }

    let safe_beta = beta_decay.max(1e-4);

    // 2. Propagation multi-lags à vitesse native
    for l in 0..lag_count {
        let dt = (l + 1) as f64;
        let temporal_decay = (-safe_beta * dt).exp();
        let row_offset = l * win_cols;
        let mut lag_sum = 0.0f64;

        for c in 0..win_cols {
            let offset = row_offset + c;
            if offset >= pred_occurrences.len() {
                continue;
            }
            let pred_num = pred_occurrences[offset];
            if pred_num < 1 || pred_num > (NUM_STATES as i32) {
                continue;
            }

            let matrix_row_offset = (pred_num as usize) * STRIDE;

            // Déroulement vectoriel continu sur les 90 numéros cibles
            for target_num in 1..=NUM_STATES {
                let cell_idx = matrix_row_offset + target_num;
                if cell_idx >= coupling_matrix.len() {
                    continue;
                }
                let weight = coupling_matrix[cell_idx];
                if weight != 0.0 {
                    let delta = weight * temporal_decay;
                    intensities[target_num] += delta;
                    net_excitations[target_num] += delta;
                    lag_sum += delta;
                    total_energy += delta;
                }
            }
        }

        if l < lag_excitations.len() {
            lag_excitations[l] = lag_sum;
        }
    }

    CrossHawkesWasmResult {
        intensities,
        net_excitations,
        lag_excitations,
        total_energy,
    }
}
