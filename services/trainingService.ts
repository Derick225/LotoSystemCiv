
import { fetchResults } from './lotteryService';
import { generateMasterPrediction, saveAlgoWeights, getAlgoWeights, getAdaptiveRules, saveAdaptiveRules } from './predictionEngine';
import { runGeneticOptimization } from './geneticOptimizer';
import { detectGameRegime } from './mathService';
import { isSupabaseConfigured } from './supabaseClient';
import type { AlgoWeights, TrainingReport, TrainingResult, DrawResult } from '../types';

// Calcul des métriques de classification (Precision, Recall, F1)
const calculateClassMetrics = (hits: number[], totalPredictions: number) => {
    const tp = hits.filter(h => h > 0).length;
    const fp = totalPredictions - tp;
    // Estimation simplifiée pour le contexte loto (où les TN sont massifs)
    const precision = tp / (tp + fp || 1);
    const recall = tp / 5; // Rappel par rapport au tirage idéal (5 numéros)
    const f1 = 2 * (precision * recall) / (precision + recall || 1);
    return { precision, recall, f1 };
};

export const runBacktestTraining = async (
    drawName: string, 
    history: DrawResult[],
    requestedSampleSize: number = 30,
    onProgress?: (progress: number) => void,
    customWeights?: AlgoWeights
): Promise<TrainingReport> => {
    let allResults = history;
    if (!allResults || allResults.length === 0) {
        const { data } = await fetchResults(drawName);
        allResults = data;
    }

    if (allResults.length < 25) throw new Error("Historique insuffisant (min 25 requis).");
    
    const regime = detectGameRegime(allResults);
    const actualSampleSize = Math.min(requestedSampleSize, allResults.length - 15);

    const trainingResults: TrainingResult[] = [];
    const distribution = { zero: 0, one: 0, two: 0, three: 0, four: 0, five: 0 };
    let totalHitsAcc = 0;
    let atLeastOneHitCount = 0;
    const hitCountsArray: number[] = [];
    
    const weightsToUse = customWeights || await getAlgoWeights(drawName);
    
    // Cross-Validation (K-Fold simplifié : Sliding Window)
    // On divise l'échantillon en 3 plis pour valider la robustesse
    const kFolds = 3;
    const foldSize = Math.floor(actualSampleSize / kFolds);
    let foldScores: number[] = [];

    for (let k = 0; k < kFolds; k++) {
        let foldHits = 0;
        const startIdx = k * foldSize;
        const endIdx = startIdx + foldSize;
        
        for (let i = endIdx - 1; i >= startIdx; i--) {
            // Index réel dans l'historique (en remontant le temps)
            const realIdx = i; 
            const targetDraw = allResults[realIdx];
            const historyAtThatTime = allResults.slice(realIdx + 1); 
            
            // skipTraining = true pour éviter de réentraîner le LSTM à chaque itération du backtest
            const prediction = await generateMasterPrediction(drawName, historyAtThatTime, weightsToUse, undefined, undefined, 'BALANCED', true);
            const predicted = prediction.suggestedNumbers;
            const actual = targetDraw.gagnants;
            const hits = predicted.filter(n => actual.includes(n));
            const hitCount = hits.length;
            
            hitCountsArray.push(hitCount);
            totalHitsAcc += hitCount;
            foldHits += hitCount;
            if (hitCount > 0) atLeastOneHitCount++;
            
            if (hitCount === 0) distribution.zero++;
            else if (hitCount === 1) distribution.one++;
            else if (hitCount === 2) distribution.two++;
            else if (hitCount === 3) distribution.three++;
            else if (hitCount === 4) distribution.four++;
            else if (hitCount >= 5) distribution.five++;

            trainingResults.unshift({
                date: targetDraw.date,
                drawName,
                predictedNumbers: predicted,
                actualWinningNumbers: actual,
                hits,
                hitCount,
                isJackpot: hitCount === 5,
                confidence: prediction.confidence,
                breakdown: prediction.breakdown
            });

            // Update Progress global
            const currentStep = (k * foldSize) + (endIdx - 1 - i);
            if (onProgress) onProgress(Math.round((currentStep / actualSampleSize) * 100));
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        
        // Score du pli (Moyenne des hits)
        foldScores.push(foldHits / foldSize);
    }

    const totalTests = trainingResults.length;
    const avg = totalTests > 0 ? totalHitsAcc / totalTests : 0;
    
    // Stabilité via l'écart-type des scores K-Fold
    const foldMean = foldScores.reduce((a, b) => a + b, 0) / kFolds;
    const variance = foldScores.reduce((acc, val) => acc + Math.pow(val - foldMean, 2), 0) / kFolds;
    const stabilityScore = 1 / (1 + Math.sqrt(variance)); // 1 = Parfaitement stable, 0 = Instable

    // Métriques avancées F1
    const metrics = calculateClassMetrics(hitCountsArray, totalTests);
    
    // Score pondéré : récompense lourdement les hits > 3 et la stabilité
    // Score de base (Performance) * Stabilité
    const rawScore = (distribution.two * 10 + distribution.three * 60 + distribution.four * 250 + distribution.five * 1500) / totalTests * 2;
    const score = Math.min(100, Math.round(rawScore * (0.8 + (stabilityScore * 0.2))));

    return {
        totalTests,
        totalHits: totalHitsAcc,
        averageHits: parseFloat(avg.toFixed(2)),
        successRate: totalTests > 0 ? Math.round((atLeastOneHitCount / totalTests) * 100) : 0,
        stabilityScore: parseFloat(stabilityScore.toFixed(2)),
        stabilityLabel: stabilityScore > 0.8 ? 'Rocher (Stable)' : stabilityScore > 0.5 ? 'Fluide' : 'Chaos (Instable)',
        winDistribution: distribution,
        history: trainingResults,
        score,
        learnedPatternsSummary: { f1: metrics.f1.toFixed(3), precision: metrics.precision.toFixed(3) }, 
        regimeInfo: { regime: regime.regime, hurst: regime.hurst }
    };
};

export const evolveNeuralDNA = async (
    drawName: string, 
    options: { generations: number; sampleSize: number } = { generations: 20, sampleSize: 30 },
    onTelemetry: (data: { gen: number, bestFitness: number, avgFitness: number, diversity: number, bestGenome: AlgoWeights, source?: string }) => void
): Promise<{ bestWeights: AlgoWeights, improvement: number, report: TrainingReport }> => {
    
    const currentWeights = await getAlgoWeights(drawName);
    const currentRules = getAdaptiveRules(drawName);
    const { data: fullHistory } = await fetchResults(drawName);

    // Rapport initial (Baseline) avec Cross-Validation
    const oldReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, currentWeights);
    
    let bestWeights: AlgoWeights = currentWeights;
    let bestRules: any = currentRules;

    // Lancement de l'optimiseur génétique local
    const optimization = await runGeneticOptimization(
        drawName, 
        currentWeights, 
        currentRules,
        { 
            maxGenerations: options.generations, 
            historyDepth: options.sampleSize,
            // Mutation rate adaptatif géré dans le worker, on passe une base
            mutationRate: 0.25 
        },
        onTelemetry
    );
    if (optimization.bestChromosome) {
        bestWeights = optimization.bestChromosome.weights;
        bestRules = optimization.bestChromosome.rules;
    }

    // Validation finale du meilleur candidat
    const newReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, bestWeights);
    
    // Calcul de l'amélioration (Delta Score + Delta Stabilité)
    const improvement = parseFloat((newReport.score - oldReport.score).toFixed(2));

    return {
        bestWeights,
        improvement,
        report: newReport
    };
};
