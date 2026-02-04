
import type { DrawResult, ForestVote, DecisionNode } from '../types';

export const FEATURES_LABELS = [
    'Critical Gap', 'Frequency', 'Shadow', 
    'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

const extractNumericFeatures = (num: number, results: DrawResult[], globalConsensusMap: Record<number, number>, activeIndices: number[]): number[] => {
    if (results.length < 5) return new Array(activeIndices.length).fill(0);
    const recent20 = results.slice(0, 20);
    const lastDraw = results[0];
    
    const checkIncludes = (arr: number[] | undefined, target: number) => {
        if (!arr) return false;
        return arr.includes(target);
    };

    // Fréquence amortie (Logistique/Racine)
    const rawFreq20 = recent20.filter(r => checkIncludes(r.gagnants, num)).length;
    const freqSignal = rawFreq20 >= 3 ? 1 : (rawFreq20 / 3); // Plafonné pour éviter le sur-poids
    
    const consensus = globalConsensusMap[num] || 0;
    
    let gap = 0;
    for(let i=0; i<results.length; i++) {
        if(checkIncludes(results[i].gagnants, num)) { gap = i; break; }
    }
    
    const allFeatures = [
        (gap >= 8 && gap <= 18) ? 1 : 0, 
        freqSignal,             
        (consensus < 40 && rawFreq20 >= 1) ? 1 : 0, 
        consensus > 85 ? 1 : 0,          
        (checkIncludes(lastDraw?.gagnants, num - 1) || checkIncludes(lastDraw?.gagnants, num + 1)) ? 1 : 0, 
        (checkIncludes(lastDraw?.machine, num)) ? 1 : 0, 
        Math.min(1, gap / 50) 
    ];

    return activeIndices.map(idx => allFeatures[idx]);
};

export const runDecisionForest = async (
    history: DrawResult[], 
    mode: 'consensus' | 'average' | 'shadow' = 'consensus', 
    activeFeatures: string[] = FEATURES_LABELS
): Promise<{ votes: ForestVote[], dataset: any[] }> => {
    if (!history || history.length < 40) return { votes: [], dataset: [] };

    const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
    if (activeIndices.length === 0) return { votes: [], dataset: [] };

    const consensusMap: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
        const freq = history.slice(0, 50).filter(r => r.gagnants.includes(i)).length;
        consensusMap[i] = (freq / 5) * 100;
    }

    const dataset: { features: number[], label: 0 | 1 }[] = [];
    history.slice(0, 50).forEach((target, idx) => {
        const context = history.slice(idx + 1);
        if (context.length < 25) return;

        const winners = target.gagnants;
        winners.forEach(n => dataset.push({ 
            features: extractNumericFeatures(n, context, consensusMap, activeIndices), 
            label: 1 
        }));

        let negativesCount = 0;
        while (negativesCount < winners.length) {
            const rnd = Math.floor(Math.random() * 90) + 1;
            if (!winners.includes(rnd)) {
                dataset.push({ 
                    features: extractNumericFeatures(rnd, context, consensusMap, activeIndices), 
                    label: 0 
                });
                negativesCount++;
            }
        }
    });

    const candidates = Array.from({ length: 90 }, (_, i) => ({
        number: i + 1,
        features: extractNumericFeatures(i + 1, history, consensusMap, activeIndices)
    }));

    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/forest.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
            const { votes } = e.data;
            worker.terminate();
            
            const finalVotes: ForestVote[] = votes.map((v: any) => ({
                candidate: v.number,
                score: Math.round(v.score),
                votes: { temporal: 0, spatial: 0, structural: 0 },
                decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
                features: { isConsensusTrap: v.score > 85 }
            }));

            let filtered: ForestVote[] = [];

            if (mode === 'consensus') {
                // Les numéros très probables (> 60%)
                filtered = finalVotes.filter(v => v.score >= 60);
            } else if (mode === 'average') {
                // Zone Moyenne / Équilibre (40% - 60%)
                // Ce sont les numéros "tièdes" souvent négligés mais statistiquement stables
                filtered = finalVotes.filter(v => v.score >= 40 && v.score < 60);
            } else {
                // Shadow / Dissidents (< 40% mais > 15%)
                // Les outsiders potentiels
                filtered = finalVotes.filter(v => v.score > 15 && v.score < 40);
            }
            
            resolve({ votes: filtered.sort((a, b) => b.score - a.score).slice(0, 20), dataset });
        };
        worker.onerror = (err) => { worker.terminate(); reject(err); };
        worker.postMessage({ dataset, candidates, config: { numTrees: 80, maxDepth: 6 } });
    });
};

export const calculateFeatureImportance = (dataset: any[], activeFeatures: string[]): Record<string, number> => {
    if (!dataset || dataset.length === 0) return {};
    const importance: Record<string, number> = {};
    const n = dataset.length;
    const meanY = dataset.reduce((acc, d) => acc + d.label, 0) / n;
    activeFeatures.forEach((label, idx) => {
        const meanX = dataset.reduce((acc, d) => acc + d.features[idx], 0) / n;
        let num = 0, denX = 0, denY = 0;
        dataset.forEach((d) => {
            const x = d.features[idx];
            const y = d.label;
            num += (x - meanX) * (y - meanY);
            denX += Math.pow(x - meanX, 2);
            denY += Math.pow(y - meanY, 2);
        });
        const correlation = denX > 0 && denY > 0 ? Math.abs(num / Math.sqrt(denX * denY)) : 0;
        importance[label] = Math.round(correlation * 100);
    });
    return importance;
};
