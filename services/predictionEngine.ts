export * from './prediction/weightsManager';
export * from './prediction/featureExtractor';
export * from './prediction/scoringEngine';
export * from './prediction/combinationGenerator';
export * from './prediction/predictionFacade';

import { calculateACValue } from './mathService';
import { TicketAnalysisResult, AlgoWeights, AdaptiveRules, ForensicReport, DrawResult } from '../types';
import { AlgoKey } from '../shared/prediction.types';
import { normalizeWeights } from './prediction/weightsManager';
import { workerService } from './workerService';
import { trainRidgeRegression } from './mathService';
import { logError, AppError } from '../utils/AppError';

export const getStrategyName = (weights: AlgoWeights): string => {
    const sorted = Object.entries(weights).sort((a,b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
    const topAlgo = sorted[0]?.[0] || 'Standard';
    
    const strategies: Record<string, string> = {
        [AlgoKey.FREQUENCY]: 'Tendance Pure',
        [AlgoKey.GAPS]: 'Chasseur d\'Écarts',
        [AlgoKey.MARKOV]: 'Chaîne Logique',
        [AlgoKey.AFFINITY]: 'Affinité',
        [AlgoKey.MACHINE]: 'Machine',
        [AlgoKey.STRUCTURAL]: 'Structurel',
        [AlgoKey.TREND]: 'Tendance'
    };
    
    return strategies[topAlgo] || `Hybride (${topAlgo})`;
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const warnings: string[] = [];
    
    if (ac < 7) warnings.push("Complexité Arithmétique faible.");
    if (sum < 120) warnings.push("Somme statistiquement basse.");
    if (sum > 330) warnings.push("Somme statistiquement haute.");
    
    let score = 100;
    if (ac < 7) score -= 20;
    if (ac < 5) score -= 30;
    if (sum < 120 || sum > 330) score -= 15;
    
    const odds = numbers.filter(n => n % 2 !== 0).length;
    if (odds === 0 || odds === 5) score -= 20; 
    
    return { score, verdict: score > 80 ? "Elite" : score > 60 ? "Solide" : "Fragile", warnings };
};

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...weights };
    const reasoning: string[] = [];
    
    const LEARNING_RATE = 0.05; 

    report.scoreDivergence.forEach(div => {
        const key = div.algo as AlgoKey;
        if (newWeights[key] !== undefined) {
            const impactFactor = div.impact / 100; 
            const boost = LEARNING_RATE * impactFactor; 
            
            const oldVal = Number(newWeights[key]) || 0;
            const newVal = oldVal + boost;
            
            newWeights[key] = parseFloat(newVal.toFixed(4));
            
            if (boost > 0.01) {
                reasoning.push(`Micro-ajustement ${div.algo} (+${(boost*100).toFixed(2)}%).`);
            }
        }
    });
    
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};

const calculateSimpleFeatures = (num: number, history: DrawResult[]): number[] => {
    const recent = history.slice(0, 10);
    const freq = recent.filter(d => d.gagnants.includes(num)).length;
    
    let gap = 0;
    for (let i = 0; i < Math.min(history.length, 50); i++) {
        if (history[i].gagnants.includes(num)) break;
        gap++;
    }
    
    let markov = 0;
    if (history.length > 1) {
        const lastDraw = history[0].gagnants;
        for (let i = 1; i < Math.min(history.length, 50) - 1; i++) {
            const prev = history[i+1].gagnants;
            const curr = history[i].gagnants;
            const common = prev.filter(n => lastDraw.includes(n));
            if (common.length > 0 && curr.includes(num)) {
                markov++;
            }
        }
    }
    
    return [freq, gap, markov];
};

export const runAutoLearn = async (drawName: string, fullHistory: DrawResult[]): Promise<{ success: boolean; message: string; newWeights?: AlgoWeights }> => {
    const LAST_RUN_KEY = `nexus_autolearn_last_${drawName}`;
    const lastRun = localStorage.getItem(LAST_RUN_KEY);
    const now = Date.now();
    
    if (lastRun && (now - Number(lastRun)) < 86400000) {
        return { success: false, message: "Auto-Learn déjà exécuté aujourd'hui." };
    }
    
    if (fullHistory.length < 60) {
        return { success: false, message: "Historique insuffisant pour Auto-Learn (>60 requis)." };
    }
    
    const trainingFeatures: number[][] = [];
    const trainingLabels: number[] = [];
    
    const TRAINING_WINDOW = 50;
    
    for (let i = 0; i < TRAINING_WINDOW; i++) {
        const targetDraw = fullHistory[i];
        const historyContext = fullHistory.slice(i + 1); 
        
        targetDraw.gagnants.forEach(num => {
            trainingFeatures.push(calculateSimpleFeatures(num, historyContext));
            trainingLabels.push(1);
        });
        
        let losersCount = 0;
        while (losersCount < 5) {
            const rnd = Math.floor(Math.random() * 90) + 1;
            if (!targetDraw.gagnants.includes(rnd)) {
                trainingFeatures.push(calculateSimpleFeatures(rnd, historyContext));
                trainingLabels.push(0);
                losersCount++;
            }
        }
    }
    
    try {
        let learnedWeights: number[];
        if (workerService.isAvailable()) {
            learnedWeights = await workerService.runTask<number[]>('TRAIN_RIDGE', { features: trainingFeatures, labels: trainingLabels, lambda: 0.1 });
        } else {
            learnedWeights = trainRidgeRegression(trainingFeatures, trainingLabels, 0.1);
        }
        
        const { getAlgoWeights, saveAlgoWeights } = await import('./prediction/weightsManager');
        const currentWeights = await getAlgoWeights(drawName);
        const newWeights = { ...currentWeights };
        
        const wFreq = Math.abs(learnedWeights[0] || 0);
        const wGap = Math.abs(learnedWeights[1] || 0);
        const wMarkov = Math.abs(learnedWeights[2] || 0);
        
        const ALPHA = 0.3;
        newWeights[AlgoKey.FREQUENCY] = (newWeights[AlgoKey.FREQUENCY] || 0) * (1 - ALPHA) + wFreq * ALPHA;
        newWeights[AlgoKey.GAPS] = (newWeights[AlgoKey.GAPS] || 0) * (1 - ALPHA) + wGap * ALPHA;
        newWeights[AlgoKey.MARKOV] = (newWeights[AlgoKey.MARKOV] || 0) * (1 - ALPHA) + wMarkov * ALPHA;
        
        const normalized = normalizeWeights(newWeights);
        await saveAlgoWeights(drawName, normalized);
        
        localStorage.setItem(LAST_RUN_KEY, now.toString());
        
        return { 
            success: true, 
            message: `Auto-Learn terminé. Poids ajustés : Freq ${(wFreq*100).toFixed(0)}%, Gap ${(wGap*100).toFixed(0)}%, Markov ${(wMarkov*100).toFixed(0)}%.`,
            newWeights: normalized
        };
        
    } catch (e: any) {
        logError(new AppError(e.message || "Auto-Learn Error", "AUTO_LEARN_ERROR", "medium", { error: e }), { source: 'triggerAutoLearn' });
        return { success: false, message: "Erreur lors de l'apprentissage." };
    }
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 28
});

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    try {
        const raw = localStorage.getItem(`nexus_rules_${drawName}`);
        return raw ? JSON.parse(raw) : getDefaultRules();
    } catch { return getDefaultRules(); }
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    try { localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules)); } catch {}
};
