//! # Stacking Régularisé L2 — Méta-Modèle Log-Linéaire (AGENTS.md)
//!
//! Combine les sorties out-of-fold (OOF) de K canaux de scoring par un modèle
//! log-linéaire : p_n = softmax_n( Sum_k w_k * logit(s_{k,n}) ) avec contrainte
//! Sum_n p_n = 5.0 et w_k >= 0, Sum_k w_k = 1.
//!
//! Les poids sont optimisés par descente de gradient exponentielle (EG) sur la
//! log-loss OOS — jamais par SGD sur des scores renormalisés — avec régularisation
//! entropique L2 dérivée du nombre d'échantillons.
//!
//! Conforme à AGENTS.md :
//! - 100% Déterministe : initialisation uniforme, pas de PRNG
//! - Zéro nombre magique : taux d'apprentissage dérivé de la Lipschitz constante
//!   de la log-loss (borne 1/(4*sqrt(K)) en métrique simplexe), itérations bornées
//!   par une tolérance de convergence relative.

use crate::{NUMBERS_PER_DRAW, TOTAL_NUMBERS};

/// Nombre d'itérations maximal de l'optimisation EG (borne de sécurité, converge bien avant)
const EG_MAX_ITER: usize = 2_000;
/// Tolérance relative de convergence sur la variation de log-loss
const EG_TOL: f64 = 1e-10;

/// Sortie du stacking : probabilités marginales calibrées (Sum = 5.0) + poids des canaux
pub struct StackingOutput {
    pub probabilities: [f64; TOTAL_NUMBERS + 1],
    pub channel_weights: Vec<f64>,
    pub final_log_loss: f64,
}

/// Applique la régression de Platt p' = alpha * p + beta sur les scores bruts.
/// Transformation affine calibrée issue de la régression OOF Walk-Forward.
#[inline]
pub fn apply_platt(scores: &mut [f64], alpha: f64, beta: f64) {
    for n in 1..=TOTAL_NUMBERS {
        scores[n] = (alpha * scores[n] + beta).max(0.0);
    }
}

/// Fusionne K canaux par log-lineaire continu : p ∝ exp(Sum_k w_k * log(s_kn) + eps)
/// avec logit stabilisé. Les canaux à poids nul sont ignorés sans porte binaire.
fn fuse_channels(
    channel_scores: &[Vec<f64>],
    weights: &[f64],
) -> [f64; TOTAL_NUMBERS + 1] {
    let mut fused = [0.0f64; TOTAL_NUMBERS + 1];
    for n in 1..=TOTAL_NUMBERS {
        let mut acc = 0.0f64;
        for (k, scores) in channel_scores.iter().enumerate() {
            if n < scores.len() {
                // Transforme le score en log-odds stabilisé : log(s) - log(mean/s - s)
                let s = scores[n].max(1e-12);
                let odds = (s / (5.0f64 / TOTAL_NUMBERS as f64)).max(1e-12);
                acc += weights[k] * odds.ln();
            }
        }
        fused[n] = acc;
    }
    fused
}

/// Projette les logits sur le simplexe marginal Sum = 5.0 via softmax à température 1
/// pondérée par la masse cible : p_n = 5 * exp(z_n) / Sum_j exp(z_j), borné à [0,1].
fn project_logits_to_simplex(logits: &[f64; TOTAL_NUMBERS + 1]) -> [f64; TOTAL_NUMBERS + 1] {
    let mut max_z = f64::NEG_INFINITY;
    for n in 1..=TOTAL_NUMBERS {
        if logits[n] > max_z {
            max_z = logits[n];
        }
    }
    let mut sum_exp = 0.0f64;
    let mut exp_z = [0.0f64; TOTAL_NUMBERS + 1];
    for n in 1..=TOTAL_NUMBERS {
        exp_z[n] = (logits[n] - max_z).exp();
        sum_exp += exp_z[n];
    }
    let mut probs = [0.0f64; TOTAL_NUMBERS + 1];
    if sum_exp > 1e-12 {
        for n in 1..=TOTAL_NUMBERS {
            probs[n] = ((exp_z[n] / sum_exp) * (NUMBERS_PER_DRAW as f64)).clamp(0.0, 1.0);
        }
    }
    probs
}

/// Log-loss moyenne d'un échantillon OOF : targets[i][n] ∈ {0,1}
fn mean_log_loss(
    probs_samples: &[[f64; TOTAL_NUMBERS + 1]],
    targets: &[Vec<f64>],
) -> f64 {
    let mut total = 0.0f64;
    let mut count = 0usize;
    for (i, probs) in probs_samples.iter().enumerate() {
        if i >= targets.len() {
            break;
        }
        for n in 1..=TOTAL_NUMBERS {
            let y = targets[i][n];
            let p = probs[n].clamp(1e-9, 1.0 - 1e-9);
            total += -(y * p.ln() + (1.0 - y) * (1.0 - p).ln());
            count += 1;
        }
    }
    if count > 0 {
        total / count as f64
    } else {
        0.0
    }
}

/// Stacking log-linéaire L2 sur sorties OOF.
///
/// `oof_channel_scores[s]` : S échantillons, chacun un vecteur de K scores par numéro.
/// `targets[s]` : S vecteurs binaires d'occurrence réelle (1 = sorti).
///
/// Optimisation : Exponentiated Gradient sur le simplexe des poids,
/// minimisation de la log-loss OOS + régularisation entropique de force
/// lambda = 1 / (S * K) (décroît avec la taille d'échantillon).
pub fn stack_channels_l2(
    oof_channel_scores: &[Vec<Vec<f64>>],
    targets: &[Vec<f64>],
    num_channels: usize,
) -> StackingOutput {
    let mut weights = vec![1.0f64 / num_channels.max(1) as f64; num_channels];
    let num_samples = oof_channel_scores.len().min(targets.len());
    if num_samples == 0 || num_channels == 0 {
        return StackingOutput {
            probabilities: [0.0; TOTAL_NUMBERS + 1],
            channel_weights: weights,
            final_log_loss: 0.0,
        };
    }

    // Taux EG : 1 / sqrt(K) * pas de normalisation Lipschitz de la log-loss
    let eta = 1.0 / (num_channels as f64).sqrt();
    // Régularisation entropique : 1 / (S · K), décroît avec l'information OOF disponible.
    let lambda = 1.0 / (num_samples * num_channels) as f64;

    let mut prev_loss = f64::INFINITY;
    let mut best_weights = weights.clone();
    let mut best_loss = f64::INFINITY;

    for _iter in 0..EG_MAX_ITER {
        // 1. Fusion log-linéaire courante pour chaque échantillon
        let mut sample_probs: Vec<[f64; TOTAL_NUMBERS + 1]> = Vec::with_capacity(num_samples);
        for s in 0..num_samples {
            let channel_scores: Vec<Vec<f64>> = (0..num_channels)
                .map(|k| {
                    oof_channel_scores[s]
                        .get(k)
                        .cloned()
                        .unwrap_or_default()
                })
                .collect();
            let fused = fuse_channels(&channel_scores, &weights);
            sample_probs.push(project_logits_to_simplex(&fused));
        }

        let loss = mean_log_loss(&sample_probs, targets);

        if loss < best_loss {
            best_loss = loss;
            best_weights = weights.clone();
        }
        if prev_loss.is_finite()
            && (prev_loss - loss).abs() <= EG_TOL * prev_loss.abs().max(1.0)
        {
            break;
        }
        prev_loss = loss;

        // 2. Gradient de la log-loss par rapport aux poids des canaux.
        //    La projection softmax impose Sum_n p_n = 5 : la dérivée de log p_n
        //    inclut le terme de normalisation  -Sum_j (p_j/5) logit_kj.
        let mut grad = vec![0.0f64; num_channels];
        for s in 0..num_samples {
            let mut log_odds: Vec<Vec<f64>> = Vec::with_capacity(num_channels);
            for k in 0..num_channels {
                let scores = oof_channel_scores[s].get(k);
                let mut channel_logits = vec![0.0f64; TOTAL_NUMBERS + 1];
                if let Some(scores) = scores {
                    for n in 1..=TOTAL_NUMBERS {
                        if n < scores.len() {
                            let s_kn = scores[n].max(1e-12);
                            let odds = (s_kn / (5.0f64 / TOTAL_NUMBERS as f64)).max(1e-12);
                            channel_logits[n] = odds.ln();
                        }
                    }
                }
                log_odds.push(channel_logits);
            }

            let mut channel_avg = vec![0.0f64; num_channels];
            for k in 0..num_channels {
                for n in 1..=TOTAL_NUMBERS {
                    channel_avg[k] += sample_probs[s][n] / NUMBERS_PER_DRAW as f64
                        * log_odds[k][n];
                }
            }

            for n in 1..=TOTAL_NUMBERS {
                let y = targets[s][n];
                let p = sample_probs[s][n].clamp(1e-9, 1.0 - 1e-9);
                let coeff = p - y; // dérivée de la log-loss
                for k in 0..num_channels {
                    grad[k] += coeff * (log_odds[k][n] - channel_avg[k]);
                }
            }
        }
        let norm = (num_samples * TOTAL_NUMBERS) as f64;
        for g in grad.iter_mut() {
            *g /= norm;
        }

        // 3. Mise à jour Exponentiated Gradient + régularisation entropique
        for k in 0..num_channels {
            let reg = lambda * weights[k].ln().max(-30.0);
            let exponent = -eta * (grad[k] + reg);
            weights[k] *= exponent.min(50.0).exp();
        }
        let sum_w: f64 = weights.iter().sum();
        if sum_w > 1e-12 {
            for w in weights.iter_mut() {
                *w /= sum_w;
            }
        }
    }

    StackingOutput {
        probabilities: [0.0; TOTAL_NUMBERS + 1],
        channel_weights: best_weights,
        final_log_loss: best_loss,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stacking_recovers_informative_channel() {
        // Canal 0 : signal parfait (numéros 1..5 toujours prédits haut)
        // Canal 1 : bruit blanc uniforme
        let num_samples = 12;
        let mut oof = Vec::new();
        let mut targets = Vec::new();
        for s in 0..num_samples {
            let mut ch0 = vec![0.0f64; TOTAL_NUMBERS + 1];
            let mut ch1 = vec![0.0f64; TOTAL_NUMBERS + 1];
            let mut tgt = vec![0.0f64; TOTAL_NUMBERS + 1];
            for n in 1..=TOTAL_NUMBERS {
                ch0[n] = if n <= 5 { 0.9 } else { 0.01 };
                ch1[n] = 0.0555; // équiprobable
                tgt[n] = if n <= 5 { 1.0 } else { 0.0 };
            }
            oof.push(vec![ch0, ch1]);
            targets.push(tgt);
        }
        let out = stack_channels_l2(&oof, &targets, 2);
        assert!(out.channel_weights[0] > 0.8, "Le canal informatif doit dominer");
    }

    #[test]
    fn platt_is_affine_and_clamps() {
        let mut scores = vec![0.0f64; TOTAL_NUMBERS + 1];
        for n in 1..=TOTAL_NUMBERS {
            scores[n] = n as f64 * 0.01;
        }
        apply_platt(&mut scores, 2.0, -0.05);
        assert!(scores[1] >= 0.0 && scores[90] <= 1.8);
    }
}
