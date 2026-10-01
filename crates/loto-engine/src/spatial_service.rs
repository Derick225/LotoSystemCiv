use wasm_bindgen::prelude::*;

const GRID_COLS: f64 = 10.0;
const TOTAL_NUMBERS: usize = 90;

#[inline]
fn get_coords(num: usize) -> (f64, f64) {
    let index = (num - 1) as f64;
    let x = index % GRID_COLS;
    let y = (index / GRID_COLS).floor();
    (x, y)
}

#[inline]
fn get_distance(n1: usize, n2: usize) -> f64 {
    let (x1, y1) = get_coords(n1);
    let (x2, y2) = get_coords(n2);
    ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt()
}

fn ndtri_rust(p: f64) -> f64 {
    if p <= 0.0 || p >= 1.0 {
        return 0.0;
    }
    let q = if p < 0.5 { p } else { 1.0 - p };
    let t = (-2.0 * q.ln()).sqrt();
    let c0 = 2.515517;
    let c1 = 0.802853;
    let c2 = 0.010328;
    let d1 = 1.432788;
    let d2 = 0.189269;
    let d3 = 0.001308;
    let z = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
    if p < 0.5 { -z } else { z }
}

#[wasm_bindgen]
pub struct SpatialFieldMetricsHpc {
    grid_density: Vec<f64>,
    gravity_pulls: Vec<f64>,
    pub barycenter_x: f64,
    pub barycenter_y: f64,
    pub entropy: f64,
    pub density_threshold: f64,
}

#[wasm_bindgen]
impl SpatialFieldMetricsHpc {
    #[wasm_bindgen(getter)]
    pub fn grid_density(&self) -> Vec<f64> {
        self.grid_density.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn gravity_pulls(&self) -> Vec<f64> {
        self.gravity_pulls.clone()
    }
}

/// Calcule le champ spatial complet (densité, puits de gravité, barycentre, seuil Probit)
#[wasm_bindgen]
pub fn compute_spatial_grid_hpc(
    flat_draws: &[i32],
    num_draws: usize,
) -> SpatialFieldMetricsHpc {
    let mut density = vec![0.0f64; TOTAL_NUMBERS + 1];
    let k = 5;

    let eval_draws = num_draws.min(flat_draws.len() / k);
    for d in 0..eval_draws {
        for n_idx in 0..k {
            let val = flat_draws[d * k + n_idx] as usize;
            if val >= 1 && val <= TOTAL_NUMBERS {
                density[val] += 1.0;
            }
        }
    }

    let total_density: f64 = density[1..=TOTAL_NUMBERS].iter().sum();
    let mean_density = total_density / (TOTAL_NUMBERS as f64);
    let variance = density[1..=TOTAL_NUMBERS]
        .iter()
        .map(|&v| (v - mean_density).powi(2))
        .sum::<f64>()
        / (TOTAL_NUMBERS as f64);
    let std_dev = variance.sqrt();

    let mut entropy = 0.0f64;
    if total_density > 0.0 {
        for &v in &density[1..=TOTAL_NUMBERS] {
            if v > 0.0 {
                let p = v / total_density;
                entropy -= p * p.log2();
            }
        }
    }
    let norm_entropy = (entropy / (TOTAL_NUMBERS as f64).log2()).clamp(0.0, 1.0);
    let p_confidence = 0.3 + 0.4 * norm_entropy;
    let z = ndtri_rust(p_confidence);
    let density_threshold = mean_density + z * std_dev;

    let (mut sum_x, mut sum_y) = (0.0f64, 0.0f64);
    let mut recent_count = 0usize;
    if eval_draws > 0 {
        for n_idx in 0..k {
            let val = flat_draws[n_idx] as usize;
            if val >= 1 && val <= TOTAL_NUMBERS {
                let (x, y) = get_coords(val);
                sum_x += x;
                sum_y += y;
                recent_count += 1;
            }
        }
    }
    let barycenter_x = if recent_count > 0 { sum_x / (recent_count as f64) } else { 4.5 };
    let barycenter_y = if recent_count > 0 { sum_y / (recent_count as f64) } else { 4.0 };

    let mut gravity_pulls = vec![0.0f64; TOTAL_NUMBERS];
    for num in 1..=TOTAL_NUMBERS {
        let mut pull = 0.0f64;
        for other in 1..=TOTAL_NUMBERS {
            let d_val = density[other];
            if d_val > 0.0 {
                let dist = get_distance(num, other);
                pull += d_val / (1.0 + dist * dist);
            }
        }
        gravity_pulls[num - 1] = pull;
    }

    SpatialFieldMetricsHpc {
        grid_density: density[1..=TOTAL_NUMBERS].to_vec(),
        gravity_pulls,
        barycenter_x,
        barycenter_y,
        entropy: norm_entropy,
        density_threshold,
    }
}
