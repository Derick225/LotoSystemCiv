use wasm_bindgen::prelude::*;

/// Calcule la moyenne d'un slice `&[f64]`
#[inline]
fn mean(slice: &[f64]) -> f64 {
    if slice.is_empty() {
        return 0.0;
    }
    let sum: f64 = slice.iter().sum();
    sum / (slice.len() as f64)
}

/// Calcule l'écart-type d'un slice `&[f64]`
#[inline]
fn std_dev(slice: &[f64], mu: f64) -> f64 {
    let len = slice.len();
    if len <= 1 {
        return 1e-6;
    }
    let variance: f64 = slice.iter().map(|&x| {
        let diff = x - mu;
        diff * diff
    }).sum::<f64>() / (len as f64);

    variance.sqrt().max(1e-6)
}

/// Calcule l'Exposant de Hurst Robuste H via l'analyse R/S adaptative (Rescaled Range)
/// 
/// Propriétés mathématiques :
/// - H > 0.5 : Régime persistant / mémoire longue (tendance)
/// - H = 0.5 : Mouvement brownien standard (bruit blanc)
/// - H < 0.5 : Régime anti-persistant (retour à la moyenne)
/// 
/// Zéro nombre magique : les échelles temporelles sont calculées continûment selon
/// la taille du signal et la volatilité locale.
#[wasm_bindgen]
pub fn compute_robust_hurst_wasm(signal: &[f64]) -> f64 {
    let n = signal.len();
    if n < 10 {
        return 0.5;
    }

    let mean_val = mean(signal);
    let mut total_var = 0.0;
    let mut diff_sum = 0.0;

    for i in 0..n {
        let diff = signal[i] - mean_val;
        total_var += diff * diff;
        if i > 0 {
            diff_sum += (signal[i] - signal[i - 1]).abs();
        }
    }

    let global_std = (total_var / (n as f64)).sqrt().max(1e-6);
    let local_vol = if n > 1 {
        (diff_sum / ((n - 1) as f64)) / (global_std + 1e-6)
    } else {
        1.0
    };

    // Estimation adaptative continue des échelles minimales et maximales
    let min_win = 4usize.max((4.0 * (-0.15 * local_vol).exp()).floor() as usize);
    let max_win = (n / 2).min((min_win + 2).max((n as f64 * 0.75 * (1.0 + 0.2 * local_vol).tanh()).floor() as usize));

    let num_scales = 5;
    let mut window_sizes: Vec<usize> = Vec::with_capacity(num_scales);

    if max_win > min_win {
        for s in 0..num_scales {
            let frac = (s as f64) / ((num_scales - 1) as f64);
            let w_size = (min_win as f64 * (max_win as f64 / min_win as f64).powf(frac)).floor() as usize;
            if w_size >= 4 && !window_sizes.contains(&w_size) {
                window_sizes.push(w_size);
            }
        }
    }

    if window_sizes.len() < 2 {
        window_sizes.clear();
        let w1 = 4usize.max(n / 2);
        let w2 = 4usize.max(n / 4);
        if w1 >= 4 { window_sizes.push(w1); }
        if w2 >= 4 && w2 != w1 { window_sizes.push(w2); }
    }

    let mut log_rs: Vec<f64> = Vec::new();
    let mut log_sizes: Vec<f64> = Vec::new();

    for &w_size in &window_sizes {
        let chunks_count = n / w_size;
        if chunks_count < 1 { continue; }

        let mut total_rs = 0.0;

        for i in 0..chunks_count {
            let chunk = &signal[i * w_size..(i + 1) * w_size];
            let m = mean(chunk);
            let s = std_dev(chunk, m);

            let mut cum_sum = 0.0;
            let mut min_z = 0.0f64;
            let mut max_z = 0.0f64;

            for (idx, &v) in chunk.iter().enumerate() {
                cum_sum += v - m;
                if idx == 0 {
                    min_z = cum_sum;
                    max_z = cum_sum;
                } else {
                    if cum_sum < min_z { min_z = cum_sum; }
                    if cum_sum > max_z { max_z = cum_sum; }
                }
            }

            let r = max_z - min_z;
            total_rs += r / s;
        }

        let avg_rs = total_rs / (chunks_count as f64);
        if avg_rs > 0.0 {
            log_rs.push(avg_rs.ln());
            log_sizes.push((w_size as f64).ln());
        }
    }

    if log_rs.len() < 2 {
        return 0.5;
    }

    let m_x = mean(&log_sizes);
    let m_y = mean(&log_rs);
    let mut num = 0.0;
    let mut den = 0.0;

    for i in 0..log_rs.len() {
        let dx = log_sizes[i] - m_x;
        let dy = log_rs[i] - m_y;
        num += dx * dy;
        den += dx * dx;
    }

    if den.abs() > 1e-12 {
        let hurst = num / den;
        hurst.max(0.01).min(0.99)
    } else {
        0.5
    }
}

/// Analyse fractale par lot sur l'ensemble des 90 numéros d'un historique.
/// `history_matrix` est aplati : `num_draws x 5` entiers contenant les numéros gagnants.
/// Retourne un vecteur de 90 éléments contenant les exposants de Hurst respectifs.
#[wasm_bindgen]
pub fn batch_fractal_hurst_analysis(history_draws: &[i32], num_draws: usize, win_cols: usize) -> Vec<f64> {
    const NUM_STATES: usize = 90;
    let mut hurst_results = Vec::with_capacity(NUM_STATES);

    // Pré-allocation des signaux temporels (longueur num_draws)
    let mut signal = vec![0.0f64; num_draws];

    for num in 1..=NUM_STATES {
        let target = num as i32;
        
        // Extraction sans allocation du signal binaire temporel (1 si gagnant, 0 sinon)
        for d in 0..num_draws {
            let offset = d * win_cols;
            let mut present = 0.0;
            for c in 0..win_cols {
                if history_draws[offset + c] == target {
                    present = 1.0;
                    break;
                }
            }
            signal[d] = present;
        }

        let h = compute_robust_hurst_wasm(&signal);
        hurst_results.push(h);
    }

    hurst_results
}
