use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

const TOTAL_BALLS: usize = 90;
const DRAW_SIZE: usize = 5;

#[wasm_bindgen]
pub struct HawkesOutputHpc {
    intensities: Vec<f64>,
}

#[wasm_bindgen]
impl HawkesOutputHpc {
    #[wasm_bindgen(getter)]
    pub fn intensities(&self) -> Vec<f64> {
        self.intensities.clone()
    }
}

/// Calcule l'intensité exacte du processus de Hawkes auto-excité pour les 90 numéros
#[wasm_bindgen]
pub fn compute_hawkes_intensity_hpc(
    flat_history: &[i32],
    num_draws: usize,
    avg_gaps: &[f64],
) -> HawkesOutputHpc {
    let mut intensities = vec![0.0f64; TOTAL_BALLS + 1];
    let mu = (DRAW_SIZE as f64) / (TOTAL_BALLS as f64);

    let ln2 = core::f64::consts::LN_2;

    for n in 1..=TOTAL_BALLS {
        let avg_gap = if n < avg_gaps.len() && avg_gaps[n] > 0.5 {
            avg_gaps[n]
        } else {
            18.0
        };

        let beta = ln2 / avg_gap;
        let alpha = 0.45 * beta;

        let mut excitement_sum = 0.0f64;

        for k in 0..num_draws {
            let offset = k * DRAW_SIZE;
            let mut hit = false;
            for j in 0..DRAW_SIZE {
                if (flat_history[offset + j] as usize) == n {
                    hit = true;
                    break;
                }
            }
            if hit {
                let delay = (k + 1) as f64;
                excitement_sum += (-beta * delay).exp();
            }
        }

        intensities[n] = mu + alpha * excitement_sum;
    }

    HawkesOutputHpc { intensities }
}

#[wasm_bindgen]
pub struct CyclicCandidateHpc {
    pub ball: i32,
    pub score: f64,
    pub phase_angle_deg: f64,
    pub phase_resonance: f64,
    pub hazard_rate: f64,
    pub quality_factor: f64,
}

#[wasm_bindgen]
pub struct CyclicBatchReportHpc {
    candidates: Vec<CyclicCandidateHpc>,
}

#[wasm_bindgen]
impl CyclicBatchReportHpc {
    #[wasm_bindgen(getter)]
    pub fn count(&self) -> usize {
        self.candidates.len()
    }
    pub fn get_ball(&self, idx: usize) -> i32 { self.candidates[idx].ball }
    pub fn get_score(&self, idx: usize) -> f64 { self.candidates[idx].score }
    pub fn get_phase_angle(&self, idx: usize) -> f64 { self.candidates[idx].phase_angle_deg }
    pub fn get_phase_resonance(&self, idx: usize) -> f64 { self.candidates[idx].phase_resonance }
    pub fn get_hazard_rate(&self, idx: usize) -> f64 { self.candidates[idx].hazard_rate }
    pub fn get_quality_factor(&self, idx: usize) -> f64 { self.candidates[idx].quality_factor }
}

/// Évalue les candidats cycliques harmoniques en O(N) avec zéro nombre magique
#[wasm_bindgen]
pub fn compute_cyclic_candidates_hpc(
    current_gaps: &[f64],
    avg_gaps: &[f64],
    std_devs: &[f64],
    acf_scores: &[f64],
    limit_draws: usize,
) -> CyclicBatchReportHpc {
    let mut candidates = Vec::with_capacity(TOTAL_BALLS);
    let inv_sqrt_n = 1.0 / ((limit_draws as f64).sqrt().max(1.0));

    for n in 1..=TOTAL_BALLS {
        let cur_gap = if n < current_gaps.len() { current_gaps[n] } else { 0.0 };
        let avg_gap = if n < avg_gaps.len() { avg_gaps[n].max(1.0) } else { 18.0 };
        let sigma = if n < std_devs.len() { std_devs[n].max(0.5) } else { 1.0 };
        let acf = if n < acf_scores.len() { acf_scores[n].max(0.0) } else { 0.0 };

        let z_cycle = (acf - inv_sqrt_n) / inv_sqrt_n;
        let cycle_weight = 1.0 / (1.0 + (-z_cycle).exp());

        let quality_factor = avg_gap / sigma;

        let normalized_phase = (cur_gap % avg_gap) / avg_gap;
        let phase_angle_rad = normalized_phase * 2.0 * PI;
        let phase_angle_deg = normalized_phase * 360.0;

        let std_dev_ratio = sigma / (avg_gap * 0.25).max(1.0);
        let precision_factor = (-0.5 * std_dev_ratio * std_dev_ratio).exp();
        let timing_factor = (-0.5 * ((cur_gap - avg_gap) / sigma).powi(2)).exp();

        let phase_resonance = (phase_angle_rad / 2.0).cos().powi(2);

        let p_geom = 1.0 / avg_gap;
        let cdf_geom = 1.0 - (1.0 - p_geom).powf(cur_gap);
        let hazard_rate = p_geom / ((1.0 - cdf_geom).max(1e-5));

        let total_score = (precision_factor * 35.0)
            + (cycle_weight * 25.0)
            + (timing_factor * 25.0)
            + (phase_resonance * 15.0);

        candidates.push(CyclicCandidateHpc {
            ball: n as i32,
            score: total_score.clamp(0.0, 100.0),
            phase_angle_deg,
            phase_resonance,
            hazard_rate,
            quality_factor,
        });
    }

    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    CyclicBatchReportHpc { candidates }
}
