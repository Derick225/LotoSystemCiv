use wasm_bindgen::prelude::*;

/// Calcule la matrice de transition stochastique de Markov (90 x 90)
/// à partir d'une tranche d'historique aplatie (num_draws x win_cols).
/// 
/// 100% Déterministe et sans allocation dans la boucle critique.
#[wasm_bindgen]
pub fn compute_markov_transition_matrix_wasm(
    history_draws: &[i32],
    num_draws: usize,
    win_cols: usize,
    num_states: usize,
) -> Vec<f64> {
    let matrix_size = num_states * num_states;
    let mut matrix = vec![0.0f64; matrix_size];
    let mut state_counts = vec![0.0f64; num_states];

    if num_draws < 2 {
        return matrix;
    }

    for d in 0..(num_draws - 1) {
        let current_offset = d * win_cols;
        let next_offset = (d + 1) * win_cols;

        for i in 0..win_cols {
            let n1 = history_draws[current_offset + i] as usize;
            if n1 < 1 || n1 > num_states {
                continue;
            }
            let idx1 = n1 - 1;
            state_counts[idx1] += win_cols as f64;

            for j in 0..win_cols {
                let n2 = history_draws[next_offset + j] as usize;
                if n2 < 1 || n2 > num_states {
                    continue;
                }
                let idx2 = n2 - 1;
                matrix[idx1 * num_states + idx2] += 1.0;
            }
        }
    }

    // Normalisation des probabilités conditionnelles de transition P(N_{t+1} | N_t)
    for i in 0..num_states {
        let count = state_counts[i];
        if count > 0.0 {
            let offset = i * num_states;
            for j in 0..num_states {
                matrix[offset + j] /= count;
            }
        }
    }

    matrix
}

/// Évalue les probabilités d'état futur par projection Markovienne d'ordre 1
/// sur le dernier tirage gagnant `last_draw_numbers` (5 entiers).
#[wasm_bindgen]
pub fn project_markov_next_state(
    transition_matrix: &[f64],
    last_draw: &[i32],
    num_states: usize,
) -> Vec<f64> {
    let mut projections = vec![0.0f64; num_states];
    if last_draw.is_empty() {
        return projections;
    }

    let weight_per_num = 1.0 / (last_draw.len() as f64);

    for &num in last_draw {
        let n = num as usize;
        if n < 1 || n > num_states {
            continue;
        }
        let row_offset = (n - 1) * num_states;

        for target in 0..num_states {
            projections[target] += transition_matrix[row_offset + target] * weight_per_num;
        }
    }

    projections
}
