
import { fetchResults } from './lotteryService';
import { generateMasterPrediction, saveAlgoWeights, getAlgoWeights, getAdaptiveRules, saveAdaptiveRules } from './predictionEngine';
import { runGeneticOptimization } from './geneticOptimizer';
import { detectGameRegime } from './mathService';
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
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

    if (allResults.length < 25) throw new Error("Historique insuffisant (min 25 requis).");
    
    const regime = detectGameRegime(allResults);
    const actualSampleSize = Math.min(requestedSampleSize, allResults.length - 15);

    const trainingResults: TrainingResult[] = [];
    const distribution = { zero: 0, one: 0, two: 0, three: 0, four: 0, five: 0 };
    let totalHitsAcc = 0;
    let atLeastOneHitCount = 0;
    const hitCountsArray: number[] = [];
    
    const weightsToUse = customWeights || await getAlgoWeights(drawName);
    
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
    const variance = hitCountsArray.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / (totalTests || 1);
    const stabilityScore = Math.sqrt(variance);
    const score = Math.min(100, Math.round((distribution.two * 10 + distribution.three * 50 + distribution.four * 200 + distribution.five * 1000) / totalTests * 2));

    return {
        totalTests,
        totalHits: totalHitsAcc,
        averageHits: parseFloat(avg.toFixed(2)),
        successRate: totalTests > 0 ? Math.round((atLeastOneHitCount / totalTests) * 100) : 0,
        stabilityScore: parseFloat(stabilityScore.toFixed(2)),
        stabilityLabel: stabilityScore < 0.7 ? 'Rocher' : stabilityScore > 1.8 ? 'Chaos' : 'Stable',
        winDistribution: distribution,
        history: trainingResults,
        score,
        learnedPatternsSummary: {}, 
        regimeInfo: { regime: regime.regime, hurst: regime.hurst }
    };
};

export const evolveNeuralDNA = async (
    drawName: string, 
    options: { generations: number; sampleSize: number } = { generations: 20, sampleSize: 30 },
    onTelemetry: (data: any) => void
): Promise<{ bestWeights: AlgoWeights, improvement: number, report: TrainingReport }> => {
    
    const currentWeights = await getAlgoWeights(drawName);
    const currentRules = getAdaptiveRules(drawName);
    const { data: fullHistory } = await fetchResults(drawName);

    const oldReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, currentWeights);
    
    let bestWeights: AlgoWeights = currentWeights;
    let bestRules: any = currentRules;
    let optimizationSource = 'LOCAL';

    if (isSupabaseConfigured()) {
        try {
            console.log("Starting Cloud Genetic Optimization...");
            const { data, error } = await invokeEdgeFunction('genetic-optimizer', {
                body: {
                    drawName,
                    baseWeights: currentWeights,
                    config: {
                        generations: options.generations,
                        populationSize: 30
                    }
                }
            });

            if (!error && data?.bestWeights) {
                bestWeights = data.bestWeights;
                optimizationSource = 'CLOUD';
                onTelemetry({ gen: options.generations, bestFitness: data.bestFitness, diversity: 0.1, source: 'CLOUD' });
            } else {
                throw new Error(error?.message || "Cloud optimize returned no data");
            }
        } catch (e) {
            console.warn("Cloud Optimization failed, falling back to local Worker.", e);
            optimizationSource = 'LOCAL';
        }
    }

    if (optimizationSource === 'LOCAL') {
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
        bestWeights = optimization.bestChromosome.weights;
        bestRules = optimization.bestChromosome.rules;
    }

    const newReport = await runBacktestTraining(drawName, fullHistory, options.sampleSize, undefined, bestWeights);
    const improvement = parseFloat((newReport.score - oldReport.score).toFixed(2));

    if (improvement >= -1) {
        await saveAlgoWeights(drawName, bestWeights);
        if (optimizationSource === 'LOCAL') {
            saveAdaptiveRules(drawName, bestRules);
        }
    } else {
        console.warn(`Evolution rejetée : Score ${newReport.score} vs ${oldReport.score}`);
        return {
            bestWeights: currentWeights,
            improvement,
            report: oldReport
        };
    }

    return {
        bestWeights,
        improvement,
        report: newReport
    };
};
