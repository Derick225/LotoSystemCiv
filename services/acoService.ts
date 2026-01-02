
import { DrawResult, AntColonyPath, OracleVocalContext } from '../types';

/**
 * MOTEUR ACO (Interface Worker)
 * Délègue les calculs lourds de graphes au thread d'arrière-plan avec biais Oracle.
 */
export const runAntColonyOptimization = async (history: DrawResult[], vocalContext?: OracleVocalContext | null): Promise<AntColonyPath[]> => {
    if (history.length < 15) return [];

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/aco.worker.ts', import.meta.url), { type: 'module' });
        
        const timeout = setTimeout(() => {
            worker.terminate();
            resolve(fallbackHeuristic(history));
        }, 6000);

        worker.onmessage = (e) => {
            const { type, topPaths, error } = e.data;
            if (type === 'result') {
                clearTimeout(timeout);
                worker.terminate();
                const results = topPaths || [];
                if (results.length === 1) {
                    const best = results[0].numbers;
                    const variations = generateVariations(best, history, vocalContext);
                    resolve([results[0], ...variations]);
                } else {
                    resolve(results);
                }
            } else if (error) {
                clearTimeout(timeout);
                worker.terminate();
                resolve(fallbackHeuristic(history));
            }
        };

        worker.postMessage({ 
            history: history.map(h => ({ gagnants: h.gagnants })),
            config: { antsCount: 400, generations: 50 },
            vocalContext
        });
    });
};

const fallbackHeuristic = (history: DrawResult[]): AntColonyPath[] => {
    const freq: Record<number, number> = {};
    history.slice(0, 40).forEach(d => d.gagnants.forEach(n => freq[n] = (freq[n]||0)+1));
    const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 5).map(e => Number(e[0])).sort((a,b)=>a-b);
    return [{ numbers: top, pheromoneDensity: 0.5, confidence: 50 }];
};

const generateVariations = (base: number[], history: DrawResult[], vocalContext?: OracleVocalContext | null): AntColonyPath[] => {
    const variations: AntColonyPath[] = [];
    const oracleTargets = vocalContext?.targets || [];
    
    for(let i=0; i<4; i++) {
        const variant = [...base];
        const idxToChange = Math.floor(Math.random() * 5);
        
        let newVal: number;
        // Si l'Oracle a des cibles non incluses, on tente d'en insérer une
        const unusedOracle = oracleTargets.filter(t => !variant.includes(t));
        if (unusedOracle.length > 0 && Math.random() > 0.4) {
            newVal = unusedOracle[Math.floor(Math.random() * unusedOracle.length)];
        } else {
            newVal = (variant[idxToChange] + (Math.random() > 0.5 ? 1 : -1));
            if (newVal < 1) newVal = 90; if (newVal > 90) newVal = 1;
        }
        
        if (!variant.includes(newVal)) {
            variant[idxToChange] = newVal;
            variations.push({ 
                numbers: variant.sort((a,b)=>a-b), 
                pheromoneDensity: 0.85 - (i * 0.05), 
                confidence: 80 - (i * 5),
                isOracleBiased: oracleTargets.some(t => variant.includes(t))
            });
        }
    }
    return variations;
};
