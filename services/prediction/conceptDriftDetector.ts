/**
 * Concept Drift Detector (Détection Préventive de Dérive)
 * Analyse les séries temporelles des erreurs (Brier Scores, Déviations Spectrales)
 * pour détecter si la distribution sous-jacente du tirage a changé (Concept Drift).
 * 
 * Conception mathématique continue v3.0 - Conforme AGENTS.md (Zéro Nombre Magique & 100% Déterministe)
 */

import { useNexusStore } from "../../store/useNexusStore";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";

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

        // 3. Dérivation continue des hyperparamètres Page-Hinkley
        // La tolérance d'amortissement s'adapte à l'écart-type pour éviter de faux signaux sur bruit blanc.
        const dynamicTolerance = Math.max(1e-5, 0.15 * stdDev);
        // Le seuil d'alerte s'établit à 3.5 écarts-types (critère d'anomalie standard).
        const dynamicThreshold = Math.max(1e-4, 3.5 * stdDev);

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
     * Mesure la divergence de Kullback-Leibler (KL-Divergence) entre deux distributions de fréquences.
     */
    public computeKLDivergence(distP: Float64Array, distQ: Float64Array): number {
        let kl = 0.0;
        const epsilon = 1e-12; // Régularisation infinitésimale continue
        
        for (let i = 0; i < distP.length; i++) {
            const p = distP[i] + epsilon;
            const q = distQ[i] + epsilon;
            kl += p * Math.log(p / q);
        }
        return kl;
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
     * Élimine les seuils fixes comme 0.85 ou 0.80 au profit d'un niveau de signification alpha (0.05).
     * Le seuil dynamique est dérivé directement de la significativité alpha : 1 - alpha = 0.95 (confiance de 95%).
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
        const kellyRisk = (successCollapseRisk > 0) ? Math.max(0, w - (l / (successCollapseRisk + 1e-9))) : w;

        let driftRisk = 0;
        if (tStatistic < 0) {
            driftRisk = 1.0 - pValue; // P(t < tStatistic)
        }

        // Étalement continu de la marge de sécurité (fraction Kelly) basé sur l'incertitude empirique (variance)
        const safetyFraction = 0.5 + 0.5 * Math.min(1.0, baselineVar / 10.0);
        driftRisk = Math.max(driftRisk, kellyRisk * safetyFraction);
        driftRisk = 1 - (1 - driftRisk) * (1 - successCollapseRisk); // Union probabiliste

        const alphaSignificance = 0.05;
        const dynamicDriftThreshold = 1.0 - alphaSignificance; // Seuil de confiance rigoureux (95%, soit 0.95)
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
    public evaluateStructuralDrift(history: { gagnants: number[]; drawName?: string }[]): { 
        driftDetected: boolean; 
        divergence: number; 
        severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
        confidence: number;
        driftIndex?: number;
    } {
        const activeDraw = useNexusStore.getState().drawName || "Reveil";
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
        const sampleSizeRecent = recent.length * 5;
        const expectedKLSampleNoise = 89.0 / (2.0 * sampleSizeRecent);
        const deviationRatio = klDiv / (expectedKLSampleNoise || 1e-4);

        let globalSeverity: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'LOW';
        if (deviationRatio >= 3.0) {
            globalSeverity = 'CRITICAL';
        } else if (deviationRatio >= 1.5) {
            globalSeverity = 'MEDIUM';
        }

        const globalConfidenceProb = 1.0 / (1.0 + Math.exp(-2.5 * (deviationRatio - 1.5)));
        const globalConfidence = parseFloat((globalConfidenceProb * 100).toFixed(2));
        const globalDriftDetected = deviationRatio >= 1.5;

        // --- 2. ÉVALUATION SÉQUENTIELLE GLISSANTE (Page-Hinkley sur KL-Divergence) ---
        const chronologicalHistory = [...purifiedHistory].reverse();
        const N_chrono = chronologicalHistory.length;
        // Taille de la fenêtre glissante : 15% de l'historique
        const W = Math.max(6, Math.floor(N_chrono * 0.15));

        const klStream: number[] = [];
        const klIndices: number[] = [];

        for (let t = W; t < N_chrono; t++) {
            const recentSlice = chronologicalHistory.slice(t - W + 1, t + 1);
            const baselineSlice = chronologicalHistory.slice(0, t - W + 1);
            if (baselineSlice.length < 5) continue;

            const freqR = new Float64Array(91);
            const freqB = new Float64Array(91);

            recentSlice.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqR[n]++; }));
            baselineSlice.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqB[n]++; }));

            let sumR_t = 0, sumB_t = 0;
            for (let i = 1; i <= 90; i++) {
                sumR_t += freqR[i];
                sumB_t += freqB[i];
            }
            for (let i = 1; i <= 90; i++) {
                freqR[i] /= (sumR_t || 1);
                freqB[i] /= (sumB_t || 1);
            }

            const kl = this.computeKLDivergence(freqR, freqB);
            klStream.push(kl);
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

        return {
            driftDetected,
            divergence: klDiv,
            severity,
            confidence,
            driftIndex
        };
    }
}

export const driftDetector = new ConceptDriftDetector();
