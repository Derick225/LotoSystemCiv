//! # Dynamiques Complexes Inter-Tirages (HPC Rust WASM)
//!
//! Implémente les 4 dynamiques avancées selon AGENTS.md :
//! 1. Effet Domino (Advection cinétique temporelle & ondes de réverbération)
//! 2. Effet Papillon (Exposant de Lyapunov local inter-tirages & espace des phases)
//! 3. Effet de Cascade (Noyau de chaleur de graphe Graph Heat Kernel exp(-tL))
//! 4. Réaction en Chaîne (Percolation SOC & résonance d'interférence constructive d'ondes)

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmHeatKernelResult {
    diffusion_matrix: Vec<f64>,
    harmonic_centralities: Vec<f64>,
    trace_energy: f64,
}

#[wasm_bindgen]
impl WasmHeatKernelResult {
    #[wasm_bindgen(getter)]
    pub fn diffusion_matrix(&self) -> Vec<f64> {
        self.diffusion_matrix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn harmonic_centralities(&self) -> Vec<f64> {
        self.harmonic_centralities.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn trace_energy(&self) -> f64 {
        self.trace_energy
    }
}

#[wasm_bindgen]
pub struct WasmDominoResult {
    domino_energies: Vec<f64>,
    lead_trigger_numbers: Vec<i32>,
    kinetic_dissipation_rate: f64,
}

#[wasm_bindgen]
impl WasmDominoResult {
    #[wasm_bindgen(getter)]
    pub fn domino_energies(&self) -> Vec<f64> {
        self.domino_energies.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn lead_trigger_numbers(&self) -> Vec<i32> {
        self.lead_trigger_numbers.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn kinetic_dissipation_rate(&self) -> f64 {
        self.kinetic_dissipation_rate
    }
}

#[wasm_bindgen]
pub struct WasmButterflyResult {
    pub lyapunov_exponent: f64,
    pub sensitivity_regime: f64,
    pub phase_attractor_x: f64,
    pub phase_attractor_y: f64,
    pub phase_attractor_z: f64,
    pub is_chaotic: bool,
}

#[wasm_bindgen]
pub struct WasmChainReactionResult {
    resonance_spectrum: Vec<f64>,
    avalanche_critical_numbers: Vec<i32>,
    pub max_constructive_amplitude: f64,
    pub percolation_density: f64,
}

#[wasm_bindgen]
impl WasmChainReactionResult {
    #[wasm_bindgen(getter)]
    pub fn resonance_spectrum(&self) -> Vec<f64> {
        self.resonance_spectrum.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn avalanche_critical_numbers(&self) -> Vec<i32> {
        self.avalanche_critical_numbers.clone()
    }
}

/// 1. Effet de Cascade : Noyau de Chaleur de Graphe (Graph Heat Kernel exp(-tL))
/// Résout K_t = exp(-t * L) où L = I - D^{-1/2} W D^{-1/2} est le Laplacien normalisé symétrique.
/// Utilise une approximation polynomiale de Taylor avec normalisation stochastique continue.
#[wasm_bindgen]
pub fn compute_graph_heat_kernel_wasm(
    weights_flat: &[f64],
    n: usize,
    diffusion_time_t: f64,
) -> WasmHeatKernelResult {
    if n == 0 || weights_flat.len() < n * n {
        return WasmHeatKernelResult {
            diffusion_matrix: vec![],
            harmonic_centralities: vec![],
            trace_energy: 0.0,
        };
    }

    // Calcul des degrés continus D_i = sum_j W_ij
    let mut degrees = vec![0.0f64; n];
    for i in 0..n {
        let mut d = 0.0f64;
        for j in 0..n {
            d += weights_flat[i * n + j].max(0.0);
        }
        degrees[i] = d.max(1e-9);
    }

    // Calcul du Laplacien normalisé L = I - D^{-1/2} W D^{-1/2}
    let mut laplacian = vec![0.0f64; n * n];
    for i in 0..n {
        let inv_sqrt_di = 1.0 / degrees[i].sqrt();
        for j in 0..n {
            let inv_sqrt_dj = 1.0 / degrees[j].sqrt();
            let w = weights_flat[i * n + j].max(0.0);
            let normalized_w = inv_sqrt_di * w * inv_sqrt_dj;
            if i == j {
                laplacian[i * n + j] = 1.0 - normalized_w;
            } else {
                laplacian[i * n + j] = -normalized_w;
            }
        }
    }

    // Exponentielle de matrice exp(-t * L) via Taylor jusqu'à convergence
    // exp(-tL) = I - tL + (tL)^2 / 2! - (tL)^3 / 3! + ...
    let t = diffusion_time_t.max(0.01).min(5.0);
    let mut current_term = vec![0.0f64; n * n];
    let mut exp_matrix = vec![0.0f64; n * n];

    // Initialisation avec la matrice Identité I
    for i in 0..n {
        exp_matrix[i * n + i] = 1.0;
        current_term[i * n + i] = 1.0;
    }

    // Termes de Taylor jusqu'à l'ordre 12
    let max_order = 12;
    for k in 1..=max_order {
        // next_term = current_term * (-t * L) / k
        let mut next_term = vec![0.0f64; n * n];
        let factor = -t / (k as f64);

        for i in 0..n {
            for j in 0..n {
                let mut sum = 0.0f64;
                for p in 0..n {
                    sum += current_term[i * n + p] * laplacian[p * n + j];
                }
                next_term[i * n + j] = sum * factor;
            }
        }

        // Accumulation dans exp_matrix
        let mut max_diff = 0.0f64;
        for idx in 0..(n * n) {
            exp_matrix[idx] += next_term[idx];
            let abs_val = next_term[idx].abs();
            if abs_val > max_diff {
                max_diff = abs_val;
            }
        }

        current_term = next_term;
        if max_diff < 1e-8 {
            break;
        }
    }

    // Normalisation continue stochastique par ligne pour obtenir les probabilités de diffusion
    let mut normalized_diffusion = vec![0.0f64; n * n];
    let mut harmonic_centralities = vec![0.0f64; n];
    let mut trace_energy = 0.0f64;

    for i in 0..n {
        trace_energy += exp_matrix[i * n + i];
        let mut row_sum = 0.0f64;
        for j in 0..n {
            row_sum += exp_matrix[i * n + j].max(0.0);
        }
        let denom = row_sum.max(1e-9);
        for j in 0..n {
            let val = exp_matrix[i * n + j].max(0.0) / denom;
            normalized_diffusion[i * n + j] = val;
            harmonic_centralities[j] += val;
        }
    }

    // Normalisation des centralités sur [0, 1]
    for c in &mut harmonic_centralities {
        *c /= n as f64;
    }

    WasmHeatKernelResult {
        diffusion_matrix: normalized_diffusion,
        harmonic_centralities,
        trace_energy,
    }
}

/// 2. Effet Domino : Advection Cinétique Déterministe et Ondes de Réverbération
#[wasm_bindgen]
pub fn compute_domino_advection_wasm(
    history_flat: &[i32],
    draws_count: usize,
    damping_gamma: f64,
) -> WasmDominoResult {
    let mut domino_energies = vec![0.0f64; 91];
    let win_cols = 5;
    let gamma = damping_gamma.max(0.05).min(2.0);

    let max_draws = draws_count.min(history_flat.len() / win_cols);
    if max_draws == 0 {
        return WasmDominoResult {
            domino_energies,
            lead_trigger_numbers: vec![],
            kinetic_dissipation_rate: gamma,
        };
    }

    // Propagation de l'énergie cinétique le long de la chaîne séquentielle
    for d in 0..max_draws {
        let lag = (d + 1) as f64;
        let lag_attenuation = (-gamma * lag * 0.25).exp();

        for col in 0..win_cols {
            let num = history_flat[d * win_cols + col] as usize;
            if num >= 1 && num <= 90 {
                // Impulsion directe
                domino_energies[num] += 10.0 * lag_attenuation;

                // Réverbération harmonique miroir diacritique
                let mir = mirror_number_fn(num);
                if mir >= 1 && mir <= 90 && mir != num {
                    domino_energies[mir] += 4.5 * lag_attenuation;
                }

                // Réverbération onde complémentaire 91
                let comp = 91 - num;
                if comp >= 1 && comp <= 90 && comp != num {
                    domino_energies[comp] += 4.0 * lag_attenuation;
                }
            }
        }
    }

    // Normalisation sigmoïde continue des énergies sur [0, 100]
    let mut indexed_energies: Vec<(usize, f64)> = Vec::with_capacity(90);
    for n in 1..=90 {
        let raw = domino_energies[n];
        let sigmoid_val = 100.0 / (1.0 + (-0.15 * (raw - 8.0)).exp());
        domino_energies[n] = (sigmoid_val * 100.0).round() / 100.0;
        indexed_energies.push((n, domino_energies[n]));
    }

    indexed_energies.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let lead_trigger_numbers: Vec<i32> = indexed_energies.iter().take(5).map(|(n, _)| *n as i32).collect();

    WasmDominoResult {
        domino_energies,
        lead_trigger_numbers,
        kinetic_dissipation_rate: gamma,
    }
}

/// 3. Effet Papillon : Exposant de Lyapunov Local et Trajectoire d'Attracteur
#[wasm_bindgen]
pub fn compute_butterfly_lyapunov_wasm(
    lag_series: &[f64],
    hurst_exponent: f64,
) -> WasmButterflyResult {
    let n = lag_series.len();
    if n < 4 {
        return WasmButterflyResult {
            lyapunov_exponent: 0.0,
            sensitivity_regime: 0.5,
            phase_attractor_x: 0.0,
            phase_attractor_y: 0.0,
            phase_attractor_z: hurst_exponent,
            is_chaotic: false,
        };
    }

    // Calcul des divergences successives |delta x_{k+1} - delta x_k|
    let mut sum_ln_divergence = 0.0f64;
    let mut count = 0;
    let eps = 1e-7;

    for k in 1..(n - 1) {
        let diff_next = (lag_series[k + 1] - lag_series[k]).abs() + eps;
        let diff_curr = (lag_series[k] - lag_series[k - 1]).abs() + eps;
        let ratio = diff_next / diff_curr;
        sum_ln_divergence += ratio.ln();
        count += 1;
    }

    let lyapunov_exp = if count > 0 {
        sum_ln_divergence / (count as f64)
    } else {
        0.0
    };

    // Sensibilité continue sigmoïde
    let sensitivity = 1.0 / (1.0 + (-2.5 * lyapunov_exp).exp());
    let is_chaotic = lyapunov_exp > 0.02;

    // Coordonnées de l'espace des phases (vitesse, accélération, dimension fractale Hurst)
    let vx = lag_series[n - 1] - lag_series[n - 2];
    let ax = if n >= 3 {
        lag_series[n - 1] - 2.0 * lag_series[n - 2] + lag_series[n - 3]
    } else {
        0.0
    };

    WasmButterflyResult {
        lyapunov_exponent: (lyapunov_exp * 10000.0).round() / 10000.0,
        sensitivity_regime: (sensitivity * 10000.0).round() / 10000.0,
        phase_attractor_x: vx,
        phase_attractor_y: ax,
        phase_attractor_z: hurst_exponent,
        is_chaotic,
    }
}

/// 4. Réaction en Chaîne : Résonance d'Interférence Constructive et Potentiel d'Avalanche
#[wasm_bindgen]
pub fn compute_chain_reaction_resonance_wasm(
    recent_draws_flat: &[i32],
    draws_count: usize,
    source_couplings: &[f64],
    num_sources: usize,
) -> WasmChainReactionResult {
    let mut spectrum = vec![0.0f64; 91];
    let win_cols = 5;
    let actual_draws = draws_count.min(recent_draws_flat.len() / win_cols);

    let sources = num_sources.min(source_couplings.len()).max(1);

    // Superposition d'ondes harmoniques Psi(n) = sum_d W(d) * cos(2*pi*f_d*n/90 + phi_d)
    for s in 0..sources {
        let weight = source_couplings[s].max(0.01);
        let freq = 1.0 + (s as f64) * 0.47;
        let phase = ((s + 1) as f64) * 0.6180339887; // Ratio d'or continu déterministe

        for n in 1..=90 {
            let theta = (2.0 * std::f64::consts::PI * freq * (n as f64)) / 90.0 + phase;
            let wave = theta.cos() * weight;
            spectrum[n] += wave;
        }
    }

    // Accumulation d'énergie d'avalanche (SOC - Self-Organized Criticality)
    let mut avalanche_potentials = vec![0.0f64; 91];
    for d in 0..actual_draws {
        let recency_weight = 1.0 / (1.0 + (d as f64) * 0.2);
        for col in 0..win_cols {
            let num = recent_draws_flat[d * win_cols + col] as usize;
            if num >= 1 && num <= 90 {
                avalanche_potentials[num] += recency_weight;
            }
        }
    }

    // Fusion de la résonance et du potentiel critique
    let mut critical_indexed: Vec<(usize, f64)> = Vec::with_capacity(90);
    let mut max_amp = 0.0f64;
    let mut total_crit_density = 0.0f64;

    for n in 1..=90 {
        let combined = spectrum[n] + avalanche_potentials[n] * 1.5;
        let score = 100.0 / (1.0 + (-0.8 * combined).exp());
        spectrum[n] = (score * 10.0).round() / 10.0;

        if spectrum[n] > max_amp {
            max_amp = spectrum[n];
        }
        total_crit_density += spectrum[n];
        critical_indexed.push((n, spectrum[n]));
    }

    critical_indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let avalanche_critical_numbers: Vec<i32> = critical_indexed.iter().take(5).map(|(n, _)| *n as i32).collect();

    WasmChainReactionResult {
        resonance_spectrum: spectrum,
        avalanche_critical_numbers,
        max_constructive_amplitude: max_amp,
        percolation_density: (total_crit_density / 90.0 * 100.0).round() / 100.0,
    }
}

/// Fonction utilitaire de miroir diacritique déterministe
fn mirror_number_fn(num: usize) -> usize {
    if num >= 10 && num <= 90 {
        let tens = num / 10;
        let units = num % 10;
        let inv = units * 10 + tens;
        if inv >= 1 && inv <= 90 {
            return inv;
        }
    }
    num
}
