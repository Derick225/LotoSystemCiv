//! # Validation Renforcée — Holdout & Block Bootstrap Déterministe (AGENTS.md)
//!
//! - Holdout final : les D derniers tirages (fraction HOLDOUT_FRACTION de l'historique,
//!   minimum HOLDOUT_MIN_DRAWS) sont réservés et jamais touchés par le tuning.
//! - Block bootstrap : stabilité des métriques par suppression déterministe de blocs
//!   contigus (jackknife par blocs, aucun PRNG requis, 100% reproductible).

/// Fraction de l'historique réservée au holdout final (spécification du plan de validation)
pub const HOLDOUT_FRACTION: f64 = 0.10;
/// Taille minimale du holdout pour qu'une évaluation ait du sens statistique
pub const HOLDOUT_MIN_DRAWS: usize = 5;
/// Taille minimale du bloc pour le jackknife (borne inférieure de variance)
pub const BLOCK_MIN_SIZE: usize = 4;

/// Nombre de tirages du holdout final pour une timeline donnée
pub fn holdout_size(total_draws: usize) -> usize {
    if total_draws < 3 * HOLDOUT_MIN_DRAWS {
        return 0; // Historique trop court : pas de holdout (évaluation sur tout, signalé au rapport)
    }
    let raw_holdout = ((total_draws as f64) * HOLDOUT_FRACTION).round() as usize;
    raw_holdout
        .max(HOLDOUT_MIN_DRAWS)
        .min(total_draws / 3)
}

/// Découpe [0, total) en blocs contigus de taille quasi-constante (déterministe).
/// Le nombre de blocs dérive de la racine carrée de la taille d'échantillon.
pub fn block_ranges(total: usize) -> Vec<(usize, usize)> {
    if total == 0 {
        return Vec::new();
    }
    if total < 2 * BLOCK_MIN_SIZE {
        return vec![(0, total)];
    }
    let num_blocks = ((total as f64).sqrt().round() as usize)
        .clamp(2, total / BLOCK_MIN_SIZE);
    let block_size = total / num_blocks;
    let mut ranges = Vec::with_capacity(num_blocks);
    let mut start = 0usize;
    for b in 0..num_blocks {
        let extra = if b < total % num_blocks { 1 } else { 0 };
        let end = (start + block_size + extra).min(total);
        ranges.push((start, end));
        start = end;
    }
    ranges
}

/// Statistiques de bootstrap par blocs : (moyenne, écart-type) d'un échantillon de métriques
pub fn block_stats(values: &[f64]) -> (f64, f64) {
    let n = values.len();
    if n == 0 {
        return (0.0, 0.0);
    }
    let mean = values.iter().sum::<f64>() / n as f64;
    if n == 1 {
        return (mean, 0.0);
    }
    let var = values.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / (n - 1) as f64;
    (mean, var.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holdout_scaling() {
        assert_eq!(holdout_size(10), 0); // trop court
        assert_eq!(holdout_size(20), 5); // plancher HOLDOUT_MIN_DRAWS
        assert_eq!(holdout_size(60), 6); // 10%
        assert_eq!(holdout_size(200), 20);
        assert!(holdout_size(1000) <= 333);
    }

    #[test]
    fn block_partition_covers_all() {
        let ranges = block_ranges(100);
        assert!(ranges.len() >= 2);
        assert_eq!(ranges[0].0, 0);
        assert_eq!(ranges[ranges.len() - 1].1, 100);
        for w in ranges.windows(2) {
            assert_eq!(w[0].1, w[1].0, "Blocs contigus sans trou ni chevauchement");
        }
    }

    #[test]
    fn block_partition_handles_tiny_samples() {
        assert_eq!(block_ranges(0), Vec::new());
        assert_eq!(block_ranges(1), vec![(0, 1)]);
        assert_eq!(block_ranges(7), vec![(0, 7)]);
    }

    #[test]
    fn block_stats_math() {
        let (m, s) = block_stats(&[1.0, 2.0, 3.0]);
        assert!((m - 2.0).abs() < 1e-12);
        assert!((s - 1.0).abs() < 1e-12);
    }
}
