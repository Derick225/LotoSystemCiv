import { AlgoKey } from "../../shared/prediction.types";
import { DrawResult, AlgoWeights, ForensicReport } from "../../types";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { LABELS_MAP, ALGO_CATEGORIES } from "../../hooks/useAlgorithmSync";
import { runSystematicDnaAudit } from "./dnaAuditService";
import { evaluateAlgoEmpiricalProof } from "./weightsManager";
import { extractFeatures } from "./featureExtractor";
import { computeAdvancedMetrics } from "./advancedMetricsCalculator";
import { getAlgorithmsForContext, AlgorithmContext } from "./algorithmRegistry";
import "./coreAlgorithms";

export interface SubAlgoCorrelationMetric {
  algoKey: AlgoKey;
  label: string;
  category: string;
  activeWeight: number;
  canonicalWeight: number;
  weightDriftDelta: number; // |active - canonical| / canonical
  
  // Preuve empirique objective sur le tirage actif
  hasEmpiricalProof: boolean;
  proofScore: number;
  empiricalHitRate: number;
  baselineRate: number;

  // Métriques de corrélation continue avec les écarts (0.0 à 1.0 ou -1.0 à +1.0)
  errorCorrelation: number; // Pearson r entre score de l'algo et l'erreur modulaire réelle (-1 à +1)
  wassersteinLoss: number; // Perte de Wasserstein estimée (0 à 1)
  falsePositiveRate: number; // Taux de surestimation des numéros perdants (0 à 1)
  missedSignalRate: number; // Taux d'omission de numéros gagnants (0 à 1)
  nearMissSensitivity: number; // Taux de décalage voisin/miroir (0 à 1)
  noiseEntropyDivergence: number; // Divergence d'entropie informationnelle (0 à 1)
  
  // Score composite de toxicité / sous-performance (0 à 100)
  toxicityIndex: number;
  reliabilityScore: number; // 100 - toxicityIndex
  
  // Statut catégoriel continu
  status: "OPTIMAL" | "STABLE" | "MODERATE_DRIFT" | "CRITICAL_UNDERPERFORMING";
  diagnostics: string;
  
  // Historique des dérives par tirage récent
  drawDivergences: {
    drawDate: string;
    drawIndex: number;
    divergenceScore: number; // 0 à 100
    isAnomaly: boolean;
  }[];
}

export interface InterAlgoCrossCorrelation {
  algoA: AlgoKey;
  algoB: AlgoKey;
  labelA: string;
  labelB: string;
  crossErrorCorrelation: number; // -1 à +1
  coDriftIndex: number; // 0 à 100
  isRedundantOrAmplifying: boolean;
}

export interface SubAlgoHeatmapData {
  drawName: string;
  evaluatedAt: number;
  totalAlgorithms: number;
  underperformingCount: number;
  averageToxicity: number;
  highestToxicityAlgo: SubAlgoCorrelationMetric | null;
  correlationMetrics: SubAlgoCorrelationMetric[];
  crossCorrelations: InterAlgoCrossCorrelation[];
  recentDrawHeaders: { date: string; label: string }[];
  summaryInsights: string[];
}

/**
 * Calcul continu du coefficient de corrélation linéaire de Pearson r(X, Y)
 * avec protection contre la division par zéro et saturation [-1, 1].
 */
function computePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0.0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator < 1e-9) return 0.0;

  const r = numerator / denominator;
  return parseFloat(Math.max(-1.0, Math.min(1.0, r)).toFixed(4));
}

/**
 * Analyse déterministe et isolée de corrélation entre les sous-algorithmes
 * et les écarts de prédictions médico-légales sur le tirage actif.
 */
export async function computeSubAlgorithmDivergenceCorrelations(
  drawName: string,
  history: DrawResult[],
  activeWeights: AlgoWeights,
  forensicReports: ForensicReport[] = []
): Promise<SubAlgoHeatmapData> {
  const pureHistory = purifyHistoryForDraw<DrawResult>(drawName, history);
  const dnaAudit = await runSystematicDnaAudit(drawName, pureHistory, activeWeights);
  const proofMap = evaluateAlgoEmpiricalProof(drawName, pureHistory);

  const allAlgoKeys = Object.values(AlgoKey);
  const numAlgos = allAlgoKeys.length;

  // Récupérer les 10 derniers tirages réels pour l'axe temporel de la heatmap
  const recentHistory = pureHistory.slice(0, 10);
  const recentDrawHeaders = recentHistory.map((d, idx) => ({
    date: d.date || `Tirage #${idx + 1}`,
    label: d.date ? d.date.slice(0, 10) : `T-${idx + 1}`
  }));

  // Extraire les erreurs et divergences pour chaque tirage
  const drawErrors: number[] = [];
  const drawDivergencesMap: { [drawDate: string]: number } = {};

  recentHistory.forEach((draw, dIdx) => {
    const matchedReport = forensicReports.find(
      (r) => r.drawResultId === draw.id || r.date === draw.date
    );

    let divScore = 50; // Base médiane neutre
    if (matchedReport) {
      divScore = matchedReport.divergenceMetric ?? 50;
    } else {
      // Dériver la dispersion intrinsèque du tirage sans constante arbitraire
      const numbers = Array.isArray(draw.gagnants) ? draw.gagnants : [];
      if (numbers.length > 1) {
        const mean = numbers.reduce((a: number, b: number) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((s: number, n: number) => s + (n - mean) ** 2, 0) / numbers.length;
        const normalizedVar = Math.min(1.0, variance / 675.0); // 675 ~ variance uniforme sur 90
        divScore = Math.round(30 + normalizedVar * 50);
      }
    }
    drawErrors.push(divScore);
    drawDivergencesMap[draw.date || `T-${dIdx}`] = divScore;
  });

  // Pré-évaluation causale réelle des plugins algorithmiques sur les sous-historiques T-idx (sans fuite du futur)
  interface CausalAlgoDrawEval {
    divergenceByAlgo: Record<string, number>;
    falsePosByAlgo: Record<string, number>;
    missedByAlgo: Record<string, number>;
    nearMissByAlgo: Record<string, number>;
    wassersteinByAlgo: Record<string, number>;
  }

  const causalEvals: CausalAlgoDrawEval[] = [];
  for (let idx = 0; idx < recentHistory.length; idx++) {
    const targetDraw = recentHistory[idx];
    const winners = (Array.isArray(targetDraw.gagnants) ? targetDraw.gagnants : []).filter(n => n >= 1 && n <= 90);
    const subHistory = pureHistory.slice(idx + 1, Math.min(pureHistory.length, idx + 41));

    const divergenceByAlgo: Record<string, number> = {};
    const falsePosByAlgo: Record<string, number> = {};
    const missedByAlgo: Record<string, number> = {};
    const nearMissByAlgo: Record<string, number> = {};
    const wassersteinByAlgo: Record<string, number> = {};

    if (subHistory.length >= 5 && winners.length > 0) {
      try {
        const subFeatures = await extractFeatures(drawName, subHistory);
        const subMetrics = await computeAdvancedMetrics(subHistory, drawName, {}, false);
        const ctx: AlgorithmContext = {
          features: subFeatures,
          advancedMetrics: subMetrics,
          history: subHistory,
          drawName,
          weights: { ...activeWeights },
          algoWeights: { ...activeWeights },
          statisticalBounds: subMetrics.statisticalBounds || {
            median: 0, q1: 0, q3: 0, variance: 0, kurtosis: 0, skewness: 0, shannonEntropy: 0.5, hurstExponent: 0.5
          },
          deterministicSeed: idx + 1,
          maxFreq: Math.max(1, ...Array.from(subFeatures.freqMap || [])),
          maxMarkov: Math.max(0.001, ...Array.from(subFeatures.markovMap || [])),
          maxMachineTransfer: Math.max(0.001, ...Array.from(subFeatures.machineTransferMap || [])),
          pluginCache: {},
        };

        const plugins = getAlgorithmsForContext(ctx);
        plugins.forEach(p => {
          try { p.precompute?.(ctx); } catch { /* ignore */ }
        });

        const sortedWinners = [...winners].sort((a, b) => a - b);

        for (const plugin of plugins) {
          const scored90: { num: number; score: number }[] = [];
          for (let n = 1; n <= 90; n++) {
            let s = 0;
            try {
              const res = plugin.evaluate(n, ctx);
              s = Number.isFinite(res.score) ? res.score : 0;
            } catch {
              s = 0;
            }
            scored90.push({ num: n, score: s });
          }

          scored90.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.num - b.num));
          const rankMap = new Map<number, number>();
          scored90.forEach((item, rIdx) => rankMap.set(item.num, rIdx));

          // 1. Divergence de rang moyen des gagnants (0 = rangs 0..4 idéaux, 100 = pire rang 89)
          let rankSum = 0;
          let missedCount = 0;
          for (const w of winners) {
            const r = rankMap.get(w) ?? 45;
            rankSum += r;
            if (r >= 45) missedCount++;
          }
          const meanRank = rankSum / winners.length;
          divergenceByAlgo[plugin.key] = Math.min(100, Math.max(0, Math.round((meanRank / 89.0) * 100)));
          missedByAlgo[plugin.key] = missedCount / winners.length;

          // 2. Taux de faux positifs dans le Top-10
          const top10 = scored90.slice(0, 10).map(x => x.num);
          const hits10 = top10.filter(n => winners.includes(n)).length;
          falsePosByAlgo[plugin.key] = (10 - hits10) / 10.0;

          // 3. Sensibilité Near-Miss circulaire sur le tore Z_90 (distance géodésique 1 ou 2)
          const top5 = scored90.slice(0, 5).map(x => x.num);
          let nearMisses = 0;
          for (const pNum of top5) {
            if (winners.includes(pNum)) continue;
            const isNear = winners.some(w => {
              const diff = Math.abs(pNum - w);
              const circDist = Math.min(diff, 90 - diff);
              return circDist >= 1 && circDist <= 2;
            });
            if (isNear) nearMisses++;
          }
          nearMissByAlgo[plugin.key] = nearMisses / 5.0;

          // 4. Transport optimal 1D de Wasserstein circulaire sur Z_90 entre Top-5 prédit et gagnants
          const sortedTop5 = [...top5].sort((a, b) => a - b);
          const pairCount = Math.min(sortedTop5.length, sortedWinners.length);
          let wSum = 0;
          for (let m = 0; m < pairCount; m++) {
            const diff = Math.abs(sortedTop5[m] - sortedWinners[m]);
            wSum += Math.min(diff, 90 - diff) / 45.0;
          }
          wassersteinByAlgo[plugin.key] = pairCount > 0 ? wSum / pairCount : 0.5;
        }
      } catch {
        // Repli neutre si sous-historique trop court
      }
    }

    causalEvals.push({
      divergenceByAlgo,
      falsePosByAlgo,
      missedByAlgo,
      nearMissByAlgo,
      wassersteinByAlgo,
    });
  }

  const correlationMetrics: SubAlgoCorrelationMetric[] = [];
  const algoErrorProfiles: { [key: string]: number[] } = {};

  allAlgoKeys.forEach((algoKey) => {
    const label = LABELS_MAP[algoKey] || algoKey;
    const cat = ALGO_CATEGORIES.find((c) => c.keys.includes(algoKey))?.name || "Général";
    const auditItem = dnaAudit.algorithmAuditList.find((a) => a.key === algoKey);

    const defaultW = 1.0 / Math.max(1, numAlgos);
    const activeWeight = activeWeights[algoKey] ?? defaultW;
    const canonicalWeight = auditItem?.canonicalWeight ?? defaultW;
    const weightDriftDelta = auditItem?.weightDriftDelta ?? Math.abs(activeWeight - canonicalWeight) / Math.max(1e-4, canonicalWeight);

    // Profil causal réel d'erreur par tirage issu de l'évaluation Walk-Forward des plugins
    const algoErrors: number[] = [];
    const drawDivergencesList: {
      drawDate: string;
      drawIndex: number;
      divergenceScore: number;
      isAnomaly: boolean;
    }[] = [];

    let sumFalsePos = 0;
    let sumMissed = 0;
    let sumNearMiss = 0;
    let sumWasserstein = 0;
    let validEvalCount = 0;

    recentHistory.forEach((draw, idx) => {
      const globalError = drawErrors[idx] || 50;
      const evalAtIdx = causalEvals[idx];
      const empiricalDiv = evalAtIdx?.divergenceByAlgo[algoKey];

      let algoSpecificDivergence: number;
      if (typeof empiricalDiv === "number") {
        algoSpecificDivergence = empiricalDiv;
        sumFalsePos += evalAtIdx.falsePosByAlgo[algoKey] ?? 0.5;
        sumMissed += evalAtIdx.missedByAlgo[algoKey] ?? 0.5;
        sumNearMiss += evalAtIdx.nearMissByAlgo[algoKey] ?? 0.1;
        sumWasserstein += evalAtIdx.wassersteinByAlgo[algoKey] ?? 0.5;
        validEvalCount++;
      } else {
        // Repli continu basé sur la dérive de poids lorsque le sous-historique causal a moins de 5 tirages
        const driftAmplifier = 1.0 / (1.0 + Math.exp(-weightDriftDelta));
        algoSpecificDivergence = Math.min(100, Math.max(5, Math.round(globalError * driftAmplifier)));
      }

      algoErrors.push(algoSpecificDivergence);
      drawDivergencesList.push({
        drawDate: draw.date || `T-${idx + 1}`,
        drawIndex: idx,
        divergenceScore: algoSpecificDivergence,
        isAnomaly: algoSpecificDivergence >= 65 || weightDriftDelta >= 0.08
      });
    });

    algoErrorProfiles[algoKey] = algoErrors;

    // Corrélation de Pearson entre les erreurs causales de cet algorithme et l'erreur globale du système
    const errorCorrelation = computePearsonCorrelation(algoErrors, drawErrors);

    const stability = auditItem?.spectralResonance ?? 0.85;
    const meanAlgoError = algoErrors.reduce((a, b) => a + b, 0) / Math.max(1, algoErrors.length);

    const wassersteinLoss = parseFloat(
      Math.min(
        1.0,
        validEvalCount > 0
          ? sumWasserstein / validEvalCount
          : (meanAlgoError / 100.0) * (1.0 + weightDriftDelta)
      ).toFixed(4)
    );

    const falsePositiveRate = parseFloat(
      Math.min(
        1.0,
        Math.max(
          0.01,
          validEvalCount > 0
            ? sumFalsePos / validEvalCount
            : (meanAlgoError / 100.0)
        )
      ).toFixed(4)
    );

    const missedSignalRate = parseFloat(
      Math.min(
        1.0,
        Math.max(
          0.01,
          validEvalCount > 0
            ? sumMissed / validEvalCount
            : 1.0 - stability
        )
      ).toFixed(4)
    );

    const nearMissSensitivity = parseFloat(
      Math.min(
        1.0,
        Math.max(
          0.01,
          validEvalCount > 0
            ? sumNearMiss / validEvalCount
            : 1.0 / (1.0 + Math.exp(-weightDriftDelta))
        )
      ).toFixed(4)
    );

    const noiseEntropyDivergence = parseFloat(
      Math.min(1.0, Math.max(0.01, (1.0 - stability) * (1.0 + weightDriftDelta))).toFixed(4)
    );

    // Calcul continu de l'indice composite de toxicité (0 à 100) par moyenne pondérée sur le simplexe
    const corrFactor = Math.max(0, errorCorrelation);
    const normalizedComposite = (
      Math.min(1.0, weightDriftDelta) +
      corrFactor +
      wassersteinLoss +
      falsePositiveRate
    ) / 4.0;

    // Activation logistique continue centrée sur 0.5
    const toxicityIndex = Math.min(
      100,
      Math.max(0, Math.round(100.0 / (1.0 + Math.exp(-6.0 * (normalizedComposite - 0.45)))))
    );
    const reliabilityScore = 100 - toxicityIndex;

    // Statut catégoriel déterminé par les seuils continus
    let status: SubAlgoCorrelationMetric["status"] = "OPTIMAL";
    let diagnostics = "Moteur stable, parfaitement aligné sur la signature ADN canonique.";

    if (toxicityIndex >= 70 || weightDriftDelta >= 0.12) {
      status = "CRITICAL_UNDERPERFORMING";
      diagnostics = `Sous-performance critique : forte corrélation aux erreurs (r = +${errorCorrelation.toFixed(2)}) et sur-pondération active de +${(weightDriftDelta * 100).toFixed(1)}%.`;
    } else if (toxicityIndex >= 45 || weightDriftDelta >= 0.05) {
      status = "MODERATE_DRIFT";
      diagnostics = `Dérive modérée : instabilité de distribution détectée lors des 5 derniers tirages.`;
    } else if (toxicityIndex >= 25) {
      status = "STABLE";
      diagnostics = `Fonctionnement nominal : fluctuations mineures dans les marges de tolérance.`;
    }

    const proof = proofMap[algoKey];

    correlationMetrics.push({
      algoKey,
      label,
      category: cat,
      activeWeight,
      canonicalWeight,
      weightDriftDelta,
      hasEmpiricalProof: Boolean(proof?.hasProof),
      proofScore: proof?.proofScore || 0,
      empiricalHitRate: proof?.empiricalHitRate || 0,
      baselineRate: proof?.baselineRate || 0.0556,
      errorCorrelation,
      wassersteinLoss,
      falsePositiveRate,
      missedSignalRate,
      nearMissSensitivity,
      noiseEntropyDivergence,
      toxicityIndex,
      reliabilityScore,
      status,
      diagnostics,
      drawDivergences: drawDivergencesList,
    });
  });

  // Calcul des inter-corrélations d'erreurs entre algorithmes (Co-dérive)
  const crossCorrelations: InterAlgoCrossCorrelation[] = [];
  for (let i = 0; i < allAlgoKeys.length; i++) {
    for (let j = i + 1; j < allAlgoKeys.length; j++) {
      const keyA = allAlgoKeys[i];
      const keyB = allAlgoKeys[j];
      const profA = algoErrorProfiles[keyA] || [];
      const profB = algoErrorProfiles[keyB] || [];
      
      const rCross = computePearsonCorrelation(profA, profB);
      const metricA = correlationMetrics.find((m) => m.algoKey === keyA);
      const metricB = correlationMetrics.find((m) => m.algoKey === keyB);

      const coDrift = Math.round(
        Math.max(0, rCross) * 50 +
        ((metricA?.weightDriftDelta || 0) + (metricB?.weightDriftDelta || 0)) * 25
      );

      crossCorrelations.push({
        algoA: keyA,
        algoB: keyB,
        labelA: LABELS_MAP[keyA] || keyA,
        labelB: LABELS_MAP[keyB] || keyB,
        crossErrorCorrelation: rCross,
        coDriftIndex: Math.min(100, coDrift),
        isRedundantOrAmplifying: rCross >= 0.75 && coDrift >= 50
      });
    }
  }

  // Tri par défaut : les moins performants (plus toxiques) en premier
  correlationMetrics.sort((a, b) => b.toxicityIndex - a.toxicityIndex);

  const underperformingCount = correlationMetrics.filter(
    (m) => m.status === "CRITICAL_UNDERPERFORMING" || m.status === "MODERATE_DRIFT"
  ).length;

  const totalTox = correlationMetrics.reduce((sum, m) => sum + m.toxicityIndex, 0);
  const averageToxicity = Math.round(totalTox / Math.max(1, correlationMetrics.length));
  const highestToxicityAlgo = correlationMetrics[0] || null;

  // Résumé d'analyse IA
  const summaryInsights: string[] = [];
  if (underperformingCount > 0) {
    summaryInsights.push(
      `${underperformingCount} sous-algorithme(s) présentent une corrélation anormale avec les erreurs de tirage sur ${drawName}.`
    );
  }
  if (highestToxicityAlgo && highestToxicityAlgo.toxicityIndex >= 50) {
    summaryInsights.push(
      `Le moteur le plus pénalisant est "${highestToxicityAlgo.label}" (Indice de Toxicité : ${highestToxicityAlgo.toxicityIndex}%, Dérive de poids : +${(highestToxicityAlgo.weightDriftDelta * 100).toFixed(1)}%).`
    );
  } else {
    summaryInsights.push(
      `L'ensemble des moteurs de calcul opère actuellement dans les limites de cohérence spectrale.`
    );
  }

  return {
    drawName,
    evaluatedAt: Date.now(),
    totalAlgorithms: numAlgos,
    underperformingCount,
    averageToxicity,
    highestToxicityAlgo,
    correlationMetrics,
    crossCorrelations,
    recentDrawHeaders,
    summaryInsights,
  };
}
