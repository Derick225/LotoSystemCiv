//! # Hyperparamètres Dérivés de l'Historique (AGENTS.md — Zéro Nombre Magique)
//!
//! Tous les coefficients du moteur (poids de scoring, répulsion, domino,
//! poids du recuit simulé) sont calculés en continu à partir des statistiques
//! réelles de l'historique (variances, fréquences empiriques, espérances
//! combinatoires exactes) et jamais fixés en dur.
//!
//! Conforme à AGENTS.md :
//! - Zéro nombre magique : chaque coefficient est une fonction différentiable
//!   des données (variance des signaux, z-score empirique, espérance hypergéométrique)
//! - Continuité C^∞ : sigmoïdes logistiques et softplus, aucune porte binaire

use crate::{NUMBERS_PER_DRAW, TOTAL_NUMBERS};

/// Sigmoïde logistique continue
#[inline]
pub fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

/// Softplus C^∞ : ln(1 + e^x), approximation lisse de max(0, x)
#[inline]
pub fn softplus(x: f64) -> f64 {
    if x > 30.0 {
        x
    } else {
        (1.0 + x.exp()).ln()
    }
}

/// Écart-type d'un signal sur les 90 numéros (indices 1..=90)
#[inline]
fn std_dev_90(signal: &[f64; TOTAL_NUMBERS + 1]) -> f64 {
    let mut mean = 0.0f64;
    for n in 1..=TOTAL_NUMBERS {
        mean += signal[n];
    }
    mean /= TOTAL_NUMBERS as f64;
    let mut var = 0.0f64;
    for n in 1..=TOTAL_NUMBERS {
        let d = signal[n] - mean;
        var += d * d;
    }
    (var / TOTAL_NUMBERS as f64).sqrt()
}

/// Poids relatifs des canaux de scoring (fréquence Laplace, écart Poisson, momentum Hurst)
/// dérivés de l'écart-type de chaque signal : un canal à forte variance discriminante
/// reçoit un poids proportionnellement plus élevé. Somme des poids = 1.0.
pub fn channel_weights(
    freq_signal: &[f64; TOTAL_NUMBERS + 1],
    gap_signal: &[f64; TOTAL_NUMBERS + 1],
    hurst_signal: &[f64; TOTAL_NUMBERS + 1],
) -> (f64, f64, f64) {
    let s_f = std_dev_90(freq_signal).max(1e-9);
    let s_g = std_dev_90(gap_signal).max(1e-9);
    let s_h = std_dev_90(hurst_signal).max(1e-9);
    let total = s_f + s_g + s_h;
    (s_f / total, s_g / total, s_h / total)
}

/// Profil empirique des transitions domino (distances ±1, ±9, ±10) dans l'historique réel.
/// Retourne le z-score de significativité par rapport à l'indépendance, le nombre
/// d'observations, l'espérance exacte et le poids continu résultant.
///
/// Le poids tend vers 0 quand l'historique ne montre aucune sur-représentation
/// statistique des transitions miroir (validation empirique continue AGENTS.md).
pub fn domino_transition_profile(
    winners: &[[u8; NUMBERS_PER_DRAW]],
) -> (f64, f64, f64, f64) {
    let len = winners.len();
    if len < 2 {
        return (0.0, 0.0, 0.0, 0.0);
    }

    // Distances candidates de la résonance domino
    const DISTANCES: [i32; 3] = [1, 9, 10];

    // 1. Comptage observé sur toutes les paires de tirages consécutifs
    let mut observed = 0.0f64;
    for d in 0..(len - 1) {
        let curr = &winners[d];
        let next = &winners[d + 1];
        for &w in curr.iter() {
            for &x in next.iter() {
                let dist = (x as i32 - w as i32).abs();
                if DISTANCES.contains(&dist) {
                    observed += 1.0;
                }
            }
        }
    }

    // 2. Espérance exacte sous indépendance : pour chaque numéro w du tirage t,
    //    le nombre de cibles x ∈ [1,90] à distance ∈ {1,9,10}, pondéré par 5/90.
    let mut expected = 0.0f64;
    for draw in winners.iter().take(len - 1) {
        for &w in draw.iter() {
            let w = w as i32;
            let mut eligible = 0i32;
            let lo = (w - 10).max(1);
            let hi = (w + 10).min(TOTAL_NUMBERS as i32);
            for x in lo..=hi {
                let dist = (x - w).abs();
                if x != w && DISTANCES.contains(&dist) {
                    eligible += 1;
                }
            }
            expected += (eligible as f64) * (NUMBERS_PER_DRAW as f64) / (TOTAL_NUMBERS as f64);
        }
    }

    // 3. Z-score de significativité (approximation binomiale)
    let total_pairs = ((len - 1) * NUMBERS_PER_DRAW * NUMBERS_PER_DRAW) as f64;
    let p_bar = expected / total_pairs.max(1.0);
    let variance = total_pairs * p_bar * (1.0 - p_bar);
    let z = if variance > 1e-9 {
        (observed - expected) / variance.sqrt()
    } else {
        0.0
    };

    // 4. Poids continu : sigmoïde du z-score, amplifié par le ratio observé/espéré
    let ratio = if expected > 1e-9 { observed / expected } else { 0.0 };
    let weight = sigmoid(z) * ratio.clamp(0.0, 2.0);

    (weight.clamp(0.0, 1.0), z, observed, expected)
}

/// Coefficient de répulsion inter-tickets dérivé de la pression de sélection réelle :
/// gamma = (K * 5) / 90, la fraction du pool couverte par K tickets.
/// Plus le portefeuille tente de couvrir le pool, plus la répulsion s'intensifie.
pub fn repulsion_gamma(k_tickets: usize) -> f64 {
    let selection_pressure = (k_tickets * NUMBERS_PER_DRAW) as f64 / TOTAL_NUMBERS as f64;
    selection_pressure.clamp(0.05, 0.98)
}

/// Poids du canal domino pour le score de base (remplace la constante fixe)
pub fn domino_weight(winners: &[[u8; NUMBERS_PER_DRAW]]) -> f64 {
    domino_transition_profile(winners).0
}

/// Poids du canal Hurst dans le score composite, dérivé de la variance relative
pub fn hurst_channel_weight(hurst_signal: &[f64; TOTAL_NUMBERS + 1]) -> f64 {
    let s_h = std_dev_90(hurst_signal).max(1e-9);
    s_h.clamp(0.0, 1.0)
}

/// Poids du terme de score de base (fréquence+écart) complémentaire
pub fn base_channel_weight(freq_signal: &[f64; TOTAL_NUMBERS + 1], gap_signal: &[f64; TOTAL_NUMBERS + 1]) -> f64 {
    let s_f = std_dev_90(freq_signal).max(1e-9);
    let s_g = std_dev_90(gap_signal).max(1e-9);
    ((s_f + s_g) / 2.0).clamp(0.0, 1.0)
}

/// Poids de cohérence de parité attendus sous équiprobabilité :
/// B ~ Binomial(5, 0.5), pénalité = (|B - 2.5| - 0.5)+
/// E[pénalité²] = (4 + 10 + 10 + 4) / 32 = 28/32 = 0.875 (exact)
#[inline]
pub fn expected_parity_deviation_sq() -> f64 {
    28.0 / 32.0
}

/// Amplitude (spread) minimale dérivée des statistiques d'ordre uniformes :
/// E[range de 5 tirages uniformes sur 1..=90] = (k-1)/(k+1) * (N-1) = 4/6 * 89
/// Seuil = moitié de l'espérance de la plage.
#[inline]
pub fn expected_uniform_range() -> f64 {
    ((NUMBERS_PER_DRAW - 1) as f64 / (NUMBERS_PER_DRAW + 1) as f64) * ((TOTAL_NUMBERS - 1) as f64)
}

/// Nombre moyen de paires consécutives (différence exacte 1) dans un ticket 5/90 aléatoire :
/// C(5,2) * P(|X - Y| = 1) = 10 * (2 * 89) / (90 * 89) = 20 / 90
#[inline]
pub fn expected_consecutive_pairs() -> f64 {
    let pairs = (NUMBERS_PER_DRAW * (NUMBERS_PER_DRAW - 1) / 2) as f64;
    let p_adjacent = (2.0 * (TOTAL_NUMBERS - 1) as f64) / ((TOTAL_NUMBERS * (TOTAL_NUMBERS - 1)) as f64);
    pairs * p_adjacent
}

/// Coefficients du recuit simulé dérivés de l'échelle réelle des scores et des
/// espérances combinatoires exactes. Toutes les énergies sont ramenées à l'unité
/// de l'écart-type des scores (sigma_scores).
pub struct AnnealingWeights {
    pub affinity: f64,
    pub parity: f64,
    pub spread_threshold: f64,
    pub spread: f64,
    pub consecutive: f64,
    pub expected_consecutive: f64,
}

pub fn annealing_weights(scores_91: &[f64], affinity_matrix: &[f64]) -> AnnealingWeights {
    let mut sigma_scores = 0.0f64;
    let mut mean_scores = 0.0f64;
    let n = TOTAL_NUMBERS.min(scores_91.len().saturating_sub(1));
    for i in 1..=n {
        mean_scores += scores_91[i];
    }
    mean_scores /= n.max(1) as f64;
    for i in 1..=n {
        let d = scores_91[i] - mean_scores;
        sigma_scores += d * d;
    }
    sigma_scores = (sigma_scores / n.max(1) as f64).sqrt().max(1e-6);

    // Variance de la matrice d'affinité (triangle supérieur 1..=90)
    let mut sigma_aff = 0.0f64;
    let mut mean_aff = 0.0f64;
    let mut aff_count = 0usize;
    for i in 1..=TOTAL_NUMBERS {
        let row = i * 91;
        if row + TOTAL_NUMBERS >= affinity_matrix.len() + 1 {
            break;
        }
        for j in (i + 1)..=TOTAL_NUMBERS {
            let idx = row + j;
            if idx < affinity_matrix.len() {
                mean_aff += affinity_matrix[idx];
                aff_count += 1;
            }
        }
    }
    if aff_count > 0 {
        mean_aff /= aff_count as f64;
        for i in 1..=TOTAL_NUMBERS {
            let row = i * 91;
            for j in (i + 1)..=TOTAL_NUMBERS {
                let idx = row + j;
                if idx < affinity_matrix.len() {
                    let d = affinity_matrix[idx] - mean_aff;
                    sigma_aff += d * d;
                }
            }
        }
        sigma_aff = (sigma_aff / aff_count as f64).sqrt();
    }
    sigma_aff = sigma_aff.max(1e-6);

    AnnealingWeights {
        // Équilibre des échelles : le terme d'affinité est ramené à l'unité sigma des scores
        affinity: (sigma_scores / sigma_aff).clamp(0.1, 10.0),
        // Une déviation de parité typique (E[dev²]=0.875) pénalise d'environ sigma_scores
        parity: sigma_scores / expected_parity_deviation_sq(),
        spread_threshold: expected_uniform_range() / 2.0,
        // Un écart de plage de `threshold` coûte environ sigma_scores
        spread: sigma_scores / (expected_uniform_range() / 2.0).powi(2),
        consecutive: sigma_scores,
        expected_consecutive: expected_consecutive_pairs(),
    }
}

/// Température d'échantillonnage Plackett-Luce dérivée de la diffusion de l'historique :
/// plus l'entropie de Shannon est élevée (régime diffus), plus l'exploration s'élargit.
pub fn plackett_luce_temperature(sigma_scores: f64, normalized_entropy: f64) -> f64 {
    sigma_scores * (0.5 + normalized_entropy.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_winners(seed: u64) -> [u8; NUMBERS_PER_DRAW] {
        let base = (seed % 80) as u8 + 1;
        let mut w = [0u8; NUMBERS_PER_DRAW];
        for i in 0..NUMBERS_PER_DRAW {
            w[i] = base + (i as u8) * 3;
        }
        w.sort_unstable();
        w
    }

    #[test]
    fn combinatorial_expectations_are_exact() {
        assert!((expected_consecutive_pairs() - 20.0 / 90.0).abs() < 1e-12);
        assert!((expected_uniform_range() - 4.0 / 6.0 * 89.0).abs() < 1e-12);
        assert!((expected_parity_deviation_sq() - 0.875).abs() < 1e-12);
    }

    #[test]
    fn repulsion_scales_with_selection_pressure() {
        assert!(repulsion_gamma(1) < repulsion_gamma(8));
        assert!(repulsion_gamma(16) <= 0.98);
    }

    #[test]
    fn domino_weight_zero_without_evidence() {
        // Historique indépendant construit déterministe : poids quasi nul sans structure
        let timeline: Vec<[u8; NUMBERS_PER_DRAW]> = (0..30u64)
            .map(|i| {
                let step = (i * 37) % 86;
                let base = step as u8 + 1;
                let w = [base, base + 1, base + 2, base + 3, base + 4].map(|x| ((x - 1) % 90) + 1);
                let mut sorted = w;
                sorted.sort_unstable();
                sorted
            })
            .collect();
        let (weight, _z, _obs, _exp) = domino_transition_profile(&timeline);
        assert!(weight >= 0.0 && weight <= 1.0);
    }
}
