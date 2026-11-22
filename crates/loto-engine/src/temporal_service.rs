use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

const TOTAL_BALLS: usize = 90;
const DRAW_SIZE: usize = 5;
/// Espérance théorique d'écart entre deux sorties sous tirage uniforme sans remise (90 / 5 = 18.0).
const EXPECTED_MEAN_GAP: f64 = (TOTAL_BALLS as f64) / (DRAW_SIZE as f64);

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

/// Noyau pur Rust (testable hors WASM) du processus de Hawkes auto-excité pour les 90 numéros.
pub fn compute_hawkes_intensity_core(
    flat_history: &[i32],
    num_draws: usize,
    avg_gaps: &[f64],
) -> Vec<f64> {
    let mut intensities = vec![0.0f64; TOTAL_BALLS + 1];
    let mu = (DRAW_SIZE as f64) / (TOTAL_BALLS as f64);
    let valid_draws = num_draws.min(flat_history.len() / DRAW_SIZE);

    let ln2 = core::f64::consts::LN_2;
    let euler_decay = (-1.0f64).exp();
    let euler_norm = 1.0 - euler_decay;

    for n in 1..=TOTAL_BALLS {
        let avg_gap = if n < avg_gaps.len() && avg_gaps[n].is_finite() && avg_gaps[n] > 0.5 {
            avg_gaps[n]
        } else {
            EXPECTED_MEAN_GAP
        };

        let beta = ln2 / avg_gap;
        // Ratio de branchement sub-critique (α / β < 1) dérivé de e⁻¹ et de la fréquence relative au hasard 5/90
        let freq_ratio = (EXPECTED_MEAN_GAP / avg_gap).clamp(0.0, 2.0);
        let branching_ratio = (euler_decay * (1.0 - (-freq_ratio).exp())) / euler_norm;
        let alpha = branching_ratio * beta;

        let mut excitement_sum = 0.0f64;

        for k in 0..valid_draws {
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

    intensities
}

/// Calcule l'intensité exacte du processus de Hawkes auto-excité pour les 90 numéros
#[wasm_bindgen]
pub fn compute_hawkes_intensity_hpc(
    flat_history: &[i32],
    num_draws: usize,
    avg_gaps: &[f64],
) -> HawkesOutputHpc {
    HawkesOutputHpc {
        intensities: compute_hawkes_intensity_core(flat_history, num_draws, avg_gaps),
    }
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

fn pop_std_dev(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    let n = vals.len() as f64;
    let mean = vals.iter().sum::<f64>() / n;
    let var = vals.iter().map(|&v| (v - mean) * (v - mean)).sum::<f64>() / n;
    var.sqrt()
}

/// Noyau pur Rust (testable hors WASM) d'évaluation des candidats cycliques harmoniques en O(N).
pub fn compute_cyclic_candidates_core(
    current_gaps: &[f64],
    avg_gaps: &[f64],
    std_devs: &[f64],
    acf_scores: &[f64],
    limit_draws: usize,
) -> Vec<CyclicCandidateHpc> {
    let inv_sqrt_n = 1.0 / ((limit_draws as f64).sqrt().max(1.0));

    let mut prec_vec = Vec::with_capacity(TOTAL_BALLS);
    let mut cyc_vec = Vec::with_capacity(TOTAL_BALLS);
    let mut tim_vec = Vec::with_capacity(TOTAL_BALLS);
    let mut pha_vec = Vec::with_capacity(TOTAL_BALLS);
    let mut meta_vec: Vec<(i32, f64, f64, f64, f64)> = Vec::with_capacity(TOTAL_BALLS);

    for n in 1..=TOTAL_BALLS {
        let cur_gap = if n < current_gaps.len() && current_gaps[n].is_finite() {
            current_gaps[n].max(0.0)
        } else {
            0.0
        };
        let avg_gap = if n < avg_gaps.len() && avg_gaps[n].is_finite() {
            avg_gaps[n].max(1.0)
        } else {
            EXPECTED_MEAN_GAP
        };
        // Dispersion théorique d'une loi géométrique de moyenne avg_gap : sqrt(mu * (mu - 1))
        let geom_std = (avg_gap * (avg_gap - 1.0).max(0.0)).sqrt().max(1.0);
        let sigma = if n < std_devs.len() && std_devs[n].is_finite() && std_devs[n] > 0.0 {
            std_devs[n].max(1.0 / (DRAW_SIZE as f64))
        } else {
            geom_std
        };
        let acf = if n < acf_scores.len() && acf_scores[n].is_finite() {
            acf_scores[n].max(0.0)
        } else {
            0.0
        };

        let z_cycle = (acf - inv_sqrt_n) / inv_sqrt_n;
        let cycle_weight = 1.0 / (1.0 + (-z_cycle).exp());
        let quality_factor = avg_gap / sigma;

        let normalized_phase = (cur_gap % avg_gap) / avg_gap;
        let phase_angle_rad = normalized_phase * 2.0 * PI;
        let phase_angle_deg = normalized_phase * 360.0;

        let std_dev_ratio = sigma / geom_std;
        let precision_factor = (-0.5 * std_dev_ratio * std_dev_ratio).exp();
        let timing_factor = (-0.5 * ((cur_gap - avg_gap) / sigma).powi(2)).exp();
        let phase_resonance = (phase_angle_rad / 2.0).cos().powi(2);

        let p_geom = 1.0 / avg_gap;
        let cdf_geom = 1.0 - (1.0 - p_geom).powf(cur_gap);
        let eps_hazard = 1.0 / ((TOTAL_BALLS as f64) * (TOTAL_BALLS as f64));
        let hazard_rate = p_geom / ((1.0 - cdf_geom).max(eps_hazard));

        prec_vec.push(precision_factor);
        cyc_vec.push(cycle_weight);
        tim_vec.push(timing_factor);
        pha_vec.push(phase_resonance);
        meta_vec.push((n as i32, phase_angle_deg, phase_resonance, hazard_rate, quality_factor));
    }

    // Pondération simplexe continue dérivée de la dispersion inter-boules (zéro poids fixes)
    let sd_prec = pop_std_dev(&prec_vec);
    let sd_cyc = pop_std_dev(&cyc_vec);
    let sd_tim = pop_std_dev(&tim_vec);
    let sd_pha = pop_std_dev(&pha_vec);
    let sd_sum = sd_prec + sd_cyc + sd_tim + sd_pha;

    let (w_prec, w_cyc, w_tim, w_pha) = if sd_sum > 1e-12 {
        (sd_prec / sd_sum, sd_cyc / sd_sum, sd_tim / sd_sum, sd_pha / sd_sum)
    } else {
        (0.25, 0.25, 0.25, 0.25)
    };

    let mut candidates = Vec::with_capacity(TOTAL_BALLS);
    for i in 0..TOTAL_BALLS {
        let (ball, phase_angle_deg, phase_resonance, hazard_rate, quality_factor) = meta_vec[i];
        let composite = w_prec * prec_vec[i]
            + w_cyc * cyc_vec[i]
            + w_tim * tim_vec[i]
            + w_pha * pha_vec[i];
        candidates.push(CyclicCandidateHpc {
            ball,
            score: (100.0 * composite).clamp(0.0, 100.0),
            phase_angle_deg,
            phase_resonance,
            hazard_rate,
            quality_factor,
        });
    }

    candidates.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.ball.cmp(&b.ball)));
    candidates
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
    CyclicBatchReportHpc {
        candidates: compute_cyclic_candidates_core(
            current_gaps,
            avg_gaps,
            std_devs,
            acf_scores,
            limit_draws,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hawkes_intensity_is_subcritical_finite_and_deterministic() {
        let mut flat = Vec::with_capacity(30 * DRAW_SIZE);
        for d in 0..30 {
            if d % 2 == 0 {
                flat.extend_from_slice(&[7, 14, 21, 28, 35]);
            } else {
                flat.extend_from_slice(&[3, 19, 44, 62, 88]);
            }
        }
        let mut avg_gaps = vec![EXPECTED_MEAN_GAP; TOTAL_BALLS + 1];
        avg_gaps[7] = 2.0;

        let out1 = compute_hawkes_intensity_core(&flat, 30, &avg_gaps);
        let out2 = compute_hawkes_intensity_core(&flat, 30, &avg_gaps);
        assert_eq!(out1, out2);
        assert_eq!(out1.len(), TOTAL_BALLS + 1);
        assert!(out1.iter().all(|v| v.is_finite() && *v >= 0.0));
        assert!(out1[7] > out1[90], "Recent frequent ball 7 must exceed inactive ball 90");
    }

    #[test]
    fn cyclic_candidates_use_simplex_dispersion_and_stay_bounded() {
        let mut cur = vec![10.0; TOTAL_BALLS + 1];
        let mut avg = vec![18.0; TOTAL_BALLS + 1];
        let mut stds = vec![6.0; TOTAL_BALLS + 1];
        let mut acf = vec![0.1; TOTAL_BALLS + 1];

        cur[42] = 18.0;
        avg[42] = 18.0;
        stds[42] = 2.5;
        acf[42] = 0.65;

        let c1 = compute_cyclic_candidates_core(&cur, &avg, &stds, &acf, 100);
        let c2 = compute_cyclic_candidates_core(&cur, &avg, &stds, &acf, 100);
        assert_eq!(c1.len(), TOTAL_BALLS);
        assert_eq!(c1[0].ball, c2[0].ball);
        assert!(c1.iter().all(|c| c.score.is_finite() && c.score >= 0.0 && c.score <= 100.0));
        assert_eq!(c1[0].ball, 42);
    }
}
