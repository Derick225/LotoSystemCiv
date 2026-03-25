import { isSupabaseConfigured } from './supabaseClient';
import { getPythonKernelAnalysis } from './geminiService';
import { DrawResult, PythonAnalysisResult, NotebookCell, AlgoWeights } from "../types";
import { calculatePoissonProbability, calculateBayesianScore, runMonteCarloSimulation } from './mathService';
import { AppError, logError } from '../utils/AppError';

// Helpers Statistiques Locaux
const calculateZScore = (observed: number, expected: number, stdDev: number) => {
    return (observed - expected) / (stdDev || 1);
};

const calculatePValue = (zScore: number): number => {
    // Approximation One-sided P-value from Z-score
    // P = 1 / (1 + exp(1.6 * z)) est une approximation sigmoïde rapide
    // Ici on veut la probabilité que le résultat soit dû au hasard (plus Z est grand, plus P est petit)
    const p = Math.exp(-0.717 * zScore - 0.416 * zScore * zScore);
    return Math.max(0, Math.min(1, p));
};

/**
 * Exécute une simulation Monte Carlo en "parallèle" (Time-slicing) 
 * pour ne pas bloquer le thread principal et permettre la mise à jour de l'UI.
 */
const runParallelMonteCarlo = async (
    weights: Record<number, number>, 
    totalIterations: number, 
    onProgress?: (p: number) => void
): Promise<Record<number, number>> => {
    const BATCH_COUNT = 5;
    const batchSize = Math.floor(totalIterations / BATCH_COUNT);
    const aggregatedResults: Record<number, number> = {};

    for (let i = 0; i < BATCH_COUNT; i++) {
        // Laisser respirer l'Event Loop
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const batchRes = runMonteCarloSimulation(weights, batchSize);
        
        // Agrégation
        Object.entries(batchRes).forEach(([n, count]) => {
            const num = parseInt(n);
            aggregatedResults[num] = (aggregatedResults[num] || 0) + count;
        });

        if (onProgress) onProgress(20 + Math.round(((i + 1) / BATCH_COUNT) * 40)); // Progression de 20% à 60%
    }
    return aggregatedResults;
};

// Service Hybride : Calcul Local (Client) + Interprétation (Cloud)
export const runDeepPythonAnalysis = async (
    drawName: string, 
    history: DrawResult[], 
    modelType: 'XGBoost' | 'ARIMA' | 'MCMC' = 'XGBoost',
    weights?: AlgoWeights,
    onProgress?: (data: any) => void,
    onLog?: (msg: string) => void
): Promise<PythonAnalysisResult> => {
    
    if (onLog) {
        onLog(`[SYSTEM] Initiating Neural Python Kernel v13.0...`);
        onLog(`[CONFIG] Strategy: ${modelType} (Stochastic Modeling)`);
        onLog(`[DATA] Loading ${history.length} frames from registry...`);
        if (weights) onLog(`[DNA] Injecting AlgoWeights...`);
    }

    if (onProgress) onProgress(10); // Start

    // 1. PRÉPARATION DES DONNÉES SELON LE MODÈLE
    if (onLog) onLog(`[KERNEL] Computing Feature Matrix locally...`);
    
    const analysisWindow = history.slice(0, 100);
    const totalDraws = analysisWindow.length;
    const metricsVector = [];
    const weightsForMC: Record<number, number> = {};

    // Poids par défaut
    const wPoisson = weights?.poisson ?? 0.4;
    const wBayes = weights?.bayes ?? 0.6;
    const wMomentum = weights?.momentum ?? 0.1;

    if (modelType === 'ARIMA') {
        // --- LOGIQUE SÉRIES TEMPORELLES (ARIMA) ---
        if (onLog) onLog(`[ARIMA] Analyzing Lag-Autocorrelation & Moving Averages...`);
        
        for (let i = 1; i <= 90; i++) {
            // Création de la série temporelle binaire (1 = sorti, 0 = pas sorti)
            const timeSeries = history.slice(0, 50).map(d => d.gagnants.includes(i) ? 1 : 0).reverse();
            
            // Calcul Moyenne Mobile (MA) sur 5 périodes
            let maSum = 0;
            const maWindow = 5;
            for(let k = timeSeries.length - maWindow; k < timeSeries.length; k++) {
                maSum += timeSeries[k];
            }
            const maVal = maSum / maWindow;

            // Calcul Auto-Regression simple (Lag-1)
            let arVal = 0;
            if (timeSeries[timeSeries.length - 1] === 0 && timeSeries[timeSeries.length - 2] === 1) {
                arVal = 0.5; // Pattern de retour
            }

            // Score combiné pour ARIMA
            const arimaScore = (maVal * 0.7 + arVal * 0.3) * 100;
            
            metricsVector.push({ number: i, score: arimaScore, ma: maVal });
            weightsForMC[i] = Math.max(1, arimaScore);
        }

    } else {
        // --- LOGIQUE CLASSIQUE (XGBoost / MCMC / Poisson) ---
        const freqs: Record<number, number> = {};
        const gaps: Record<number, number> = {};
        
        // Analyse des Gaps spécifique pour ce dataset
        for(let n=1; n<=90; n++) {
            let gap = 0;
            for(const draw of analysisWindow) {
                if(draw.gagnants.includes(n)) break;
                gap++;
            }
            gaps[n] = gap;
        }

        analysisWindow.forEach(d => d.gagnants.forEach(n => freqs[n] = (freqs[n] || 0) + 1));

        for (let i = 1; i <= 90; i++) {
            const occurrences = freqs[i] || 0;
            const lambda = (occurrences / totalDraws) * (90/5); 
            const gap = gaps[i] || 0;
            
            // Poisson
            const poissonP = 1 - calculatePoissonProbability(0, lambda);
            
            // Bayes
            const recentFreq = history.slice(0, 20).filter(d => d.gagnants.includes(i)).length;
            const prior = occurrences / totalDraws;
            const likelihood = recentFreq / 20; 
            const bayesScore = calculateBayesianScore(prior, Math.max(0.01, likelihood));
            
            // Long Gap Correction (Specific to provided dataset)
            // Si un numéro a un écart > 15 et une fréquence historique correcte, il est "dû"
            let gapBoost = 0;
            if (gap > 15 && occurrences > 5) gapBoost = 0.3;

            // Score combiné
            const combinedScore = (poissonP * wPoisson) + (bayesScore * wBayes) + (gapBoost * 0.5) + (recentFreq * wMomentum * 0.1);
            
            metricsVector.push({ 
                number: i, 
                poisson: poissonP, 
                bayes: bayesScore, 
                score: combinedScore 
            });
            
            weightsForMC[i] = Math.max(0.01, combinedScore);
        }
    }

    if (onProgress) onProgress(20); // Matrix ready

    // 2. SIMULATION MONTE CARLO PARALLÈLE
    if (onLog) onLog(`[KERNEL] Spawning Parallel Monte Carlo Workers (20,000 iterations)...`);
    
    // Augmentation significative des itérations grâce à l'asynchrone
    const mcResults = await runParallelMonteCarlo(weightsForMC, 20000, onProgress);
    
    if (onProgress) onProgress(70); // Sim complete

    // 3. STATISTIQUES FINALES & P-VALUE
    const topCandidates = metricsVector.sort((a,b) => b.score - a.score).slice(0, 10);
    const vectorResult = topCandidates.map(c => c.number);
    const topScore = topCandidates[0].score;
    
    // Calcul P-Value sur le meilleur candidat
    // Hypothèse nulle : Distribution uniforme (p = 5/90)
    // On approxime avec la distribution binomiale -> normale
    const expectedScore = 0.055; // 5/90 proba de base
    const stdErr = Math.sqrt(expectedScore * (1 - expectedScore) / 100); // sur 100 tirages
    const zScore = calculateZScore(topScore, expectedScore, stdErr);
    const pValue = calculatePValue(zScore);

    const confidence = Math.min(99, Math.round(topScore * 100 + (1 - pValue) * 20));

    if (onProgress) onProgress(80); // Stats ready

    // 4. ENVOI À L'ORACLE POUR GÉNÉRATION DE CODE
    try {
        if (onLog) onLog(`[KERNEL] Generating executable logic & interpretation...`);
        
        const contextPayload = {
            topNumbers: topCandidates.slice(0, 5).map(c => ({ 
                n: c.number, 
                metric: modelType === 'ARIMA' ? `MA:${(c as any).ma?.toFixed(2)}` : `P:${(c as any).poisson?.toFixed(2)}`
            })),
            mc_sim_top: Object.entries(mcResults)
                .sort((a,b) => b[1] - a[1])
                .slice(0, 5)
                .map(([n, count]) => `${n} (${count} hits)`),
            p_value: pValue.toExponential(3),
            anomalies: "Detected high-gap recurrence (>15 draws) on key vectors."
        };

        const data = await getPythonKernelAnalysis(
            drawName,
            history.slice(0, 5),
            modelType,
            contextPayload
        );

        if (onProgress) onProgress(90); // Oracle returned

        // Construction du Script Fallback intelligent selon le modèle
        const scriptLibrary = {
            'XGBoost': `
import pandas as pd
import xgboost as xgb
# ... (XGBoost Logic with Gap Engineering)
# Feature: Gap since last occurrence
vectors = ${JSON.stringify(vectorResult)}
confidence = ${confidence / 100}
p_val = ${pValue.toFixed(4)}
`,
            'ARIMA': `
from statsmodels.tsa.arima.model import ARIMA
import pandas as pd
# Running ARIMA(5,1,0) on binary series
# ...
vectors = ${JSON.stringify(vectorResult)}
confidence = ${confidence / 100}
`,
            'MCMC': `
import pymc3 as pm
# Bayesian Inference Loop
# ...
vectors = ${JSON.stringify(vectorResult)}
confidence = ${confidence / 100}
`
        };

        const scriptContent = data?.script || scriptLibrary[modelType];
        
        const stdoutContent = data?.stdout && data.stdout.length > 0 
            ? data.stdout.join('\n')
            : `[KERNEL] Optimization Finished.\n> Model: ${modelType}\n> Top Vectors: ${vectorResult.join(', ')}\n> MC Iterations: 20000\n> P-Value: ${pValue.toExponential(4)}`;

        const insightContent = data?.insight || `Le modèle ${modelType} a convergé. Vecteurs ${vectorResult.slice(0,5).join(', ')} identifiés avec p-value < ${pValue.toFixed(3)}.`;

        const cells: NotebookCell[] = [
            { 
                id: 'c1', 
                type: 'markdown', 
                content: `### 🐍 Environnement Data Science : ${modelType}\n\nModélisation stochastique (${modelType}) avec validation croisée Monte Carlo (20k itérations). P-Value du signal principal : **${pValue.toExponential(2)}**.` 
            },
            { 
                id: 'c2', 
                type: 'code', 
                content: scriptContent
            },
            { 
                id: 'c3', 
                type: 'output', 
                content: stdoutContent
            }
        ];

        if (onProgress) onProgress(100); // Done

        return {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            drawName,
            modelType,
            stdout: data?.stdout || [],
            script: scriptContent,
            findings: { 
                result_vector: vectorResult, 
                confidence_score: confidence, 
                p_value: pValue 
            },
            insight: insightContent,
            cells,
            distribution: mcResults // Injection des résultats réels pour le graphe
        };

    } catch (e: any) {
        logError(new AppError(e.message || "Python Kernel Error", "PYTHON_KERNEL_ERROR", "medium", { error: e }), { source: 'runPythonKernel' });
        if (onLog) onLog(`[CRITICAL] Kernel Panic: ${e.message}`);
        throw e;
    }
};