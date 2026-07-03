import { ScoreBreakdown } from "../../shared/prediction.types";

/**
 * CALCUL DE L'INDICE DE DIVERSITÉ GÉNÉTIQUE ET ÉTALONNAGE ÉNERGÉTIQUE INTER-ALGORITHMIQUE
 * 
 * 1. Mesure l'orthogonalité des signaux algorithmiques entre les numéros d'un ticket (Similarité Cosinus).
 * 2. Étalonne l'entropie mutuelle inter-algorithmique en calculant la Divergence Symétrique de
 *    Kullback-Leibler (Jeffreys Divergence) sur les profils d'activations des algorithmes, 
 *    afin de détecter et pénaliser les dépendances monoculturelles redondantes.
 * 
 * @param numbers - Les numéros de la combinaison candidate (généralement 5)
 * @param breakdowns - Le dictionnaire des ScoreBreakdown de tous les numéros (1 à 90)
 * @returns Objet contenant la similarité moyenne, le score de diversité ajusté, la pénalité cumulée, le statut de monoculture, l'indice d'information mutuelle.
 */
export const calculateGeneticDiversityIndex = (
  numbers: number[],
  breakdowns: Record<number, ScoreBreakdown>
): {
  meanSimilarity: number;
  diversityScore: number;
  penalty: number;
  isMonoculture: boolean;
  pairwiseSimilarities: number[];
  dominantAlgo: string | null;
  mutualInformationScore?: number;
  klDivergenceBonus?: number;
} => {
  if (numbers.length < 2) {
    return { 
      meanSimilarity: 0, 
      diversityScore: 1, 
      penalty: 0, 
      isMonoculture: false, 
      pairwiseSimilarities: [], 
      dominantAlgo: null,
      mutualInformationScore: 0,
      klDivergenceBonus: 1
    };
  }

  // 1. Identification des clés d'algorithmes (ex: 'frequency', 'gaps', 'markov', etc.)
  const firstBd = breakdowns[numbers[0]];
  const algoKeys = firstBd ? (Object.keys(firstBd).filter(k => typeof (firstBd as any)[k] === 'number') as string[]) : [];
  
  if (algoKeys.length === 0) {
    return { 
      meanSimilarity: 0, 
      diversityScore: 1, 
      penalty: 0, 
      isMonoculture: false, 
      pairwiseSimilarities: [], 
      dominantAlgo: null,
      mutualInformationScore: 0,
      klDivergenceBonus: 1
    };
  }

  // 2. Extraction et Normalisation L2 des vecteurs de features pour chaque numéro (Similarité Cosinus standard)
  const vectors: number[][] = [];
  const algoContributions: Record<string, number> = {}; // Tracker d'apport cumulé pour l'algo dominant

  for (const num of numbers) {
    const bd = breakdowns[num] || {};
    const vec = algoKeys.map(key => Math.max(0, Number((bd as any)[key]) || 0));
    
    // Accumulation pour l'identité dominante du ticket
    vec.forEach((val, idx) => {
      algoContributions[algoKeys[idx]] = (algoContributions[algoKeys[idx]] || 0) + val;
    });

    // Normalisation L2 (Produit scalaire direct = Similarité Cosinus)
    const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || Number.EPSILON;
    vectors.push(vec.map(val => val / magnitude));
  }

  // 3. Calcul des Similarités Cosinus par paires de numéros
  const pairwiseSimilarities: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const dotProduct = vectors[i].reduce((sum, val, idx) => sum + val * vectors[j][idx], 0);
      pairwiseSimilarities.push(Math.max(-1.0, Math.min(1.0, dotProduct)));
    }
  }

  const meanSimilarity = pairwiseSimilarities.reduce((a, b) => a + b, 0) / pairwiseSimilarities.length;

  // 4. Étalonnage Énergétique : Divergence Symétrique de Kullback-Leibler (Jeffreys Divergence)
  // On construit les distributions d'activations de chaque algorithme sur l'ensemble des numéros
  // pour évaluer leur degré d'information mutuelle redondante.
  const algoDistributions: Record<string, number[]> = {};
  const EPSILON_SMOOTH = 1e-6;

  algoKeys.forEach(key => {
    const activations = numbers.map(num => {
      const bd = breakdowns[num] || {};
      return Math.max(0, Number((bd as any)[key]) || 0);
    });

    const sumAct = activations.reduce((a, b) => a + b, 0);
    
    // Convertir les scores bruts en lois de probabilités normalisées (smoothées par EPSILON)
    algoDistributions[key] = activations.map(v => (v + EPSILON_SMOOTH) / (sumAct + EPSILON_SMOOTH * numbers.length));
  });

  let sumRedundancy = 0;
  let countPairs = 0;

  for (let i = 0; i < algoKeys.length; i++) {
    for (let j = i + 1; j < algoKeys.length; j++) {
      const p = algoDistributions[algoKeys[i]];
      const q = algoDistributions[algoKeys[j]];

      // Divergence directionnelle D_KL(P || Q) et D_KL(Q || P)
      let kl_pq = 0;
      let kl_qp = 0;

      for (let r = 0; r < numbers.length; r++) {
        kl_pq += p[r] * Math.log(p[r] / q[r]);
        kl_qp += q[r] * Math.log(q[r] / p[r]);
      }

      // Symétrisation : Jeffreys Divergence J(P, Q)
      const jeffreysDiv = kl_pq + kl_qp;

      // Un faible Jeffreys Divergence implique que les signaux se propagent dans la même phase (redondance maximale)
      // On mappe la proximité via une décroissance exponentielle : R(p,q) = exp(-J(P, Q))
      const pairRedundancy = Math.exp(-jeffreysDiv);
      sumRedundancy += pairRedundancy;
      countPairs++;
    }
  }

  // Taux de redondance global inter-algorithmique entre 0 (orthogonalité parfaite) et 1 (redondance absolue)
  const mutualInformationScore = countPairs > 0 ? (sumRedundancy / countPairs) : 0;
  const klDivergenceBonus = 1.0 - mutualInformationScore;

  // 5. Ajustement continu du Score de Diversité Génétique
  // On tempère le score géométrique standard par le coefficient d'orthogonalité inter-algorithmique KL
  const baseDiversity = 1.0 - meanSimilarity;
  const diversityScore = baseDiversity * klDivergenceBonus;

  // 6. Pénalisation continue
  const MONOCULTURE_THRESHOLD = 0.75;
  const MAX_DIVERSITY_PENALTY = 25.0; // Budget de pénalité maximal (sur un score de 100)
  
  let penalty = 0;
  let isMonoculture = false;

  // Pénalité par alignement spatial des numéros (similarité cosinus excessive)
  if (meanSimilarity > MONOCULTURE_THRESHOLD) {
    isMonoculture = true;
    const excessSimilarity = meanSimilarity - MONOCULTURE_THRESHOLD;
    const maxExcess = 1.0 - MONOCULTURE_THRESHOLD; // 0.25
    penalty += MAX_DIVERSITY_PENALTY * Math.pow(excessSimilarity / maxExcess, 2);
  }

  // Pénalité par synergie d'information mutuelle interdite (Kullback-Leibler)
  // Plus l'indice d'information mutuelle est élevé (algos identiques), plus l'anti-monoculture intervient
  const redundancyPenaltyFactor = Math.pow(mutualInformationScore, 2); // Pénalisation quadratique douce de la redondance
  penalty += MAX_DIVERSITY_PENALTY * redundancyPenaltyFactor;

  // Clamping de la pénalité sommée
  penalty = Math.min(MAX_DIVERSITY_PENALTY, penalty);

  // 7. Identification de l'algorithme dominant
  let dominantAlgo = null;
  let maxContribution = -1;
  for (const [algo, contribution] of Object.entries(algoContributions)) {
    if (contribution > maxContribution) {
      maxContribution = contribution;
      dominantAlgo = algo;
    }
  }

  return {
    meanSimilarity: parseFloat(meanSimilarity.toFixed(4)),
    diversityScore: parseFloat(diversityScore.toFixed(4)),
    penalty: parseFloat(penalty.toFixed(2)),
    isMonoculture,
    pairwiseSimilarities: pairwiseSimilarities.map(v => parseFloat(v.toFixed(4))),
    dominantAlgo,
    mutualInformationScore: parseFloat(mutualInformationScore.toFixed(4)),
    klDivergenceBonus: parseFloat(klDivergenceBonus.toFixed(4))
  };
};
