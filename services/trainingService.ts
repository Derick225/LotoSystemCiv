
import { fetchResults } from './lotteryService';
import { generateMasterPrediction, saveAlgoWeights, getAlgoWeights, getAdaptiveRules, saveAdaptiveRules } from './predictionEngine';
import { runGeneticOptimization } from './geneticOptimizer';
import { detectGameRegime } from './mathService';
import type { AlgoWeights, TrainingReport, TrainingResult, DrawResult } from '../types';

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

    if (allResults.length < 25) throw new Error("Historique insuffisant pour l'entraînement (min 25 requis).");
    
    const regime = detectGameRegime(allResults);
    const actualSampleSize = Math.min(requestedSampleSize, allResults.length - 15);

    const trainingResults: TrainingResult[] = [];
    const distribution = { zero: 0, one: 0, two: 0, three: 0, four: 0, five: 0 };
    let totalHitsAcc = 0;
    let atLeastOneHitCount = 0;
    const hitCountsArray: number[] = [];
    
    const weightsToUse = customWeights || getAlgoWeights(drawName);
    
    for (let i = actualSampleSize - 1; i >= 0; i--) {
        const targetDraw = allResults[i];
        const historyAtThatTime = allResults.slice(i + 1); 
        
        const prediction = await generateMasterPrediction(drawName, historyAtThatTime, weightsToUse);
        const predicted = prediction.suggestedNumbers;
        const actual = targetDraw.gagnants;
        const hits = predicted.filter(n => actual.includes(n));
        const hitCount = hits.length;
        
        hitCountsArray.push(hitCount);
        totalHitsAcc += hitCount;
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

        if (onProgress) onProgress(Math.round(((actualSampleSize - i) / actualSampleSize) * 100));
        if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const totalTests = trainingResults.length;
    const avg = totalTests > 0 ? totalHitsAcc / totalTests : 0;
    const variance = hitCountsArray.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / totalTests;
    const stabilityScore = Math.sqrt(variance);

    return {
        totalTests,
        totalHits: totalHitsAcc,
        averageHits: parseFloat(avg.toFixed(2)),
        successRate: totalTests > 0 ? Math.round((atLeastOneHitCount / totalTests) * 100) : 0,
        stabilityScore: parseFloat(stabilityScore.toFixed(2)),
        stabilityLabel: stabilityScore < 0.7 ? 'Rocher' : stabilityScore > 1.8 ? 'Chaos' : 'Stable',
        winDistribution: distribution,
        history: trainingResults,
        score: Math.min(100, Math.round((distribution.two * 30 + distribution.three * 150 + distribution.four * 800 + distribution.five * 5000) / totalTests)),
        learnedPatternsSummary: {}, 
        regimeInfo: { regime: regime.regime, hurst: regime.hurst }
    };
};

export const evolveNeuralDNA = async (
    drawName: string, 
    options: { generations: number; sampleSize: number } = { generations: 20, sampleSize: 30 },
    onTelemetry: (data: any) => void
): Promise<{ bestWeights: AlgoWeights, improvement: number, report: TrainingReport }> => {
    
    const currentWeights = getAlgoWeights(drawName);
    const currentRules = getAdaptiveRules(drawName);
    
    const { data: fullHistory } = await fetchResults(drawName);

    const oldReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, currentWeights);
    
    const optimization = await runGeneticOptimization(
        drawName, 
        currentWeights, 
        currentRules,
        { 
            maxGenerations: options.generations, 
            historyDepth: options.sampleSize,
            mutationRate: 0.35
        },
        onTelemetry
    );

    const bestWeights = optimization.bestChromosome.weights;
    const bestRules = optimization.bestChromosome.rules;

    const newReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, bestWeights);
    
    if (newReport.score > oldReport.score) {
        saveAlgoWeights(drawName, bestWeights);
        saveAdaptiveRules(drawName, bestRules);
    }

    return {
        bestWeights,
        improvement: parseFloat((newReport.score - oldReport.score).toFixed(2)),
        report: newReport
    };
};
