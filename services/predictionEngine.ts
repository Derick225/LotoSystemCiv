export * from './prediction/weightsManager';
export * from './prediction/featureExtractor';
export * from './prediction/scoringEngine';
export * from './prediction/combinationGenerator';
export * from './prediction/predictionFacade';

import { calculateACValue } from './mathService';
import { TicketAnalysisResult, AlgoWeights, AdaptiveRules, ForensicReport } from '../types';
import { AlgoKey } from '../shared/prediction.types';
import { normalizeWeights } from './prediction/weightsManager';

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
