
import { AlgoWeights, DrawResult, Prediction, RLState } from '../types';
import { saveAlgoWeights, normalizeWeights } from './predictionEngine';

const LEARNING_RATE_BASE = 0.05; // Vitesse d'apprentissage par défaut
const MOMENTUM = 0.9; // Facteur de persistance

// Initialisation de l'état RL local
const getInitialState = (): RLState => ({
    lastCalibration: Date.now(),
    learningRate: LEARNING_RATE_BASE,
    streak: 0,
    totalCorrection: 0
});

export const ReinforcementLearningService = {
    /**
     * Analyse le dernier résultat par rapport à la prédiction et ajuste les poids
     */
    processDrawResult: async (
        drawName: string,
        lastDraw: DrawResult,
        lastPrediction: Prediction,
        currentWeights: AlgoWeights
    ): Promise<{ newWeights: AlgoWeights; state: RLState; log: string }> => {
        
        let state = getRLState(drawName);
        let log = "";
        
        // 1. Calcul du Reward (Récompense)
        // Combien de numéros gagnants étaient dans les suggestions ou candidats ?
        const hits = lastPrediction.suggestedNumbers.filter(n => lastDraw.gagnants.includes(n)).length;
        const candidateHits = lastPrediction.candidates.filter(n => lastDraw.gagnants.includes(n)).length;
        
        // Reward function: High for direct hits, small for candidates
        const reward = (hits * 20) + (candidateHits * 5); 
        
        // Mise à jour du Streak (Dynamique d'apprentissage)
        if (hits >= 2) {
            state.streak = Math.max(0, state.streak + 1);
            // Si on gagne souvent, on réduit le learning rate (on stabilise)
            state.learningRate = Math.max(0.01, state.learningRate * 0.9);
            log = `Succès (${hits} hits). Stabilisation.`;
        } else {
            state.streak = Math.min(0, state.streak - 1);
            // Si on perd, on augmente le learning rate (on cherche une solution)
            state.learningRate = Math.min(0.2, state.learningRate * 1.2);
            log = `Échec. Accélération apprentissage (LR: ${state.learningRate.toFixed(3)}).`;
        }

        // 2. Rétropropagation (Backpropagation of Error)
        // On regarde pour chaque numéro gagnant QUEL algo l'avait bien prédit (dans le breakdown)
        const gradients: Partial<AlgoWeights> = {};
        const breakdown = lastPrediction.breakdown || {};

        lastDraw.gagnants.forEach(winningNum => {
            const scores = breakdown[winningNum];
            if (scores) {
                // On identifie les algos qui avaient un score > 60 pour ce numéro gagnant
                Object.entries(scores).forEach(([algoKey, scoreVal]) => {
                    if (typeof scoreVal === 'number' && scoreVal > 60) {
                        const k = algoKey as keyof AlgoWeights;
                        // Gradient positif : Cet algo avait raison !
                        gradients[k] = (gradients[k] || 0) + (scoreVal / 100); 
                    }
                });
            }
        });

        // 3. Application du Gradient (Weight Update)
        // W_new = W_old + (LearningRate * Gradient)
        const newWeights: AlgoWeights = { ...currentWeights };
        let totalChange = 0;

        Object.keys(newWeights).forEach((k) => {
            const key = k as keyof AlgoWeights;
            const grad = gradients[key] || 0;
            const current = newWeights[key] || 0;
            
            // Si l'algo a aidé, on augmente. Sinon, on diminue légèrement (Decay)
            let delta = 0;
            if (grad > 0) {
                delta = state.learningRate * grad;
            } else {
                // Pénalité légère pour les algos muets sur ce tirage
                delta = - (state.learningRate * 0.1); 
            }

            // Application avec Momentum (lissage)
            const newVal = Math.max(0.01, current + delta);
            totalChange += Math.abs(newVal - current);
            newWeights[key] = newVal;
        });

        // Normalisation finale pour garder la somme cohérente
        const normalizedWeights = normalizeWeights(newWeights);
        
        // Sauvegarde
        state.totalCorrection += totalChange;
        state.lastCalibration = Date.now();
        saveRLState(drawName, state);
        await saveAlgoWeights(drawName, normalizedWeights);

        log += ` Calibration terminée (Impact: ${(totalChange * 100).toFixed(2)}%).`;

        return { newWeights: normalizedWeights, state, log };
    }
};

// --- PERSISTENCE LOCALE DU STATE RL ---
const getRLState = (drawName: string): RLState => {
    try {
        const raw = localStorage.getItem(`rl_state_${drawName}`);
        return raw ? JSON.parse(raw) : getInitialState();
    } catch {
        return getInitialState();
    }
};

const saveRLState = (drawName: string, state: RLState) => {
    localStorage.setItem(`rl_state_${drawName}`, JSON.stringify(state));
};
