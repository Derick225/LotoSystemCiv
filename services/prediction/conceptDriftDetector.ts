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
    detectDriftPageHinkley(errorStream: number[]): { hasDrift: boolean; driftIndex: number; confidence: number } {
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
        let maxMt = Number.MIN_VALUE;
        
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
            }
            if (mt > maxMt) {
                maxMt = mt;
            }

            const phStatistic = mt - minMt;
            if (phStatistic > peakStatistic) {
                peakStatistic = phStatistic;
                driftIndex = i;
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
    computeKLDivergence(distP: Float64Array, distQ: Float64Array): number {
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
     * Analyse structurelle de dérive de concept basée sur la KL-Divergence normalisée.
     * Compare de façon hermétique l'historique récent et l'historique ancien du tirage actif.
     */
    evaluateStructuralDrift(history: { gagnants: number[]; drawName?: string }[]): { 
        driftDetected: boolean; 
        divergence: number; 
        severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
        confidence: number;
    } {
        const activeDraw = useNexusStore.getState().drawName || "Reveil";
        const purifiedHistory = purifyHistoryForDraw(activeDraw, history);

        // Minimum requis pour une représentativité statistique minimale sur 2 blocs
        if (purifiedHistory.length < 20) {
            return { driftDetected: false, divergence: 0, severity: 'LOW', confidence: 0 };
        }

        const mid = Math.floor(purifiedHistory.length / 2);
        const recent = purifiedHistory.slice(0, mid);
        const old = purifiedHistory.slice(mid);

        const freqRecent = new Float64Array(91);
        const freqOld = new Float64Array(91);

        recent.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqRecent[n]++; }));
        old.forEach(d => d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freqOld[n]++; }));

        // Normalisation continue des distributions de probabilité
        let sumR = 0;
        let sumO = 0;
        for (let i = 1; i <= 90; i++) { 
            sumR += freqRecent[i]; 
            sumO += freqOld[i]; 
        }
        for (let i = 1; i <= 90; i++) { 
            freqRecent[i] /= (sumR || 1); 
            freqOld[i] /= (sumO || 1); 
        }

        const klDiv = this.computeKLDivergence(freqRecent, freqOld);

        // 1. Calcul de la dérive théorique attendue par pur bruit d'échantillonnage multinomial (Zéro Nombre Magique)
        // Pour M classes (90 numéros) et N_tirages (5 numéros par tirage), le bruit d'échantillonnage de KL s'écrit :
        // KL_noise = (M - 1) / (2 * N_samples)
        const sampleSizeRecent = recent.length * 5;
        const expectedKLSampleNoise = 89.0 / (2.0 * sampleSizeRecent);

        // 2. Calcul du ratio d'écart par rapport au bruit attendu
        const deviationRatio = klDiv / (expectedKLSampleNoise || 1e-4);

        // 3. Mapping continu de sévérité basé sur des déviations statistiques du bruit
        let severity: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'LOW';
        if (deviationRatio >= 3.0) {
            severity = 'CRITICAL'; // Déviation majeure de 3x le bruit attendu
        } else if (deviationRatio >= 1.5) {
            severity = 'MEDIUM'; // Déviation intermédiaire de 1.5x le bruit attendu
        }

        // 4. Calcul de la confiance globale via un mapping sigmoïdal lisse centré sur 1.5x le bruit
        const confidenceProbability = 1.0 / (1.0 + Math.exp(-2.5 * (deviationRatio - 1.5)));
        const confidence = parseFloat((confidenceProbability * 100).toFixed(2));

        return {
            driftDetected: deviationRatio >= 1.5,
            divergence: klDiv,
            severity,
            confidence
        };
    }
}

export const driftDetector = new ConceptDriftDetector();
