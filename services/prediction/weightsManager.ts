import { AlgoWeights, RiskProfile, DrawResult } from '../../types';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { getLocalForensicReports } from '../postPredictionAnalysisService';

export const getDefaultWeights = (): AlgoWeights => ({ ...DEFAULT_ALGO_WEIGHTS });

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    let total = 0;
    const cleanWeights: Partial<AlgoWeights> = {};

    (Object.keys(weights) as Array<AlgoKey>).forEach(key => {
        let val = weights[key];
        if (typeof val !== 'number' || isNaN(val) || val < 0) val = 0;
        val = Math.min(1.0, val);
        cleanWeights[key] = val;
        total += val;
    });

    if (total <= 0.0001) return getDefaultWeights();

    (Object.keys(cleanWeights) as Array<AlgoKey>).forEach(key => {
        const val = cleanWeights[key] || 0;
        cleanWeights[key] = parseFloat((val / total).toFixed(4));
    });
    
    return cleanWeights as AlgoWeights;
};

export const applyRiskProfile = (weights: AlgoWeights, profile: RiskProfile): AlgoWeights => {
    const modified = { ...weights };
    
    switch (profile) {
        case 'PRUDENT':
            modified[AlgoKey.FREQUENCY] = (modified[AlgoKey.FREQUENCY] || 0.20) * 1.8;
            modified[AlgoKey.MARKOV] = (modified[AlgoKey.MARKOV] || 0.20) * 1.5;
            modified[AlgoKey.GAPS] = (modified[AlgoKey.GAPS] || 0.15) * 0.3; 
            break;

        case 'BALANCED': 
            modified[AlgoKey.FREQUENCY] = (modified[AlgoKey.FREQUENCY] || 0.20) * 1.1;
            modified[AlgoKey.GAPS] = (modified[AlgoKey.GAPS] || 0.15) * 1.1;
            break;

        case 'AUDACIOUS': 
            modified[AlgoKey.GAPS] = (modified[AlgoKey.GAPS] || 0.15) * 2.5;
            modified[AlgoKey.FREQUENCY] = (modified[AlgoKey.FREQUENCY] || 0.20) * 0.4;
            break;

        case 'CHAOS': 
            modified[AlgoKey.FREQUENCY] = 0;
            modified[AlgoKey.MARKOV] = 0;
            break;
    }
    
    return normalizeWeights(modified);
};

export const adjustWeightsForRegime = (weights: AlgoWeights, regimeInfo?: { regime: string, hurst: number }): AlgoWeights => {
    if (!regimeInfo) return weights;

    const { hurst } = regimeInfo;
    const adjusted = { ...weights };
    
    if (hurst > 0.6) {
        adjusted[AlgoKey.FREQUENCY] = (adjusted[AlgoKey.FREQUENCY] || 0) * 1.4;
        adjusted[AlgoKey.MARKOV] = (adjusted[AlgoKey.MARKOV] || 0) * 1.4;
    } else if (hurst < 0.4) {
        adjusted[AlgoKey.GAPS] = (adjusted[AlgoKey.GAPS] || 0) * 1.6;
        adjusted[AlgoKey.FREQUENCY] = (adjusted[AlgoKey.FREQUENCY] || 0) * 0.6;
    } else {
        // Random regime
    }

    return normalizeWeights(adjusted);
};

export const applyMetaLearning = (weights: AlgoWeights, history: DrawResult[]): AlgoWeights => {
    const dynamicWeights = { ...weights };
    const learningRate = 0.15; // Soft updates

    try {
        const forensicReports = getLocalForensicReports();
        // Ne prendre que les rapports récents (max 10) pour s'adapter au contexte immédiat
        const recentReports = forensicReports.slice(0, 10);
        
        if (recentReports.length > 0) {
            recentReports.forEach(report => {
                if (report.counterfactuals && report.counterfactuals.length > 0) {
                    report.counterfactuals.forEach(cf => {
                        // Impact direct du Counterfactual d'Autopsie
                        const algo = cf.algo as AlgoKey;
                        const w = dynamicWeights[algo];
                        if (w !== undefined) {
                            if (cf.action === 'BOOST' || cf.action === 'ISOLATE') {
                                dynamicWeights[algo] = w * (1 + learningRate * (cf.rankImprovement / 10)); 
                            } else if (cf.action === 'REDUCE') {
                                dynamicWeights[algo] = w * (1 - learningRate * (cf.rankImprovement / 10));
                            }
                        }
                    });
                }
            });
            return normalizeWeights(dynamicWeights);
        }
    } catch (e) {
        console.warn("Erreur Meta-Learning, utilisation du fallback classique.", e);
    }

    // Fallback: Si pas de rapport forensic, on fait la vérification grossière
    if (history.length < 20) return weights;
    
    const recentDraws = history.slice(0, 5);
    const evaluationHistory = history.slice(5, 55); 
    
    let freqScore = 0;
    let gapScore = 0;
    
    const freqMap = new Map<number, number>();
    const gapsMap = new Map<number, number>();
    
    evaluationHistory.forEach((d, idx) => {
        d.gagnants.forEach(n => {
            freqMap.set(n, (freqMap.get(n) || 0) + 1);
            if (!gapsMap.has(n)) gapsMap.set(n, idx);
        });
    });
    
    recentDraws.forEach(draw => {
        draw.gagnants.forEach(n => {
            const freq = freqMap.get(n) || 0;
            if (freq > 4) freqScore += 1; 
            
            const gap = gapsMap.get(n) || 50;
            if (gap > 12) gapScore += 1; 
        });
    });
    
    const baseLearningRate = 0.25; 
    
    if (freqScore > gapScore * 1.5) {
        dynamicWeights[AlgoKey.FREQUENCY] = (dynamicWeights[AlgoKey.FREQUENCY] || 0) * (1 + baseLearningRate);
        dynamicWeights[AlgoKey.GAPS] = (dynamicWeights[AlgoKey.GAPS] || 0) * (1 - baseLearningRate * 0.5);
    } else if (gapScore > freqScore * 1.5) {
        dynamicWeights[AlgoKey.GAPS] = (dynamicWeights[AlgoKey.GAPS] || 0) * (1 + baseLearningRate);
        dynamicWeights[AlgoKey.FREQUENCY] = (dynamicWeights[AlgoKey.FREQUENCY] || 0) * (1 - baseLearningRate * 0.5);
    }
    
    return normalizeWeights(dynamicWeights);
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data?.weights) return data.weights;
        } catch (e) { }
    }
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    return raw ? JSON.parse(raw).weights : getDefaultWeights();
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    try {
        localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify({ weights, updatedAt: new Date().toISOString() }));
        if (isSupabaseConfigured()) {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights }); 
        }
    } catch (e) {}
};
