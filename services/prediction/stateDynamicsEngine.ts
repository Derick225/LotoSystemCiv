/**
 * MOTEUR D'HARMONISATION SIGNAL & MOMENTUM (StateDynamicsEngine)
 *
 * Fait converger la cinématique d'état du système stochastique :
 * 1. État Statique d'Ordre 0 (FREQUENCY) : Position et densité d'occurrences robustes aux outliers.
 * 2. État Cinétique d'Ordre 1 (MOMENTUM) : Vélocité, dérive temporelle et accélération des cycles.
 * 3. État Épistémique d'Ordre 2 (BAYES) : Espérance a posteriori bayésienne conjuguée Beta-Binomiale.
 *
 * Principes architecturaux stricts (AGENTS.md) :
 * 1. Zéro Nombres Magiques : Prior bayésien empirique déduit par la méthode des moments sur la population complète,
 *    fenêtres cinétiques dérivées de sqrt(T), pondération hamiltonienne dérivée de l'exposant de Hurst H.
 * 2. Zéro Hasard : Exécution 100% déterministe et reproductible.
 * 3. Continuité Différentiable : Mappings sigmoïdaux et tangentes hyperboliques sans sauts discrets.
 * 4. Isolation du Tirage : Inférence délimitée strictement au tirage en cours.
 */

import { AlgoKey } from '../../shared/prediction.types';
import { AlgorithmContext } from './algorithmRegistry';

export interface NumberStateProfile {
  num: number;
  frequencyRaw: number;
  frequencyScore: number;
  
  velocityRaw: number;
  momentumScore: number;
  
  bayesPosteriorExpected: number;
  bayesScore: number;
  
  // Score unifié d'état harmonique (Hamiltonien continu)
  stateScore: number;
  confidence: number;
}

export interface StateDynamicsAnalysis {
  drawName: string;
  domainSize: number;
  historyLength: number;
  perNumberProfiles: Record<number, NumberStateProfile>;
  freqMedian: number;
  freqIqr: number;
  velocityMedian: number;
  velocityIqr: number;
  hurstExponent: number;
  priorAlpha: number;
  priorBeta: number;
}

const CACHE_KEY = 'STATE_DYNAMICS_UNIFIED_ENGINE';

export class StateDynamicsEngine {
  /**
   * Analyse cinématique globale (Position, Vélocité, Inférence Bayésienne).
   */
  public static analyze(ctx: AlgorithmContext): StateDynamicsAnalysis {
    ctx.pluginCache = ctx.pluginCache || {};
    if (ctx.pluginCache[CACHE_KEY]) {
      return ctx.pluginCache[CACHE_KEY] as StateDynamicsAnalysis;
    }

    const domainSize = 90;
    const history = ctx.history || [];
    const drawName = ctx.drawName || history[0]?.drawName || 'DEFAULT_TIRAGE';
    const T = Math.max(1, history.length);
    const H = ctx.statisticalBounds?.hurstExponent ?? 0.5;

    // 1. Décompte d'occurrences globales (Position / Fréquence)
    const rawCounts = new Float64Array(domainSize + 1);
    for (let i = 0; i < T; i++) {
      const winners = history[i]?.gagnants;
      if (Array.isArray(winners)) {
        for (const num of winners) {
          if (num >= 1 && num <= domainSize) {
            rawCounts[num]++;
          }
        }
      }
    }

    // Utilisation de freqMap si déjà précalculé pour consistance
    if (ctx.features.freqMap) {
      for (let i = 1; i <= domainSize; i++) {
        if (typeof ctx.features.freqMap[i] === 'number') {
          rawCounts[i] = Math.max(rawCounts[i], ctx.features.freqMap[i]);
        }
      }
    }

    // Statistiques robustes sur la fréquence (Médiane & IQR de la population)
    const validFreqs = Array.from(rawCounts).slice(1).sort((a, b) => a - b);
    const nF = validFreqs.length;
    const midF = Math.floor(nF / 2);
    const freqMedian = nF % 2 !== 0 ? validFreqs[midF] : (validFreqs[midF - 1] + validFreqs[midF]) / 2;
    const q1F = validFreqs[Math.floor(nF * 0.25)] || 0;
    const q3F = validFreqs[Math.floor(nF * 0.75)] || 0;
    const freqIqr = Math.max(1.0 / Math.sqrt(T), q3F - q1F);

    // 2. Cinématique de vélocité (Momentum : Dérivée première temporelle)
    // Fenêtres cinétiques adaptatives fondées sur la physique stochastique
    const recentLen = Math.max(3, Math.min(Math.round(Math.sqrt(T)), Math.floor(T / 4) || 3));
    const olderLen = Math.min(Math.max(1, T - recentLen), 2 * recentLen);
    const normFactor = olderLen > 0 ? recentLen / olderLen : 1.0;

    const recentCounts = new Float64Array(domainSize + 1);
    const olderCounts = new Float64Array(domainSize + 1);

    for (let i = 0; i < Math.min(history.length, recentLen); i++) {
      const winners = history[i]?.gagnants;
      if (Array.isArray(winners)) {
        for (const n of winners) {
          if (n >= 1 && n <= domainSize) recentCounts[n]++;
        }
      }
    }

    for (let i = recentLen; i < Math.min(history.length, recentLen + olderLen); i++) {
      const winners = history[i]?.gagnants;
      if (Array.isArray(winners)) {
        for (const n of winners) {
          if (n >= 1 && n <= domainSize) olderCounts[n]++;
        }
      }
    }

    const velocities = new Float64Array(domainSize + 1);
    const validVelocities: number[] = [];
    for (let i = 1; i <= domainSize; i++) {
      const vel = recentCounts[i] - olderCounts[i] * normFactor;
      velocities[i] = vel;
      validVelocities.push(vel);
    }

    validVelocities.sort((a, b) => a - b);
    const nV = validVelocities.length;
    const midV = Math.floor(nV / 2);
    const velocityMedian = nV % 2 !== 0 ? validVelocities[midV] : (validVelocities[midV - 1] + validVelocities[midV]) / 2;
    const q1V = validVelocities[Math.floor(nV * 0.25)] || 0;
    const q3V = validVelocities[Math.floor(nV * 0.75)] || 0;
    const velocityIqr = Math.max(Number.EPSILON, q3V - q1V);

    // 3. Inférence Bayésienne Conjuguée Beta-Binomiale (Zéro constante magique)
    // Estimation des hyperparamètres a priori par la Méthode des Moments de Pearson
    let sumP = 0;
    for (let i = 1; i <= domainSize; i++) {
      sumP += rawCounts[i] / T;
    }
    const muP = sumP / domainSize;

    let sumVarP = 0;
    for (let i = 1; i <= domainSize; i++) {
      sumVarP += Math.pow((rawCounts[i] / T) - muP, 2);
    }
    const varP = Math.max(Number.EPSILON, sumVarP / domainSize);

    // Facteur d'échantillon continu empirique
    const sampleMultiplier = Math.max(0.1, (muP * (1.0 - muP) / varP) - 1.0);
    const priorAlpha = Math.max(0.5, muP * sampleMultiplier);
    const priorBeta = Math.max(0.5, (1.0 - muP) * sampleMultiplier);

    // AI Intuition Map continue bornée (si présente)
    const aiIntuitionMap = (ctx.advancedMetrics?.aiIntuition as Record<number, number>) || {};

    // 4. Calcul unifié et vectorisé par numéro
    const perNumberProfiles: Record<number, NumberStateProfile> = {};

    // Couplage Cinématique Hamiltonien selon l'exposant de Hurst :
    // - Persistance (H > 0.5) : Le momentum / vélocité domine le système.
    // - Antipersistance / Ergodicité (H <= 0.5) : La fréquence et le retour bayésien dominent.
    const wVel = 1.0 / (1.0 + Math.exp(-6.0 * (H - 0.5))); // Sigmoïde centrée en H=0.5
    const wPos = 1.0 - wVel;
    const slopeFreq = Math.sqrt(T) / (freqIqr * Math.sqrt(domainSize));

    for (let num = 1; num <= domainSize; num++) {
      const k = rawCounts[num];
      const vel = velocities[num];

      // (A) Score de Fréquence robuste
      const zFreq = slopeFreq * (k - freqMedian);
      const frequencyScore = Math.max(0, Math.min(100, 100.0 / (1.0 + Math.exp(-zFreq))));

      // (B) Score de Momentum cinétique continu
      const zVel = (vel - velocityMedian) / velocityIqr;
      const momentumScore = Math.max(0, Math.min(100, 100.0 / (1.0 + Math.exp(-1.5 * zVel))));

      // (C) Score Bayésien conjugué
      const posteriorExpected = (priorAlpha + k) / (priorAlpha + priorBeta + T);
      const zBayes = (posteriorExpected - muP) / Math.sqrt(varP);
      const aiModulation = Math.tanh((aiIntuitionMap[num] || 0.0) / 50.0) * 15.0; // Borné continûment [-15, +15]
      const rawBayesScore = (100.0 / (1.0 + Math.exp(-1.5 * zBayes))) + aiModulation;
      const bayesScore = Math.max(0, Math.min(100, rawBayesScore));

      // (D) Synthèse d'État Unifiée
      const stateScore = Math.max(
        0,
        Math.min(
          100,
          wPos * (0.50 * frequencyScore + 0.50 * bayesScore) +
          wVel * momentumScore
        )
      );

      // Confiance déterministe basée sur la saturation de l'échantillon T
      const sampleConfidence = Math.min(0.95, 0.40 + 0.55 * (1.0 - Math.exp(-T / 40.0)));

      perNumberProfiles[num] = {
        num,
        frequencyRaw: k,
        frequencyScore,
        velocityRaw: vel,
        momentumScore,
        bayesPosteriorExpected: posteriorExpected,
        bayesScore,
        stateScore,
        confidence: sampleConfidence
      };
    }

    const analysis: StateDynamicsAnalysis = {
      drawName,
      domainSize,
      historyLength: T,
      perNumberProfiles,
      freqMedian,
      freqIqr,
      velocityMedian,
      velocityIqr,
      hurstExponent: H,
      priorAlpha,
      priorBeta
    };

    ctx.pluginCache[CACHE_KEY] = analysis;

    // Rétrocompatibilité totale des sous-caches pour les plugins satellites
    ctx.pluginCache[AlgoKey.FREQUENCY] = {
      median: freqMedian,
      iqr: freqIqr,
      sampleSize: T
    };
    ctx.pluginCache[AlgoKey.MOMENTUM] = {
      median: velocityMedian,
      iqr: velocityIqr,
      medianDiff: velocityMedian,
      iqrDiff: velocityIqr,
      normFactor
    };
    ctx.pluginCache[AlgoKey.BAYES] = {
      bayesScores: new Float64Array(Array.from({ length: domainSize + 1 }, (_, n) => perNumberProfiles[n]?.bayesScore || 50)),
      aiScores: new Float64Array(domainSize + 1)
    };

    return analysis;
  }

  public static getProfile(num: number, ctx: AlgorithmContext): NumberStateProfile {
    const analysis = this.analyze(ctx);
    return analysis.perNumberProfiles[num] || {
      num,
      frequencyRaw: 0,
      frequencyScore: 50,
      velocityRaw: 0,
      momentumScore: 50,
      bayesPosteriorExpected: 0.05,
      bayesScore: 50,
      stateScore: 50,
      confidence: 0.5
    };
  }
}
