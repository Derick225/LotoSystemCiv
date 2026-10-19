//! # Mathématiques Combinatoires Exactes & PRNG Déterministe (AGENTS.md)
//!
//! Fournit les probabilités hypergéométriques exactes du tirage 5/90,
//! un hachage FNV-1a déterministe et un LCG seedé pour l'échantillonnage.
//!
//! Conforme à AGENTS.md :
//! - Zéro nombre magique : toutes les probabilités sont calculées par coefficients
//!   binomiaux exacts (u128) à partir des paramètres structurels N=90, K=5.
//! - 100% Déterministe : LCG à congruence linéaire, aucune source d'entropie externe.

/// Coefficient binomial exact par produit multiplicatif (u128, aucun débordement pour n <= 90)
#[inline]
pub fn binomial(n: u128, k: u128) -> u128 {
    if k > n {
        return 0;
    }
    let k = k.min(n - k);
    let mut result: u128 = 1;
    for i in 0..k {
        result = result * (n - i) / (i + 1);
    }
    result
}

/// Probabilité exacte qu'un ticket de `ticket_size` numéros contienne
/// au moins `min_hits` numéros gagnants parmi `pool_winners` tirés sur `pool_size`.
///
/// Hypergéométrique : P(X >= min_hits) = Sum_{i=min_hits}^{ticket_size}
///                                     C(K,i) * C(N-K, ticket_size-i) / C(N, ticket_size)
#[inline]
pub fn hypergeometric_tail_prob(
    min_hits: u32,
    ticket_size: u32,
    pool_winners: u32,
    pool_size: u32,
) -> f64 {
    let total_combos = binomial(pool_size as u128, ticket_size as u128);
    if total_combos == 0 {
        return 0.0;
    }
    let mut favorable: u128 = 0;
    let i_max = ticket_size.min(pool_winners);
    for i in min_hits..=i_max {
        let hits = binomial(pool_winners as u128, i as u128);
        let misses = binomial((pool_size - pool_winners) as u128, (ticket_size - i) as u128);
        favorable += hits * misses;
    }
    (favorable as f64) / (total_combos as f64)
}

/// Probabilité exacte P(ticket 5/90 contient >= k numéros gagnants)
#[inline]
pub fn ticket_prob_at_least(k: u32) -> f64 {
    hypergeometric_tail_prob(k, crate::NUMBERS_PER_DRAW as u32, crate::NUMBERS_PER_DRAW as u32, crate::TOTAL_NUMBERS as u32)
}

/// Probabilité exacte P(au moins un numéro du ticket touche) = 1 - C(85,5)/C(90,5)
#[inline]
pub fn ticket_prob_at_least_one() -> f64 {
    1.0 - (binomial(85, 5) as f64) / (binomial(90, 5) as f64)
}

/// Hachage FNV-1a 64-bit déterministe d'un flux d'octets (seed canonique pour PRNG)
pub fn fnv1a_64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Générateur Linéaire Congruentiel 64-bit déterministe (Numerical Recipes).
/// Conforme AGENTS.md : reproductibilité absolue à seed identique.
pub struct DeterministicLcg {
    state: u64,
}

impl DeterministicLcg {
    #[inline]
    pub fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed },
        }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.state
    }

    /// Uniforme continue sur [0.0, 1.0) sur 53 bits de précision
    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) / ((1u64 << 53) as f64)
    }

    /// Bruit de Gumbel(0,1) : -ln(-ln(U)) pour l'échantillonnage Plackett-Luce
    #[inline]
    pub fn next_gumbel(&mut self) -> f64 {
        let u = self.next_f64().max(1e-12);
        -(-u.ln()).ln()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binomial_exact_values() {
        assert_eq!(binomial(5, 2), 10);
        assert_eq!(binomial(90, 5), 43_949_268);
        assert_eq!(binomial(85, 3), 98_770);
    }

    #[test]
    fn hypergeometric_p_at_least_1_matches_complement() {
        let p = ticket_prob_at_least_one();
        let expected = 1.0 - (binomial(85, 5) as f64) / (binomial(90, 5) as f64);
        assert!((p - expected).abs() < 1e-15);
        assert!(p > 0.24 && p < 0.26);
    }

    #[test]
    fn hypergeometric_monotonicity() {
        let p1 = ticket_prob_at_least(1);
        let p2 = ticket_prob_at_least(2);
        let p3 = ticket_prob_at_least(3);
        assert!(p1 > p2 && p2 > p3);
        assert!(p3 > 0.0005 && p3 < 0.01);
    }

    #[test]
    fn lcg_determinism() {
        let mut a = DeterministicLcg::new(42);
        let mut b = DeterministicLcg::new(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }
}
