
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown } from '../types';
import { generateMasterPrediction, getAlgoWeights } from './predictionEngine';
import { analyzeDrawLogic } from './geminiService';

export interface EnsembleAgent {
    id: string;
    name: string;
    description: string;
    prediction: Prediction;
    weight: number;
}

export interface EnsembleResult {
    agents: EnsembleAgent[];
    consensus: number[];
    confidence: number;
    metaAnalysis: string;
}

export const runNeuralEnsemble = async (
    drawName: string, 
    history: DrawResult[],
    metrics: any
): Promise<EnsembleResult> => {
    // 1. Get base weights
    const baseWeights = await getAlgoWeights(drawName);
    
    // 2. Define specialized agents (different weight profiles)
    const agentProfiles: { name: string, description: string, weights: Partial<AlgoWeights> }[] = [
        { 
            name: "Agent Fréquentiel", 
            description: "Focus sur la récurrence statistique et la loi des grands nombres.",
            weights: { frequency: 0.8, poisson: 0.4, markov: 0.2 } 
        },
        { 
            name: "Agent Gap/Maturité", 
            description: "Analyse les retards et la probabilité de sortie par épuisement.",
            weights: { gap: 0.8, gap_velocity: 0.5, resistance: 0.3 } 
        },
        { 
            name: "Agent Spectral", 
            description: "Analyse fréquentielle du signal et résonances harmoniques.",
            weights: { spectral: 0.8, wavelet: 0.5, fractal: 0.3 } 
        },
        { 
            name: "Agent Neural (LSTM)", 
            description: "Réseau de neurones récurrents détectant les dépendances temporelles.",
            weights: { lstm: 0.8, transformer: 0.4, ai_intuition: 0.3 } 
        },
        { 
            name: "Agent Chaotique", 
            description: "Détecte les ruptures de symétrie et l'anti-consensus.",
            weights: { anti_consensus: 0.8, isolation_anomaly: 0.5, quantum_entanglement: 0.4 } 
        }
    ];

    // 3. Generate predictions for each agent
    const agents: EnsembleAgent[] = await Promise.all(agentProfiles.map(async (profile, idx) => {
        const agentWeights = { ...baseWeights, ...profile.weights };
        const prediction = await generateMasterPrediction(drawName, history, agentWeights, metrics);
        return {
            id: `agent-${idx}`,
            name: profile.name,
            description: profile.description,
            prediction,
            weight: 1 / agentProfiles.length // Initial equal weight
        };
    }));

    // 4. Consensus Calculation (Weighted Voting)
    const consensusScores = new Float64Array(91);
    agents.forEach(agent => {
        agent.prediction.suggestedNumbers.forEach(num => {
            consensusScores[num] += agent.weight * agent.prediction.confidence;
        });
        agent.prediction.candidates.forEach(num => {
            consensusScores[num] += agent.weight * agent.prediction.confidence * 0.5;
        });
    });

    const consensus = Array.from({ length: 90 }, (_, i) => i + 1)
        .sort((a, b) => consensusScores[b] - consensusScores[a])
        .slice(0, 5)
        .sort((a, b) => a - b);

    // 5. Meta-Analysis via Gemini
    const aiAnalysis = await analyzeDrawLogic(drawName, history, metrics);

    return {
        agents,
        consensus,
        confidence: Math.round(agents.reduce((acc, a) => acc + a.prediction.confidence, 0) / agents.length),
        metaAnalysis: aiAnalysis.logicalAnalysis
    };
};

export interface BacktestResult {
    drawDate: string;
    actualNumbers: number[];
    predictedNumbers: number[];
    hits: number;
}

export const backtestNeuralEnsemble = async (
    drawName: string,
    history: DrawResult[],
    metrics: any,
    iterations: number = 5,
    onProgress?: (current: number, total: number) => void
): Promise<BacktestResult[]> => {
    const results: BacktestResult[] = [];
    
    // We take the last 'iterations' draws and try to predict them using previous history
    for (let i = 0; i < iterations; i++) {
        const testDraw = history[i];
        const trainingHistory = history.slice(i + 1);
        
        if (trainingHistory.length < 10) break;

        // Simplified ensemble for backtest (to save time/API calls)
        const ensemble = await runNeuralEnsemble(drawName, trainingHistory, metrics);
        const hits = ensemble.consensus.filter(n => testDraw.gagnants.includes(n)).length;

        results.push({
            drawDate: testDraw.date,
            actualNumbers: testDraw.gagnants,
            predictedNumbers: ensemble.consensus,
            hits
        });
        
        if (onProgress) {
            onProgress(i + 1, iterations);
        }
    }

    return results;
};
