
import type { AlgoWeights, ForensicReport, RLState } from '../types';
import { normalizeWeights } from './predictionEngine';

const LEARNING_RATE_BASE = 0.1;
const DECAY = 0.995;

/**
 * Service d'Apprentissage par Renforcement (RL).
 * Utilise une approche de type "Gradient Ascent" sur les poids algorithmiques
 * basée sur le feedback des rapports forensiques.
 */
export const ReinforcementLearningService = {
    
    /**
     * Initialise ou récupère l'état RL actuel
     */
    getRLState: (drawName: string): RLState => {
        try {
            const raw = localStorage.getItem(`rl_state_${drawName}`);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        
        return {
            lastCalibration: Date.now(),
            learningRate: LEARNING_RATE_BASE,
            streak: 0,
            totalCorrection: 0
        };
    },

    /**
     * Sauvegarde l'état RL
     */
    saveRLState: (drawName: string, state: RLState) => {
        localStorage.setItem(`rl_state_${drawName}`, JSON.stringify(state));
    },

    /**
     * Calcule les nouveaux poids basés sur la performance réelle (Forensic Report).
     * Si un algo a bien performé (impact positif dans le rapport), son poids est augmenté.
     */
    adjustWeights: (
        currentWeights: AlgoWeights, 
        report: ForensicReport, 
        drawName: string
    ): { newWeights: AlgoWeights; adjustmentMeta: any } => {
        
        const state = ReinforcementLearningService.getRLState(drawName);
        const newWeights = { ...currentWeights };
        const meta: string[] = [];
        
        // 1. Analyse de la divergence
        // Le rapport contient "scoreDivergence" qui indique quels algos auraient dû être écoutés
        // Ex: { algo: 'spectral', impact: 80 } signifie que le spectral avait raison à 80%
        
        if (!report.scoreDivergence || report.scoreDivergence.length === 0) {
            return { newWeights, adjustmentMeta: { logs: ["Pas de données de divergence suffisantes."] } };
        }

        let totalCorrection = 0;

        report.scoreDivergence.forEach(divergence => {
            const key = divergence.algo.toLowerCase() as keyof AlgoWeights;
            const currentWeight = newWeights[key] || 0;
            
            // Calcul du gradient : Différence entre l'impact idéal (divergence) et le poids actuel
            // Si impact = 80 (0.8) et poids actuel = 0.2, on doit augmenter
            const targetWeight = divergence.impact / 100;
            const delta = targetWeight - currentWeight;
            
            // Application du Learning Rate
            const adjustment = delta * state.learningRate;
            
            if (Math.abs(adjustment) > 0.01) {
                newWeights[key] = Math.max(0.01, Math.min(0.9, currentWeight + adjustment));
                meta.push(`${key.toUpperCase()}: ${currentWeight.toFixed(2)} -> ${newWeights[key]?.toFixed(2)} (Δ ${(adjustment*100).toFixed(1)}%)`);
                totalCorrection += Math.abs(adjustment);
            }
        });

        // Mise à jour de l'état RL
        const hits = report.matches.filter(m => m.errorType === 'Hit').length;
        if (hits >= 3) {
            state.streak++;
            // En cas de succès, on réduit le taux d'apprentissage (Exploitation)
            state.learningRate = Math.max(0.01, state.learningRate * DECAY);
        } else {
            state.streak = 0;
            // En cas d'échec, on augmente le taux d'apprentissage (Exploration)
            state.learningRate = Math.min(0.3, state.learningRate * 1.1);
        }
        
        state.totalCorrection += totalCorrection;
        state.lastCalibration = Date.now();
        ReinforcementLearningService.saveRLState(drawName, state);

        return {
            newWeights: normalizeWeights(newWeights),
            adjustmentMeta: {
                logs: meta,
                learningRate: state.learningRate,
                streak: state.streak
            }
        };
    }
};
