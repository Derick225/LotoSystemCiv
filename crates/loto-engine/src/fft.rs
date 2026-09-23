use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use std::f64::consts::PI;

/// Analyse spectrale FFT 100% déterministe et vectorisée.
/// Évalue la densité spectrale de puissance (PSD) et identifie la fréquence et période dominante.
#[wasm_bindgen]
pub struct SpectralAnalysisResult {
    energy: f64,
    dominant_period: f64,
    dominant_frequency: f64,
    psd: Vec<f64>,
}

#[wasm_bindgen]
impl SpectralAnalysisResult {
    #[wasm_bindgen(getter)]
    pub fn energy(&self) -> f64 {
        self.energy
    }

    #[wasm_bindgen(getter)]
    pub fn dominant_period(&self) -> f64 {
        self.dominant_period
    }

    #[wasm_bindgen(getter)]
    pub fn dominant_frequency(&self) -> f64 {
        self.dominant_frequency
    }

    #[wasm_bindgen(getter)]
    pub fn psd(&self) -> Vec<f64> {
        self.psd.clone()
    }
}

/// Calcule la Transformée de Fourier Rapide (FFT) via `rustfft` sur une tranche de signal `&[f64]`.
/// Applique un fenêtrage de Hann continu C^∞ pour éliminer les discontinuités spectrales de bord.
#[wasm_bindgen]
pub fn compute_fft_power_spectrum(signal: &[f64]) -> Vec<f64> {
    let len = signal.len();
    if len == 0 {
        return Vec::new();
    }

    // Puissance de 2 pour la FFT optimisée
    let mut n = 1;
    while n < len {
        n <<= 1;
    }

    // Application de la fenêtre de Hann continue : w[i] = 0.5 * (1 - cos(2*pi*i / (N-1)))
    let mut buffer: Vec<Complex<f64>> = Vec::with_capacity(n);
    let denominator = if len > 1 { (len - 1) as f64 } else { 1.0 };

    for (i, &val) in signal.iter().enumerate() {
        let window = 0.5 * (1.0 - ((2.0 * PI * (i as f64)) / denominator).cos());
        buffer.push(Complex { re: val * window, im: 0.0 });
    }

    // Zero-padding jusqu'à la puissance de 2
    for _ in len..n {
        buffer.push(Complex { re: 0.0, im: 0.0 });
    }

    // Exécution de l'algorithme FFT haute performance (O(N log N))
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut buffer);

    // Calcul de la densité spectrale de puissance (PSD unilatérale)
    let half_n = (n / 2) + 1;
    let mut psd = Vec::with_capacity(half_n);
    let norm = n as f64;

    for item in buffer.iter().take(half_n) {
        let power = (item.re * item.re + item.im * item.im) / norm;
        psd.push(power);
    }

    psd
}

/// Analyse spectrale complète d'un signal temporel (0/1 ou centré).
/// Conforme à la règle Zéro Nombre Magique : les périodes sont dérivées de la résolution spectrale continue.
#[wasm_bindgen]
pub fn analyze_signal_spectrum(signal: &[f64]) -> SpectralAnalysisResult {
    let len = signal.len();
    if len < 4 {
        return SpectralAnalysisResult {
            energy: 0.0,
            dominant_period: 0.0,
            dominant_frequency: 0.0,
            psd: Vec::new(),
        };
    }

    let psd = compute_fft_power_spectrum(signal);
    let mut max_power = 0.0;
    let mut dominant_idx = 1;
    let mut total_energy = 0.0;

    // Détection de la composante fondamentale (hors DC offset idx 0)
    for (k, &power) in psd.iter().enumerate().skip(1) {
        total_energy += power;
        if power > max_power {
            max_power = power;
            dominant_idx = k;
        }
    }

    let dominant_freq = dominant_idx as f64;
    let dominant_period = if dominant_freq > 0.0 {
        (signal.len() as f64) / dominant_freq
    } else {
        0.0
    };

    SpectralAnalysisResult {
        energy: total_energy,
        dominant_period,
        dominant_frequency: dominant_freq,
        psd,
    }
}
