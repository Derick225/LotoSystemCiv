use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

pub struct DeterministicPrng {
    state: u64,
}

impl DeterministicPrng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed.wrapping_add(0x9E3779B97F4A7C15) }
    }

    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((self.state >> 11) as f64) / ((1u64 << 53) as f64)
    }

    #[inline]
    pub fn next_gaussian(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-12);
        let u2 = self.next_f64().max(1e-12);
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }
}

#[wasm_bindgen]
pub struct MonteCarloBallStat {
    pub ball: i32,
    pub mean_score: f64,
    pub std_dev: f64,
    pub p5: f64,
    pub p95: f64,
    pub stability_index: f64,
}

#[wasm_bindgen]
pub struct MonteCarloReportHpc {
    stats: Vec<MonteCarloBallStat>,
}

#[wasm_bindgen]
impl MonteCarloReportHpc {
    #[wasm_bindgen(getter)]
    pub fn count(&self) -> usize {
        self.stats.len()
    }

    pub fn get_ball(&self, idx: usize) -> i32 {
        self.stats[idx].ball
    }

    pub fn get_mean(&self, idx: usize) -> f64 {
        self.stats[idx].mean_score
    }

    pub fn get_std_dev(&self, idx: usize) -> f64 {
        self.stats[idx].std_dev
    }

    pub fn get_p5(&self, idx: usize) -> f64 {
        self.stats[idx].p5
    }

    pub fn get_p95(&self, idx: usize) -> f64 {
        self.stats[idx].p95
    }

    pub fn get_stability_index(&self, idx: usize) -> f64 {
        self.stats[idx].stability_index
    }
}

/// Stress Test Monte Carlo HPC à haute densité d'itérations
#[wasm_bindgen]
pub fn run_monte_carlo_whatif_hpc(
    base_matrix: &[f64],
    k_algos: usize,
    base_weights: &[f64],
    iterations: usize,
    noise_std_dev: f64,
    seed: u64,
) -> MonteCarloReportHpc {
    let mut prng = DeterministicPrng::new(seed);
    let mut linear_scores = vec![0.0f64; iterations * 90];
    let mut noisy_weights = vec![0.0f64; k_algos];

    for r in 0..iterations {
        let mut sum_w = 0.0f64;
        for j in 0..k_algos {
            let gauss = prng.next_gaussian();
            let w = (base_weights[j] + gauss * noise_std_dev).max(0.0001);
            noisy_weights[j] = w;
            sum_w += w;
        }

        for j in 0..k_algos {
            noisy_weights[j] /= sum_w.max(1e-9);
        }

        let offset = r * 90;
        for b in 0..90 {
            let mut score = 0.0f64;
            for j in 0..k_algos {
                score += base_matrix[b * k_algos + j] * noisy_weights[j];
            }
            linear_scores[offset + b] = score;
        }
    }

    let mut ball_stats = Vec::with_capacity(90);
    let mut single_ball = vec![0.0f64; iterations];

    for b in 0..90 {
        let mut sum = 0.0f64;
        for r in 0..iterations {
            let val = linear_scores[r * 90 + b];
            single_ball[r] = val;
            sum += val;
        }
        let mean = sum / (iterations as f64);

        let mut var_sum = 0.0f64;
        for r in 0..iterations {
            var_sum += (single_ball[r] - mean).powi(2);
        }
        let std_dev = (var_sum / (iterations as f64)).sqrt();

        single_ball.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p5_idx = ((iterations as f64) * 0.05).floor() as usize;
        let p95_idx = (((iterations as f64) * 0.95).floor() as usize).min(iterations - 1);

        let stability = (1.0 - (std_dev / mean.max(1.0))).clamp(0.0, 1.0);

        ball_stats.push(MonteCarloBallStat {
            ball: (b + 1) as i32,
            mean_score: mean,
            std_dev,
            p5: single_ball[p5_idx],
            p95: single_ball[p95_idx],
            stability_index: stability * 100.0,
        });
    }

    ball_stats.sort_by(|a, b| b.mean_score.partial_cmp(&a.mean_score).unwrap_or(std::cmp::Ordering::Equal));

    MonteCarloReportHpc { stats: ball_stats }
}

/// Divergence Kullback-Leibler continue sur Simplex 90D
#[wasm_bindgen]
pub fn compute_kl_divergence_hpc(p_base: &[f64], p_sim: &[f64]) -> f64 {
    if p_base.len() < 90 || p_sim.len() < 90 {
        return 0.0;
    }
    let mut kl = 0.0f64;
    for i in 0..90 {
        let p = p_base[i].max(1e-12);
        let q = p_sim[i].max(1e-12);
        kl += p * (p / q).ln();
    }
    kl.max(0.0)
}
