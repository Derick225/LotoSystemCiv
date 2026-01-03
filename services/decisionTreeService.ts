
import type { DrawResult, ForestVote, DecisionNode } from '../types';

export const FEATURES_LABELS = [
    'Critical Gap', 'Frequency', 'Shadow', 
    'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

// Conversion des features booléens en vecteur numérique pour le worker
const extractNumericFeatures = (num: number, results: DrawResult[], globalConsensusMap: Record<number, number>, activeIndices: number[]): number[] => {
    if (results.length < 5) return new Array(activeIndices.length).fill(0);
    const recent20 = results.slice(0, 20);
    const lastDraw = results[0];
    const freq20 = recent20.filter(r => r.gagnants.includes(num)).length;
    const consensus = globalConsensusMap[num] || 0;
    
    let gap = 0;
    for(let i=0; i<results.length; i++) {
        if(results[i].gagnants.includes(num)) { gap = i; break; }
    }
    
    // Vecteur complet brut
    const allFeatures = [
        (gap >= 8 && gap <= 18) ? 1 : 0, // Critical Gap
        freq20 >= 3 ? 1 : 0,             // Hot
        (consensus < 40 && freq20 >= 2) ? 1 : 0, // Shadow
        consensus > 85 ? 1 : 0,          // Consensus Trap
        (lastDraw?.gagnants.includes(num - 1) || lastDraw?.gagnants.includes(num + 1)) ? 1 : 0, // Neighbor
        (lastDraw?.machine?.includes(num)) ? 1 : 0, // Machine Leak
        gap / 50 // Normalized Gap
    ];

    // Filtrage dynamique selon la sélection utilisateur
    return activeIndices.map(idx => allFeatures[idx]);
};

export const runDecisionForest = async (history: DrawResult[], shadowMode: boolean = false, activeFeatures: string[] = FEATURES_LABELS): Promise<ForestVote[]> => {
    if (!history || history.length < 40) return [];

    const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
    if (activeIndices.length === 0) return [];

    const consensusMap: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
        const freq = history.slice(0, 50).filter(r => r.gagnants.includes(i)).length;
        consensusMap[i] = (freq / 5) * 100;
    }

    const dataset: { features: number[], label: 0 | 1 }[] = [];
    history.slice(0, 60).forEach((target, idx) => {
        const context = history.slice(idx + 1);
        if (context.length >= 25) {
            target.gagnants.forEach(n => dataset.push({ 
                features: extractNumericFeatures(n, context, consensusMap, activeIndices), 
                label: 1 
            }));
            for(let i=0; i<6; i++) {
                const rnd = Math.floor(Math.random()*90)+1;
                if(!target.gagnants.includes(rnd)) {
                    dataset.push({ 
                        features: extractNumericFeatures(rnd, context, consensusMap, activeIndices), 
                        label: 0 
                    });
                }
            }
        }
    });

    const candidates = Array.from({ length: 90 }, (_, i) => ({
        number: i + 1,
        features: extractNumericFeatures(i + 1, history, consensusMap, activeIndices)
    }));

    (window as any).__nexus_forest_dataset = { dataset, activeFeatures };

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/forest.worker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
            const { votes } = e.data;
            worker.terminate();
            
            const finalVotes: ForestVote[] = votes.map((v: any) => ({
                candidate: v.number,
                score: Math.round(v.score),
                votes: { temporal: 0, spatial: 0, structural: 0 },
                decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
                features: { isConsensusTrap: v.score > 80 && shadowMode }
            }));

            const filtered = shadowMode 
                ? finalVotes.filter(v => v.score > 40 && v.score < 80)
                : finalVotes.filter(v => v.score > 50);

            resolve(filtered.slice(0, 20));
        };

        worker.postMessage({ 
            dataset, 
            candidates, 
            config: { numTrees: 100, maxDepth: 6 } 
        });
    });
};

export const calculateFeatureImportance = (_node: any): Record<string, number> => {
    const dataObj = (window as any).__nexus_forest_dataset;
    if (!dataObj || !dataObj.dataset || dataObj.dataset.length === 0) return {};

    const { dataset, activeFeatures } = dataObj;
    const importance: Record<string, number> = {};
    const n = dataset.length;
    const meanY = dataset.reduce((acc: number, d: any) => acc + d.label, 0) / n;

    activeFeatures.forEach((label: string, idx: number) => {
        const meanX = dataset.reduce((acc: number, d: any) => acc + d.features[idx], 0) / n;
        let num = 0, denX = 0, denY = 0;

        dataset.forEach((d: any) => {
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
