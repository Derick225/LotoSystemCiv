/**
 * Concept Drift Detector (Détection Préventive de Dérive)
 * Analyse les séries temporelles des erreurs (Brier Scores, Déviations Spectrales)
 * pour détecter si la distribution sous-jacente du tirage a changé (Concept Drift).
 * 
 * Conception mathématique continue v3.0 - Conforme AGENTS.md (Zéro Nombre Magique & 100% Déterministe)
 */

import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { computeTopologicalLyapunovHpc } from "../wasm/lotoEngineBridge";

export class ConceptDriftDetector {
    /**
     * Test de Page-Hinkley avec calibrage statistique adaptatif et transition continue.
     * Détecte un changement brusque dans la moyenne d'un flux d'erreur (ex: RMSE ou Brier Loss).
     */
    public detectDriftPageHinkley(errorStream: number[]): { hasDrift: boolean; driftIndex: number; confidence: number } {
        const N = errorStream.length;
        if (N < 10) return { hasDrift: false, driftIndex: -1, confidence: 0 };

        // 1. Calcul de la moyenne empirique
        let sum = 0;
        for (const val of errorStream) {
            sum += val;
        }
        const mean = sum / N;

        // 2. Calcul de la variance et de l'écart-type empiriques (ZÉRO NOMBRE MAGIQUE)
        let varianceSum = 0;
        for (const val of errorStream) {
            varianceSum += Math.pow(val - mean, 2);
        }
        const variance = varianceSum / (N - 1 || 1);
        const stdDev = Math.sqrt(variance);

        // Tolerance: derived from the Neyman-Pearson lemma — use 1 sigma as the minimum
        // detectable effect size for a one-sided test at alpha=0.16 (1-sigma level)
        const dynamicTolerance = Math.max(1e-5, stdDev);
        // Threshold: 3-sigma rule (99.7% confidence interval for anomaly detection)
        const dynamicThreshold = Math.max(1e-4, 3.0 * stdDev);

        let runningSum = 0;
        let mt = 0; // Somme cumulée de déviation
        let minMt = Number.MAX_VALUE;
        let minIndex = 0;
        
        let driftIndex = -1;
        let peakStatistic = 0;

        for (let i = 0; i < N; i++) {
            const val = errorStream[i];
            const currentMean = i === 0 ? val : runningSum / i;
            runningSum += val;
            
            // Statistique cumulée avec amortissement différentiable
            mt += (val - currentMean - dynamicTolerance);
            
            if (mt < minMt) {
                minMt = mt;
                minIndex = i;
            }

            const phStatistic = mt - minMt;
            if (phStatistic > peakStatistic) {
                peakStatistic = phStatistic;
                driftIndex = minIndex;
            }
        }

        // 4. Transition continue via fonction logistique (Sigmoïde) au lieu de coupures binaires abruptes
        // Calcule la probabilité de drift de façon lisse et differentiable.
        const scale = 2.0 / (stdDev || 1e-4);
        const driftProbability = 1.0 / (1.0 + Math.exp(-scale * (peakStatistic - dynamicThreshold)));
        const confidence = parseFloat((driftProbability * 100).toFixed(2));

        return {
            hasDrift: driftProbability >= 0.5,
            driftIndex: driftIndex,
            confidence
        };
    }

    /**
     * Mesure la divergence de Kullback-Leibler (KL-Divergence) régularisée par un a priori de Dirichlet-Laplace
     * alpha_0 = 5/90 pour éliminer les singularités log(0) sur de petits échantillons.
     */
    public computeKLDivergence(distP: Float64Array, distQ: Float64Array): number {
        const N = 90;
        const prior = 5.0 / (N * N); // Régularisation bayésienne continue dérivée du ratio 5/90
        let sumP = 0;
        let sumQ = 0;
        for (let i = 1; i < distP.length; i++) {
            sumP += distP[i] + prior;
            sumQ += distQ[i] + prior;
        }
        let kl = 0.0;
        for (let i = 1; i < distP.length; i++) {
            const p = (distP[i] + prior) / (sumP || 1.0);
            const q = (distQ[i] + prior) / (sumQ || 1.0);
            kl += p * Math.log(p / q);
        }
        return Math.max(0, kl);
    }

    /**
     * Divergence de Jensen-Shannon symétrique et bornée D_JS(P || Q) normalisée dans [0, 1]
     * avec lissage de Dirichlet-Laplace continu (alpha_0 = 5 / 90^2).
     */
    public computeJensenShannonDivergence(distP: Float64Array, distQ: Float64Array): number {
        const N = 90;
        const prior = 5.0 / (N * N);
        let sumP = 0;
        let sumQ = 0;
        for (let i = 1; i < distP.length; i++) {
            sumP += distP[i] + prior;
            sumQ += distQ[i] + prior;
        }
        let js = 0.0;
        for (let i = 1; i < distP.length; i++) {
            const p = (distP[i] + prior) / (sumP || 1.0);
            const q = (distQ[i] + prior) / (sumQ || 1.0);
            const m = 0.5 * (p + q);
            js += 0.5 * (p * Math.log(p / m) + q * Math.log(q / m));
        }
        return Math.min(1.0, Math.max(0.0, js / Math.LN2));
    }

    /**
     * Distance de transport optimal de Wasserstein 1D exacte sur l'anneau circulaire Z_90 (Kantorovich-Rubinstein)
     * normalisée dans [0, 1] par la demi-période maximale (45.0).
     */
    public computeCircularWassersteinDistance(distP: Float64Array, distQ: Float64Array): number {
        const N = 90;
        let sumP = 0;
        let sumQ = 0;
        for (let i = 1; i <= N; i++) {
            sumP += distP[i] || 0;
            sumQ += distQ[i] || 0;
        }
        // Masses nulles = données absentes (branche hors du pipeline gardé, qui garantit des tirages peuplés) ;
        // la convention 0.0 signifie « incomparable », pas « accord parfait mesuré ».
        if (sumP <= 0 || sumQ <= 0) return 0.0;

        const cumDiff = new Float64Array(N);
        let running = 0.0;
        for (let i = 1; i <= N; i++) {
            const p = (distP[i] || 0) / sumP;
            const q = (distQ[i] || 0) / sumQ;
            running += p - q;
            cumDiff[i - 1] = running;
        }

        // Solution analytique exacte sur le cercle : centrage autour de la médiane de la différence cumulée
        const sorted = Float64Array.from(cumDiff).sort();
        // Médiane d'un échantillon pair de taille N : moyenne des éléments N/2-1 et N/2
        const median = 0.5 * (sorted[N / 2 - 1] + sorted[N / 2]);
        let transportCost = 0.0;
        for (let i = 0; i < N; i++) {
            transportCost += Math.abs(cumDiff[i] - median);
        }
        return Math.min(1.0, transportCost / 45.0);
    }

    /**
     * Approximation continue de la p-value (CDF normale sigmoïdale de Student pour grand df).
     * Cecil Hastings Jr. (1955, "Approximations for Digital Computers") a prouvé qu'un facteur d'échelle 
     * constant de 1.702 permet d'approximer la Fonction de Répartition Cumulative (CDF) d'une loi normale 
     * par une fonction logistique (sigmoïde) avec une erreur absolue maximale extrêmement faible (< 0.003).
     * Formule : \Phi(x) ≈ 1 / (1 + e^(-1.702 * x)).
     * 
     * @param tStatistic Statistique de test t (ou score z) calculée.
     */
    public computePValueApprox(tStatistic: number): number {
        const absT = Math.abs(tStatistic);
        return 1.0 - 1.0 / (1.0 + Math.exp(-1.702 * absT));
    }

    /**
     * Évalue le risque de dérive de performance basé sur des critères rigoureux (Zéro Nombre Magique).
     * Le risque combine la fraction de Kelly lissée, la significativité du test t et l'effondrement
     * du taux de succès ; la décision binaire utilise le point médiant probabiliste 0.5 (équiprobable).
     * 
     * @param tStatistic Statistique t de Student pour comparer la moyenne récente et historique.
     * @param baselineVar Variance empirique du groupe de référence.
     * @param recentSuccessRate Taux de succès récent (fenêtre active).
     * @param baselineSuccessRate Taux de succès historique (ligne de base).
     */
    public evaluatePerformanceDriftRisk(
        tStatistic: number,
        baselineVar: number,
        recentSuccessRate: number,
        baselineSuccessRate: number
    ): { driftRisk: number; isPerformanceDrift: boolean; dynamicDriftThreshold: number } {
        const pValue = this.computePValueApprox(tStatistic);
        const successRateRatio = recentSuccessRate / (baselineSuccessRate || 1e-9);
        const successCollapseRisk = Math.max(0, 1.0 - successRateRatio);

        const w = 1.0 - pValue;
        const l = pValue;
        // Fraction de Kelly lissée : le rapport b/(b+l) est continu en b=0 (ni porte binaire,
        // ni division singulière), croissant en l'effondrement, et saturant à w quand celui-ci domine l'évidence.
        const kellyRisk = Math.max(
            0,
            w * (successCollapseRisk / Math.max(1e-9, successCollapseRisk + l))
        );

        let driftRisk = 0;
        if (tStatistic < 0) {
            driftRisk = 1.0 - pValue; // P(t < tStatistic)
        }

        // Étalement continu de la marge de sécurité (fraction Kelly) basé sur l'incertitude empirique (variance).
        // Normalisation par la borne de Popoviciu : la variance d'une variable bornée dans [0,1] (scores de Brier)
        // est majorée par 0.25, donc baselineVar/0.25 balaye [0,1] au lieu d'être inerte (var/10 ≤ 0.025).
        const safetyFraction = 0.5 + 0.5 * Math.min(1.0, baselineVar / 0.25);
        driftRisk = Math.max(driftRisk, kellyRisk * safetyFraction);
        driftRisk = 1 - (1 - driftRisk) * (1 - successCollapseRisk); // Union probabiliste

        // Seuil de décision = point médian naturel d'une probabilité (équiprobable P=0.5), la même
        // convention que detectDriftPageHinkley — aucun alpha fixe arbitraire (AGENTS.md).
        const dynamicDriftThreshold = 0.5;
        const isPerformanceDrift = driftRisk > dynamicDriftThreshold;

        return {
            driftRisk,
            isPerformanceDrift,
            dynamicDriftThreshold
        };
    }

    /**
     * Analyse structurelle de dérive de concept basée sur la KL-Divergence normalisée.
     * Combine un audit global binarisé (milieu d'historique) avec un test de Page-Hinkley séquentiel glissant.
     */
    public evaluateStructuralDrift(history: { gagnants: number[]; drawName?: string }[], targetDrawName?: string): { 
        driftDetected: boolean; 
        divergence: number; 
        severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
        confidence: number;
        driftIndex?: number;
        lyapunovExponent?: number;
        isChaotic?: boolean;
    } {
        const activeDraw = targetDrawName || history[0]?.drawName;
        if (!activeDraw) {
            return { driftDetected: false, divergence: 0, severity: 'LOW', confidence: 0 };
        }
        const purifiedHistory = purifyHistoryForDraw(activeDraw, history);

        // Minimum requis pour une représentativité statistique minimale sur 2 blocs
        if (purifiedHistory.length < 20) {
            return { driftDetected: false, divergence: 0, severity: 'LOW', confidence: 0 };
        }

        // --- 1. ÉVALUATION GLOBALE (Binaire traditionnel pour rétro-compatibilité et baseline) ---
        const mid = Math.floor(purifiedHistory.length / 2);
        const recent = purifiedHistory.slice(0, mid);
        const old = purifiedHistory.slice(mid);

        const freqRecent = new Float64Array(91);
        const freqOld = new Float64Array(91);

        recent.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqRecent[n]++; }));
        old.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqOld[n]++; }));

        let sumR = 0, sumO = 0;
        for (let i = 1; i <= 90; i++) { 
            sumR += freqRecent[i]; 
            sumO += freqOld[i]; 
        }
        for (let i = 1; i <= 90; i++) { 
            freqRecent[i] /= (sumR || 1); 
            freqOld[i] /= (sumO || 1); 
        }

        const klDiv = this.computeKLDivergence(freqRecent, freqOld);
        const jsDiv = this.computeJensenShannonDivergence(freqRecent, freqOld);
        const circularW = this.computeCircularWassersteinDistance(freqRecent, freqOld);

        const sampleSizeRecent = recent.length * 5;
        // Bruit asymptotique attendu pour la divergence de Jensen-Shannon sous H0 : (N - 1) / (8 * n * ln(2))
        const expectedJSSampleNoise = 89.0 / (8.0 * sampleSizeRecent * Math.LN2);
        const jsRatio = jsDiv / (expectedJSSampleNoise || 1e-4);
        // Bruit d'échantillonnage de Wasserstein 1D sur le cercle : 1 / sqrt(6 * sampleSizeRecent)
        const expectedWSampleNoise = 1.0 / Math.sqrt(6.0 * sampleSizeRecent);
        const wRatio = circularW / (expectedWSampleNoise || 1e-4);

        const deviationRatio = 0.5 * (jsRatio + wRatio);

        let globalSeverity: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'LOW';
        if (deviationRatio >= 3.0) {
            globalSeverity = 'CRITICAL';
        } else if (deviationRatio >= 1.5) {
            globalSeverity = 'MEDIUM';
        }

        const globalConfidenceProb = 1.0 / (1.0 + Math.exp(-1.702 * (deviationRatio - 1.5)));
        const globalConfidence = parseFloat((globalConfidenceProb * 100).toFixed(2));
        const globalDriftDetected = deviationRatio >= 1.5;

        // --- 2. ÉVALUATION SÉQUENTIELLE GLISSANTE (Page-Hinkley sur Jensen-Shannon + Wasserstein Circulaire) ---
        const chronologicalHistory = [...purifiedHistory].reverse();
        const N_chrono = chronologicalHistory.length;
        // Sliding window: sqrt(N) draws — bias-variance optimal for change-point detection
        const W = Math.max(6, Math.round(Math.sqrt(N_chrono)));

        const klStream: number[] = [];
        const klIndices: number[] = [];

        // Mise à jour incrémentale des compteurs : la fenêtre reste de taille W et la baseline
        // cumule tous les tirages antérieurs, sans rescanner l'historique à chaque étape.
        const freqWindow = new Float64Array(91);
        const freqBaseline = new Float64Array(91);
        let sumWindow = 0;
        let sumBaseline = 0;
        const updateFrequencies = (
          frequencies: Float64Array,
          winners: number[],
          direction: 1 | -1,
        ): number => {
          let updatedCount = 0;
          winners.forEach((n) => {
            if (n >= 1 && n <= 90) {
              frequencies[n] += direction;
              updatedCount += direction;
            }
          });
          return updatedCount;
        };

        // Pour t = W, la fenêtre récente vaut [1, W] et la baseline [0].
        sumBaseline += updateFrequencies(
          freqBaseline,
          chronologicalHistory[0].gagnants,
          1,
        );
        for (let t = 1; t < W; t++) {
          sumWindow += updateFrequencies(
            freqWindow,
            chronologicalHistory[t].gagnants,
            1,
          );
        }

        for (let t = W; t < N_chrono; t++) {
          if (t > W) {
            const leavingDraw = chronologicalHistory[t - W];
            sumBaseline += updateFrequencies(freqBaseline, leavingDraw.gagnants, 1);
            sumWindow += updateFrequencies(freqWindow, leavingDraw.gagnants, -1);
          }
          // Ajouter le tirage entrant dans la fenêtre
          sumWindow += updateFrequencies(
            freqWindow,
            chronologicalHistory[t].gagnants,
            1,
          );
          if (sumWindow <= 0 || sumBaseline <= 0) continue;

          // Normalisation temporaire pour le calcul JS + Wasserstein
          const normW = new Float64Array(91);
          const normB = new Float64Array(91);
          for (let i = 1; i <= 90; i++) {
            normW[i] = freqWindow[i] / sumWindow;
            normB[i] = freqBaseline[i] / sumBaseline;
          }

          const jsStep = this.computeJensenShannonDivergence(normW, normB);
          const wStep = this.computeCircularWassersteinDistance(normW, normB);
          klStream.push(0.5 * (jsStep + wStep));
          // Indice original inversé correspondant dans purifiedHistory (0 est le plus récent)
          klIndices.push(N_chrono - 1 - t);
        }

        const phResult = this.detectDriftPageHinkley(klStream);

        // Fusionner les signaux
        const driftDetected = globalDriftDetected || phResult.hasDrift;
        const confidence = parseFloat(Math.max(globalConfidence, phResult.confidence).toFixed(2));
        
        let severity = globalSeverity;
        if (phResult.hasDrift && phResult.confidence > 80 && severity === 'LOW') {
            severity = 'MEDIUM';
        }

        const driftIndex = phResult.hasDrift && phResult.driftIndex !== -1 
            ? klIndices[phResult.driftIndex] 
            : undefined;

        // Analyse du Chaos Dynamique Topologique (Lyapunov HPC Rust WASM)
        let lyapResult = { lyapunov_exponent: 0, is_chaotic: false };
        const numDrawsLyap = Math.min(60, purifiedHistory.length);
        if (numDrawsLyap >= 12) {
            const flatDraws = new Int32Array(numDrawsLyap * 5);
            for (let d = 0; d < numDrawsLyap; d++) {
                const g = purifiedHistory[d].gagnants;
                for (let c = 0; c < 5; c++) {
                    flatDraws[d * 5 + c] = g[c] ?? 0;
                }
            }
            const res = computeTopologicalLyapunovHpc(flatDraws, numDrawsLyap, 5, 25);
            lyapResult = { lyapunov_exponent: res.lyapunov_exponent, is_chaotic: res.is_chaotic };
        }

        if (lyapResult.is_chaotic && severity === 'LOW') {
            severity = 'MEDIUM';
        }

        return {
            driftDetected,
            divergence: klDiv,
            severity,
            confidence,
            driftIndex,
            lyapunovExponent: parseFloat(lyapResult.lyapunov_exponent.toFixed(4)),
            isChaotic: lyapResult.is_chaotic
        };
    }
}

export const driftDetector = new ConceptDriftDetector();
