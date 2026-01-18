
import { AlgoWeights, DrawResult, Prediction, RLState } from '../types';
import { saveAlgoWeights, normalizeWeights } from './predictionEngine';

const LEARNING_RATE_BASE = 0.05; 
const MOMENTUM = 0.9; 

const getInitialState = (): RLState => ({
    lastCalibration: Date.now(),
    learningRate: LEARNING_RATE_BASE,
    streak: 0,
    totalCorrection: 0
});

export const ReinforcementLearningService = {
    processDrawResult: async (
        drawName: string,
        lastDraw: DrawResult,
        lastPrediction: Prediction,
        currentWeights: AlgoWeights
    ): Promise<{ newWeights: AlgoWeights; state: RLState; log: string }> => {
        
        let state = getRLState(drawName);
        let log = "";
        
        const hits = lastPrediction.suggestedNumbers.filter(n => lastDraw.gagnants.includes(n)).length;
        const candidateHits = lastPrediction.candidates.filter(n => lastDraw.gagnants.includes(n)).length;
        
        if (hits >= 2) {
            state.streak = Math.max(0, state.streak + 1);
            state.learningRate = Math.max(0.01, state.learningRate * 0.9);
            log = `Signal validé (${hits} hits). Stabilisation de l'ADN.`;
        } else {
            state.streak = Math.min(0, state.streak - 1);
            state.learningRate = Math.min(0.2, state.learningRate * 1.2);
            log = `Décalage détecté. Accélération de l'ajustement (LR: ${state.learningRate.toFixed(3)}).`;
        }

        const gradients: Partial<AlgoWeights> = {};
        const breakdown = lastPrediction.breakdown || {};

        lastDraw.gagnants.forEach(winningNum => {
            const scores = breakdown[winningNum];
            if (scores) {
                Object.entries(scores).forEach(([algoKey, scoreVal]) => {
                    if (typeof scoreVal === 'number' && scoreVal > 60) {
                        const k = algoKey as keyof AlgoWeights;
                        gradients[k] = (gradients[k] || 0) + (scoreVal / 100); 
                    }
                });
            }
        });

        const newWeights: AlgoWeights = { ...currentWeights };
        let totalChange = 0;

        Object.keys(newWeights).forEach((k) => {
            const key = k as keyof AlgoWeights;
            const grad = gradients[key] || 0;
            const current = newWeights[key] || 0;
            
            let delta = 0;
            if (grad > 0) {
                delta = state.learningRate * grad;
            } else {
                delta = - (state.learningRate * 0.1); 
            }

            const newVal = Math.max(0.01, current + delta);
            totalChange += Math.abs(newVal - current);
            newWeights[key] = newVal;
        });

        const normalizedWeights = normalizeWeights(newWeights);
        
        state.totalCorrection += totalChange;
        state.lastCalibration = Date.now();
        saveRLState(drawName, state);
        await saveAlgoWeights(drawName, normalizedWeights);

        log += ` Mutation Sigma : ${(totalChange * 100).toFixed(2)}%.`;

        return { newWeights: normalizedWeights, state, log };
    }
};

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
