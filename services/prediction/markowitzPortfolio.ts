import { ScoreBreakdown, EmpiricalCalibration, FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { ScoredNumber } from "./scoringEngine";
import { calculateACValue } from "../mathService";
import { ParkMillerLCG } from "./deterministicCore";

const DOMAIN_SIZE = 90;
const DRAW_SIZE = 5;

export interface MarkowitzPortfolioConfig {
  domainSize?: number;
  drawSize?: number;
  entropy?: number;
  hurst?: number;
  drawName?: string;
}

export interface MarkowitzMetrics {
  expectedReturn: number;
  portfolioVariance: number;
  sharpeRatio: number;
  diversificationRatio: number;
  markowitzUtility: number;
}

export interface MarkowitzFrontierSeed {
  name: string;
  numbers: number[];
  metrics: MarkowitzMetrics;
  energy: number;
}

/**
 * MOTEUR COMBINATOIRE DE MARKOWITZ (Modern Portfolio Theory / Diversification Entropique)
 * 
 * Modélise la sélection d'un ticket de 5 numéros comme un problème d'allocation
 * d'actifs à variance minimale sous contrainte de rendement espéré :
 * 
 *   Max U(x) = E[x] - (lambda / 2) * Var[x] - sum(Phi_soft(x))
 * 
 * - E[x] : Rendement espéré (espérance marginale pondérée des algorithmes).
 * - Var[x] : Variance / Redondance informationnelle calculée sur la matrice de
 *   covariance Sigma (collinéarité des profils, affinité empirique et distance spatiale).
 * - lambda : Coefficient d'aversion au risque / redondance, dérivé de façon
 *   continue de l'entropie de Shannon et de l'exposant de Hurst (ZÉRO NOMBRE MAGIQUE).
 * - Phi_soft : Contraintes physiques douces (somme gaussienne, amplitude, parité, AC).
 */
export class MarkowitzPortfolioSolver {
  /**
   * Calcule le coefficient continu d'aversion au risque lambda en fonction de l'entropie
   * et du régime de persistance de Hurst du tirage actif.
   */
  public static calculateRiskAversion(entropy: number = 4.5, hurst: number = 0.5): number {
    const maxTheoreticalEntropy = Math.log2(DOMAIN_SIZE); // ~6.49 bits pour 90 numéros
    const normalizedEntropy = Math.max(0.0, Math.min(1.0, entropy / maxTheoreticalEntropy));
    
    // Si persistant (Hurst > 0.5), le système favorise le momentum des signaux dominants.
    // Si anti-persistant / bruité (Hurst < 0.5), le système amplifie la diversification.
    const hurstModulation = 1.0 - 0.4 * Math.tanh(2.0 * (hurst - 0.5));
    
    // Échelle de base canonique : 1 / ln(DOMAIN_SIZE) ≈ 0.222
    const baseScale = 1.0 / Math.log(DOMAIN_SIZE);
    
    return baseScale * (1.0 + normalizedEntropy) * hurstModulation;
  }

  /**
   * Construit la matrice de covariance inter-numéros Sigma (91x91) de manière continue.
   * Sigma_ij mesure la redondance et la co-dépendance entre les numéros i et j.
   */
  public static buildCovarianceMatrix(
    scoresMap: Map<number, number>,
    breakdownsMap: Map<number, ScoreBreakdown> | undefined,
    affinityMap: Float32Array[],
    config: MarkowitzPortfolioConfig = {}
  ): Float32Array[] {
    const domainSize = config.domainSize || DOMAIN_SIZE;
    const entropy = config.entropy || 4.5;
    const hurst = config.hurst || 0.5;

    // Initialisation de la matrice symétrique carrée
    const matrix: Float32Array[] = new Array(domainSize + 1);
    for (let i = 0; i <= domainSize; i++) {
      matrix[i] = new Float32Array(domainSize + 1);
    }

    const spatialSigma = Math.sqrt(domainSize / DRAW_SIZE); // ~4.24
    const twoSpatialVar = 2.0 * spatialSigma * spatialSigma;

    // Normalisation continue des poids de composantes
    const maxEntropy = Math.log2(domainSize);
    const entropyFactor = Math.max(0.1, Math.min(1.0, entropy / maxEntropy));
    const hurstShift = Math.tanh(hurst - 0.5); // [-1, 1]

    // Poids relatifs continus pour chaque facteur de covariance
    const wAlgo = 0.50 + 0.20 * entropyFactor;
    const wSpatial = 0.30 + 0.10 * (1.0 - entropyFactor);
    const wAffinitySynergy = 0.20 + 0.15 * hurstShift;

    for (let i = 1; i <= domainSize; i++) {
      // Variance propre (diagonale) : inversement proportionnelle à la confiance du score
      const scoreI = scoresMap.get(i) || 50.0;
      matrix[i][i] = Math.max(0.1, (100.0 - scoreI) / 100.0);

      const bdI = breakdownsMap?.get(i);
      const keysI = bdI ? Object.keys(bdI) : [];
      let normI = 0.0;
      if (bdI) {
        for (const k of keysI) {
          const v = Number((bdI as any)[k]) || 0;
          normI += v * v;
        }
      }
      normI = Math.sqrt(normI) || Number.EPSILON;

      for (let j = i + 1; j <= domainSize; j++) {
        // 1. Similarité cosinus algorithmique (Collinéarité des signaux)
        let cosSim = 0.0;
        const bdJ = breakdownsMap?.get(j);
        if (bdI && bdJ) {
          let dot = 0.0;
          let normJ = 0.0;
          for (const k of keysI) {
            const vi = Number((bdI as any)[k]) || 0;
            const vj = Number((bdJ as any)[k]) || 0;
            dot += vi * vj;
            normJ += vj * vj;
          }
          normJ = Math.sqrt(normJ) || Number.EPSILON;
          cosSim = Math.max(0.0, Math.min(1.0, dot / (normI * normJ)));
        }

        // 2. Proximité spatiale (Noyau Gaussien de distance modulaire)
        const diff = Math.abs(i - j);
        const spatialCorr = Math.exp(-(diff * diff) / twoSpatialVar);

        // 3. Synergie d'affinité empirique (Co-occurrences historiques)
        const rawAff = affinityMap[i]?.[j] || 0.0;
        const affSynergy = Math.tanh(rawAff / 10.0);

        // Synthèse Markowitz : la covariance positive augmente le risque (redondance),
        // tandis qu'une affinité empirique constructive tempère la redondance.
        const covar = wAlgo * cosSim + wSpatial * spatialCorr - wAffinitySynergy * (affSynergy * 0.5);

        // Clamping doux
        const boundedCovar = Math.max(-0.5, Math.min(1.5, covar));
        matrix[i][j] = boundedCovar;
        matrix[j][i] = boundedCovar;
      }
    }

    return matrix;
  }

  /**
   * Évalue un portefeuille (combinaison) selon la métrique de Markowitz :
   * - Expected Return (Rendement espéré)
   * - Variance du portefeuille (Covariance totale inter-actifs)
   * - Ratio de Sharpe
   * - Indice de diversification
   * - Utilité de Markowitz U = E - (lambda/2) * Var
   */
  public static evaluatePortfolio(
    combo: number[],
    scoresMap: Map<number, number>,
    covarMatrix: Float32Array[],
    lambdaRisk: number
  ): MarkowitzMetrics {
    const k = combo.length;
    if (k === 0) {
      return {
        expectedReturn: 0,
        portfolioVariance: 0,
        sharpeRatio: 0,
        diversificationRatio: 1,
        markowitzUtility: 0
      };
    }

    let returnSum = 0.0;
    let individualVolSum = 0.0;

    for (let i = 0; i < k; i++) {
      const num = combo[i];
      const r = scoresMap.get(num) || 50.0;
      returnSum += r;
      individualVolSum += Math.sqrt(Math.max(0.01, covarMatrix[num]?.[num] || 0.5));
    }

    const expectedReturn = returnSum / k;

    let totalCovariance = 0.0;
    for (let i = 0; i < k; i++) {
      const n1 = combo[i];
      for (let j = 0; j < k; j++) {
        const n2 = combo[j];
        totalCovariance += covarMatrix[n1]?.[n2] || 0.0;
      }
    }

    const portfolioVariance = Math.max(0.01, totalCovariance / (k * k));
    const portfolioVol = Math.sqrt(portfolioVariance);

    const sharpeRatio = expectedReturn / portfolioVol;
    const diversificationRatio = individualVolSum / (k * portfolioVol);
    const markowitzUtility = expectedReturn - (lambdaRisk / 2.0) * (portfolioVariance * 100.0);

    return {
      expectedReturn,
      portfolioVariance,
      sharpeRatio,
      diversificationRatio,
      markowitzUtility
    };
  }

  /**
   * Résout la frontière efficiente de Markowitz par maximisation gloutonne sous-modulaire.
   * Produit 4 semences optimales diversifiées sur la frontière :
   * 1. Semence "Sharpe Optimal" (Équilibre rendement / diversification)
   * 2. Semence "Variance Minimale" (Diversification maximale)
   * 3. Semence "Rendement Maximal" (Momentum des scores sous contrainte de dispersion)
   * 4. Semence "Frontière avec Outsiders" (Allocation Markowitz avec quota d'outsiders)
   */
  public static solveFrontierSeeds(
    candidates: ScoredNumber[],
    scoresMap: Map<number, number>,
    covarMatrix: Float32Array[],
    affinityMap: Float32Array[],
    calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
    lastDraw?: number[],
    targetOutsiders: number = 0,
    config: MarkowitzPortfolioConfig = {},
    calculateEnergyFn?: (combo: number[]) => number
  ): MarkowitzFrontierSeed[] {
    const domainSize = config.domainSize || DOMAIN_SIZE;
    const drawSize = config.drawSize || DRAW_SIZE;
    const lambdaBase = this.calculateRiskAversion(config.entropy, config.hurst);

    const topCount = Math.max(drawSize, Math.floor(candidates.length * (1.0 - targetOutsiders / drawSize)));
    const topPool = candidates.slice(0, topCount).map(c => c.num);
    const outsiderPool = candidates.slice(topCount).map(c => c.num);
    const allNums = candidates.map(c => c.num);

    // Fonction de construction gloutonne sous-modulaire le long d'un paramètre d'aversion lambda
    const buildFrontierCombo = (
      lambda: number,
      initialNum: number,
      allowedPool: number[],
      forceOutsidersCount: number = 0
    ): number[] => {
      const selected: number[] = [initialNum];

      while (selected.length < drawSize) {
        let bestCandidate = -1;
        let bestMarginalUtility = -Infinity;

        const remainingSlots = drawSize - selected.length;
        const currentOutsiders = selected.filter(n => outsiderPool.includes(n)).length;
        const neededOutsiders = forceOutsidersCount - currentOutsiders;

        let pool = allowedPool.filter(c => !selected.includes(c));
        if (neededOutsiders > 0 && neededOutsiders >= remainingSlots) {
          pool = pool.filter(c => outsiderPool.includes(c));
          if (pool.length === 0) {
            pool = outsiderPool.filter(c => !selected.includes(c));
          }
        }

        if (pool.length === 0) {
          pool = allNums.filter(c => !selected.includes(c));
        }

        const candidateSlice = pool.slice(0, Math.min(35, pool.length));

        for (const cand of candidateSlice) {
          const testCombo = [...selected, cand];
          const testReturn = (scoresMap.get(cand) || 50.0);

          // Covariance marginale avec les numéros déjà sélectionnés
          let marginalCov = 0.0;
          for (const s of selected) {
            marginalCov += covarMatrix[cand]?.[s] || 0.0;
          }
          marginalCov = marginalCov / selected.length;

          // Pénalité douce sur la somme attendue
          let sumPenalty = 0.0;
          if (calibration.stdSum > 0) {
            const currentSum = testCombo.reduce((a, b) => a + b, 0);
            const scale = testCombo.length / drawSize;
            const expSum = calibration.meanSum * scale;
            const expStd = calibration.stdSum * Math.sqrt(scale);
            const z = (currentSum - expSum) / Math.max(Number.EPSILON, expStd);
            sumPenalty = Math.pow(z, 2.0);
          }

          // Répétition avec le dernier tirage
          let repPenalty = 0.0;
          if (lastDraw && lastDraw.includes(cand)) {
            const prevMatches = selected.filter(n => lastDraw.includes(n)).length;
            repPenalty = Math.pow(prevMatches + 1, 2.0) * 3.0;
          }

          // Utilité marginale sous-modulaire : R_j - lambda * Cov(j, S) - SoftConstraints
          const marginalUtility = testReturn - lambda * 100.0 * marginalCov - (sumPenalty + repPenalty);

          if (marginalUtility > bestMarginalUtility) {
            bestMarginalUtility = marginalUtility;
            bestCandidate = cand;
          }
        }

        if (bestCandidate !== -1) {
          selected.push(bestCandidate);
        } else {
          for (const cand of pool) {
            if (!selected.includes(cand)) {
              selected.push(cand);
              break;
            }
          }
          if (selected.length === drawSize) break;
        }
      }

      return selected;
    };

    // 1. Seed A : Ratio de Sharpe Optimal (lambda = lambdaBase)
    const seedANums = buildFrontierCombo(lambdaBase, topPool[0], allNums, targetOutsiders);
    const metricsA = this.evaluatePortfolio(seedANums, scoresMap, covarMatrix, lambdaBase);
    const energyA = calculateEnergyFn ? calculateEnergyFn(seedANums) : -metricsA.markowitzUtility;

    // 2. Seed B : Variance Minimale / Diversification Maximale (lambda = lambdaBase * 2.2)
    // Commence par le numéro ayant la covariance moyenne la plus faible avec le top 10
    let minCovInitial = topPool[0];
    let lowestCovSum = Infinity;
    for (let i = 0; i < Math.min(10, topPool.length); i++) {
      let sumCov = 0;
      for (let j = 0; j < Math.min(10, topPool.length); j++) {
        if (i !== j) sumCov += covarMatrix[topPool[i]]?.[topPool[j]] || 0;
      }
      if (sumCov < lowestCovSum) {
        lowestCovSum = sumCov;
        minCovInitial = topPool[i];
      }
    }
    const seedBNums = buildFrontierCombo(lambdaBase * 2.2, minCovInitial, allNums, targetOutsiders);
    const metricsB = this.evaluatePortfolio(seedBNums, scoresMap, covarMatrix, lambdaBase * 2.2);
    const energyB = calculateEnergyFn ? calculateEnergyFn(seedBNums) : -metricsB.markowitzUtility;

    // 3. Seed C : Rendement Maximal / Momentum (lambda = lambdaBase * 0.45)
    const seedCNums = buildFrontierCombo(lambdaBase * 0.45, topPool[0], topPool, 0);
    const metricsC = this.evaluatePortfolio(seedCNums, scoresMap, covarMatrix, lambdaBase * 0.45);
    const energyC = calculateEnergyFn ? calculateEnergyFn(seedCNums) : -metricsC.markowitzUtility;

    // 4. Seed D : Outsider-Injected Frontier
    const firstOutsider = outsiderPool.length > 0 ? outsiderPool[0] : topPool[topPool.length - 1];
    const seedDNums = buildFrontierCombo(lambdaBase * 1.2, firstOutsider, allNums, Math.max(1, targetOutsiders));
    const metricsD = this.evaluatePortfolio(seedDNums, scoresMap, covarMatrix, lambdaBase * 1.2);
    const energyD = calculateEnergyFn ? calculateEnergyFn(seedDNums) : -metricsD.markowitzUtility;

    return [
      { name: "Markowitz Sharpe Optimal", numbers: seedANums, metrics: metricsA, energy: energyA },
      { name: "Markowitz Min Variance", numbers: seedBNums, metrics: metricsB, energy: energyB },
      { name: "Markowitz Max Return", numbers: seedCNums, metrics: metricsC, energy: energyC },
      { name: "Markowitz Outsider Frontier", numbers: seedDNums, metrics: metricsD, energy: energyD },
    ];
  }

  /**
   * Génère un ensemble de N tickets optimisés pour la couverture de portefeuille (Markowitz Portfolio Coverage).
   * Chaque ticket maximise son utilité espérée sur la frontière efficiente tout en pénalisant
   * de manière continue l'intersection et la redondance d'information avec les tickets déjà alloués.
   */
  public static solveOptimalPortfolioCoverage(
    ticketCount: number,
    candidates: ScoredNumber[],
    scoresMap: Map<number, number>,
    covarMatrix: Float32Array[],
    affinityMap: Float32Array[],
    calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
    lastDraw?: number[],
    config: MarkowitzPortfolioConfig = {}
  ): Array<{ numbers: number[]; metrics: MarkowitzMetrics }> {
    const drawSize = config.drawSize || DRAW_SIZE;
    const lambdaBase = this.calculateRiskAversion(config.entropy, config.hurst);

    const tickets: Array<{ numbers: number[]; metrics: MarkowitzMetrics }> = [];
    const allNums = candidates.map(c => c.num);

    for (let t = 0; t < ticketCount; t++) {
      // Moduler l'aversion au risque pour étaler les tickets le long de la frontière
      const progressRatio = ticketCount > 1 ? t / (ticketCount - 1) : 0.5;
      const lambdaT = lambdaBase * (0.6 + 1.2 * progressRatio);

      // Sélectionner le point de départ : le numéro non saturé ayant le meilleur score net
      const usedCounts = new Map<number, number>();
      for (const tick of tickets) {
        for (const n of tick.numbers) {
          usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
        }
      }

      let bestInitial = allNums[0];
      let bestInitialVal = -Infinity;
      for (const cand of allNums.slice(0, Math.min(25, allNums.length))) {
        const usage = usedCounts.get(cand) || 0;
        const score = scoresMap.get(cand) || 50;
        const netVal = score - usage * 15.0;
        if (netVal > bestInitialVal) {
          bestInitialVal = netVal;
          bestInitial = cand;
        }
      }

      const selected: number[] = [bestInitial];

      while (selected.length < drawSize) {
        let bestCandidate = -1;
        let bestMarginalUtility = -Infinity;

        const candidatePool = allNums.filter(n => !selected.includes(n));
        const candidateSlice = candidatePool.slice(0, Math.min(40, candidatePool.length));

        for (const cand of candidateSlice) {
          const testReturn = scoresMap.get(cand) || 50.0;

          // Covariance interne au ticket
          let marginalCov = 0.0;
          for (const s of selected) {
            marginalCov += covarMatrix[cand]?.[s] || 0.0;
          }
          marginalCov = marginalCov / selected.length;

          // Pénalité de redondance inter-tickets (Couverture de portefeuille)
          let crossTicketOverlap = 0.0;
          for (const prevTicket of tickets) {
            let shared = 0;
            for (const n of selected) {
              if (prevTicket.numbers.includes(n)) shared++;
            }
            if (prevTicket.numbers.includes(cand)) shared++;
            crossTicketOverlap += Math.pow(shared, 2.0) * 4.0;
          }

          // Répétition avec dernier tirage
          let repPenalty = 0.0;
          if (lastDraw && lastDraw.includes(cand)) {
            const matches = selected.filter(n => lastDraw.includes(n)).length;
            repPenalty = Math.pow(matches + 1, 2.0) * 3.0;
          }

          const utility = testReturn - lambdaT * 100.0 * marginalCov - crossTicketOverlap - repPenalty;

          if (utility > bestMarginalUtility) {
            bestMarginalUtility = utility;
            bestCandidate = cand;
          }
        }

        if (bestCandidate !== -1) {
          selected.push(bestCandidate);
        } else {
          for (const cand of candidatePool) {
            if (!selected.includes(cand)) {
              selected.push(cand);
              break;
            }
          }
          if (selected.length === drawSize) break;
        }
      }

      selected.sort((a, b) => a - b);
      const metrics = this.evaluatePortfolio(selected, scoresMap, covarMatrix, lambdaT);
      tickets.push({ numbers: selected, metrics });
    }

    return tickets;
  }
}
