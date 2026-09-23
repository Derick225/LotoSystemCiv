use wasm_bindgen::prelude::*;

/// Position spatiale sur la grille 10x9 (90 numéros de loterie)
#[derive(Clone, Copy)]
struct GridCoord {
    row: f64,
    col: f64,
}

#[inline]
fn get_grid_coord(num: i32) -> GridCoord {
    let n = (num - 1).clamp(0, 89);
    GridCoord {
        row: (n / 10) as f64,
        col: (n % 10) as f64,
    }
}

#[inline]
fn spatial_euclidean_distance(c1: GridCoord, c2: GridCoord) -> f64 {
    let dr = c1.row - c2.row;
    let dc = c1.col - c2.col;
    (dr * dr + dc * dc).sqrt()
}

/// Résultat de l'analyse topologique et chaotique
#[wasm_bindgen]
pub struct TopologicalLyapunovResult {
    lyapunov_exponent: f64,
    is_chaotic: bool,
    divergence_force: f64,
    topological_entropy: f64,
}

#[wasm_bindgen]
impl TopologicalLyapunovResult {
    #[wasm_bindgen(getter)]
    pub fn lyapunov_exponent(&self) -> f64 {
        self.lyapunov_exponent
    }

    #[wasm_bindgen(getter)]
    pub fn is_chaotic(&self) -> bool {
        self.is_chaotic
    }

    #[wasm_bindgen(getter)]
    pub fn divergence_force(&self) -> f64 {
        self.divergence_force
    }

    #[wasm_bindgen(getter)]
    pub fn topological_entropy(&self) -> f64 {
        self.topological_entropy
    }
}

/// Calcule l'Exposant de Lyapunov $\lambda$ et la dynamique topologique continue
/// sur une séquence d'historique aplatie (num_draws x win_cols).
/// 
/// $\lambda = \frac{1}{K} \sum_{k=0}^{K-1} \ln(D_{topologique}(t_k, t_{k+1}) + 1e-4)$
/// 
/// Permet d'adapter dynamiquement les coefficients d'apprentissage et de pénalité :
/// - $\lambda > 0$ : Régime chaotique / divergent
/// - $\lambda \le 0$ : Régime d'attracteur régulier / convergent
#[wasm_bindgen]
pub fn compute_topological_lyapunov_wasm(
    history_draws: &[i32],
    num_draws: usize,
    win_cols: usize,
    horizon_limit: usize,
) -> TopologicalLyapunovResult {
    let k_max = (num_draws.saturating_sub(1)).min(horizon_limit);
    if k_max == 0 || win_cols == 0 {
        return TopologicalLyapunovResult {
            lyapunov_exponent: 0.0,
            is_chaotic: false,
            divergence_force: 0.0,
            topological_entropy: 0.0,
        };
    }

    let mut lyapunov_sum = 0.0f64;
    let mut valid_steps = 0usize;
    let mut total_distances = Vec::with_capacity(k_max);

    for k in 0..k_max {
        let t0_offset = k * win_cols;
        let t1_offset = (k + 1) * win_cols;

        if t1_offset + win_cols > history_draws.len() {
            break;
        }

        let mut step_dist = 0.0f64;

        // Distance topologique minimale de Hausdorff entre les 2 tirages consécutifs
        for i in 0..win_cols {
            let c1 = get_grid_coord(history_draws[t1_offset + i]);
            let mut min_dist = f64::MAX;

            for j in 0..win_cols {
                let c0 = get_grid_coord(history_draws[t0_offset + j]);
                let d = spatial_euclidean_distance(c1, c0);
                if d < min_dist {
                    min_dist = d;
                }
            }

            step_dist += min_dist;
        }

        total_distances.push(step_dist);
        lyapunov_sum += (step_dist + 1e-4).ln();
        valid_steps += 1;
    }

    let lambda = if valid_steps > 0 {
        lyapunov_sum / (valid_steps as f64)
    } else {
        0.0
    };

    let is_chaotic = lambda > 0.0;
    let divergence_force = lambda.abs().tanh();

    // Entropie de Shannon de la distribution des distances topologiques
    let mut entropy = 0.0f64;
    let sum_dist: f64 = total_distances.iter().sum();
    if sum_dist > 0.0 {
        for &d in &total_distances {
            let p = d / sum_dist;
            if p > 0.0 {
                entropy -= p * p.ln();
            }
        }
    }

    TopologicalLyapunovResult {
        lyapunov_exponent: lambda,
        is_chaotic,
        divergence_force,
        topological_entropy: entropy,
    }
}
