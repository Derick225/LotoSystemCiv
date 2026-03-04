
import { DrawResult, AlgoWeights, ScoreBreakdown } from '../types';
import { generateMasterPrediction, getDefaultWeights, normalizeWeights } from './predictionEngine';
import { calculateHistoricalPerformance } from './predictionHistoryService';

export interface TuningResult {
    optimizedWeights: AlgoWeights;
    performance: {
        accuracy: number;
        roi: number;
        totalHits: number;
    };
    iterations: number;
    improvement: number;
}

// Genetic Algorithm Constants
const POPULATION_SIZE = 20;
const GENERATIONS = 10;
const MUTATION_RATE = 0.2;
const ELITISM_COUNT = 2;

/**
 * Runs a massive backtest to optimize algorithm weights.
 * Uses a Genetic Algorithm to evolve the best weight configuration.
 */
export const runMassiveCalibration = async (
    drawName: string,
    history: DrawResult[],
    onProgress?: (progress: number, bestRoi: number) => void
): Promise<TuningResult> => {
    
    // 1. Prepare Data (Split Train/Test or use Rolling Window)
    // For this calibration, we use the last 200 draws for validation to be faster
    const validationSet = history.slice(0, 200); 
    const baseWeights = getDefaultWeights();
    
    // 2. Initialize Population
    let population: AlgoWeights[] = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        population.push(mutateWeights(baseWeights, 0.5)); // High mutation for initial diversity
    }

    let bestWeights = { ...baseWeights };
    let bestPerformance = await evaluateWeights(drawName, validationSet, baseWeights);
    const initialRoi = bestPerformance.roi;

    // 3. Evolution Loop
    for (let gen = 0; gen < GENERATIONS; gen++) {
        const scores: { weights: AlgoWeights; roi: number }[] = [];

        // Evaluate Population
        for (let i = 0; i < population.length; i++) {
            const perf = await evaluateWeights(drawName, validationSet, population[i]);
            scores.push({ weights: population[i], roi: perf.roi });
            
            // Update Global Best
            if (perf.roi > bestPerformance.roi) {
                bestPerformance = perf;
                bestWeights = { ...population[i] };
            }
        }

        // Sort by ROI Descending
        scores.sort((a, b) => b.roi - a.roi);

        // Report Progress
        if (onProgress) {
            const progress = ((gen + 1) / GENERATIONS) * 100;
            onProgress(progress, bestPerformance.roi);
        }

        // Selection & Crossover (Create Next Gen)
        const nextGen: AlgoWeights[] = [];
        
        // Elitism
        for (let i = 0; i < ELITISM_COUNT; i++) {
            nextGen.push(scores[i].weights);
        }

        // Fill rest
        while (nextGen.length < POPULATION_SIZE) {
            const parentA = selectParent(scores);
            const parentB = selectParent(scores);
            let child = crossover(parentA.weights, parentB.weights);
            if (Math.random() < MUTATION_RATE) {
                child = mutateWeights(child, 0.1); // Fine tuning mutation
            }
            nextGen.push(child);
        }
        
        population = nextGen;
    }

    return {
        optimizedWeights: bestWeights,
        performance: bestPerformance,
        iterations: POPULATION_SIZE * GENERATIONS,
        improvement: ((bestPerformance.roi - initialRoi) / (Math.abs(initialRoi) || 1)) * 100
    };
};

// --- HELPER FUNCTIONS ---

const evaluateWeights = async (drawName: string, history: DrawResult[], weights: AlgoWeights): Promise<{ accuracy: number; roi: number; totalHits: number }> => {
    let hits = 0;
    let totalPlayed = 0;
    const costPerGrid = 500; // FCFA estimation
    const win3 = 5000;
    const win4 = 50000;
    const win5 = 10000000;

    // We simulate predictions on the history
    // Note: generateMasterPrediction is heavy. For massive backtest, we might need a lighter version
    // or just use the raw scores without the full prediction engine overhead if possible.
    // For now, we simulate on a subset of history (every 5th draw) to save time
    
    const sampleStep = 5;
    for (let i = 0; i < history.length - 1; i += sampleStep) {
        const targetDraw = history[i];
        const context = history.slice(i + 1); // Past data relative to target
        
        if (context.length < 50) break;

        // We need a synchronous or fast prediction here. 
        // Calling the full async engine might be too slow for 200 draws * 20 pop * 10 gens = 40,000 predictions.
        // We will use a simplified linear combination of pre-calculated metrics if available, 
        // but since we don't have pre-calc metrics for all history easily accessible here without heavy computation,
        // we will limit the validation set size or use a simplified scoring.
        
        // SIMPLIFIED SCORING FOR BACKTEST (Approximation)
        // We assume we have access to basic metrics. 
        // In a real "Massive" tuner, we would pre-calculate all metrics for all draws ONCE, 
        // then just run the linear combination in the loop.
        
        // For this implementation, we will assume a smaller validation set (e.g. 20 draws) to make it feasible in browser.
        if (i > 100) break; // Limit to 20 samples (100 / 5)

        try {
             // We use the real engine but on a very small sample
             const prediction = await generateMasterPrediction(drawName, context, weights, undefined, undefined, 'BALANCED');
             
             const winners = targetDraw.gagnants;
             const predicted = prediction.suggestedNumbers;
             
             const matchCount = predicted.filter(n => winners.includes(n)).length;
             hits += matchCount;
             totalPlayed++;
        } catch (e) {
            console.warn("Backtest error", e);
        }
    }

    // Calculate ROI (Simplified)
    // This is a heuristic ROI based on match counts, not exact lottery rules
    const accuracy = totalPlayed > 0 ? (hits / (totalPlayed * 5)) * 100 : 0;
    const roi = accuracy * 10; // Dummy ROI calculation for optimization target

    return { accuracy, roi, totalHits: hits };
};

const mutateWeights = (weights: AlgoWeights, intensity: number): AlgoWeights => {
    const newWeights = { ...weights };
    const keys = Object.keys(newWeights) as Array<keyof AlgoWeights>;
    
    keys.forEach(key => {
        if (Math.random() < 0.3) { // 30% chance to mutate a gene
            let val = newWeights[key] || 0;
            const change = (Math.random() - 0.5) * intensity;
            val = Math.max(0, Math.min(1, val + change));
            newWeights[key] = val;
        }
    });
    
    return normalizeWeights(newWeights);
};

const crossover = (parentA: AlgoWeights, parentB: AlgoWeights): AlgoWeights => {
    const child = { ...parentA };
    const keys = Object.keys(child) as Array<keyof AlgoWeights>;
    
    keys.forEach(key => {
        // Uniform crossover
        child[key] = Math.random() < 0.5 ? (parentA[key] || 0) : (parentB[key] || 0);
    });
    
    return normalizeWeights(child);
};

const selectParent = (scores: { weights: AlgoWeights; roi: number }[]): { weights: AlgoWeights; roi: number } => {
    // Tournament selection
    const k = 3;
    let best = scores[Math.floor(Math.random() * scores.length)];
    for (let i = 0; i < k - 1; i++) {
        const contender = scores[Math.floor(Math.random() * scores.length)];
        if (contender.roi > best.roi) best = contender;
    }
    return best;
};
