
export {};

/**
 * Nexus Genetic Engine v5.1 (Production Sync)
 * Synchronisé avec services/predictionEngine.ts pour une optimisation réelle.
 */

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }

const ctx = self as unknown as Worker;

const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
    const keys = Object.keys(w);
    const total = Object.values(w).reduce<number>((acc, val) => acc + Math.abs(val ?? 0), 0);
    const normalized: AlgoWeights = { ...w };
    if (total <= 0) return w; 
    keys.forEach(k => {
        const val = normalized[k];
        if (typeof val === 'number') {
            normalized[k] = parseFloat((Math.abs(val) / total).toFixed(4));
        }
    });
    return normalized;
};

// Fitness function qui imite generateMasterPrediction (version allégée pour perf)
const evaluate = (w: AlgoWeights, _r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
    const limit = Math.min(history.length - 1, depth);
    let totalScore = 0;
    
    // Optimisation : Pré-calcul des fréquences globales une fois pour la fenêtre
    // Mais pour être précis, il faut recalculer pour chaque point de test (History sliding window)
    // Pour perf, on fait une approximation glissante simple.

    for (let i = 0; i < limit; i++) {
        const target = history[i].gagnants;
        const past = history.slice(i + 1); // Contexte connu à ce moment
        if (past.length < 20) break;

        const contextSize = Math.min(past.length, 50);
        const subPast = past.slice(0, contextSize);
        const candidates = new Map<number, number>();

        // 1. Fréquence
        const freqWeight = w.frequency || 0;
        const freqMap = new Map<number, number>();
        subPast.forEach(d => d.gagnants.forEach(n => freqMap.set(n, (freqMap.get(n) || 0) + 1)));

        if (freqWeight > 0) {
            const maxFreq = Math.max(...freqMap.values()) || 1;
            for(let n=1; n<=90; n++) {
                const score = ((freqMap.get(n)||0) / maxFreq) * 100;
                candidates.set(n, (candidates.get(n)||0) + (score * freqWeight));
            }
        }

        // 2. Markov (T-1)
        const markovWeight = w.markov || 0;
        if (markovWeight > 0) {
            const lastDraw = past[0].gagnants;
            const markovMap = new Map<number, number>();
            
            // Calcul transition simple
            for (let k = 0; k < contextSize - 1; k++) {
                const curr = past[k].gagnants;
                const prev = past[k+1].gagnants;
                if (prev.some(x => lastDraw.includes(x))) {
                     curr.forEach(n => markovMap.set(n, (markovMap.get(n)||0) + 1));
                }
            }
            const maxMark = Math.max(...markovMap.values()) || 1;
            markovMap.forEach((val, key) => {
                candidates.set(key, (candidates.get(key)||0) + ((val/maxMark)*100 * markovWeight));
            });
        }

        // 3. Gap
        const gapWeight = w.gap || 0;
        if (gapWeight > 0) {
            for(let n=1; n<=90; n++) {
                let gap = 0;
                for(let k=0; k<subPast.length; k++) {
                    if(subPast[k].gagnants.includes(n)) break;
                    gap++;
                }
                // Logique simplifiée de predictionEngine (Theoretical ~ 17)
                let score = 0;
                if(gap < 17) score = (gap/17)*50;
                else if(gap < 51) score = 50 + ((gap-17)/34)*50;
                else score = 90;
                
                candidates.set(n, (candidates.get(n)||0) + (score * gapWeight));
            }
        }

        // 4. Momentum (10 derniers)
        const momWeight = w.momentum || 0;
        if (momWeight > 0) {
            const momPast = past.slice(0, 10);
            const momMap = new Map<number, number>();
            momPast.forEach(d => d.gagnants.forEach(n => momMap.set(n, (momMap.get(n)||0)+1)));
            momMap.forEach((val, key) => {
                candidates.set(key, (candidates.get(key)||0) + (Math.min(100, val*25) * momWeight));
            });
        }

        // Extraction Top 5
        const top5 = Array.from(candidates.entries())
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(x => x[0]);
        
        const hits = top5.filter(n => target.includes(n)).length;
        
        // Système de récompense : on veut des hits > 0 réguliers, et > 2 occasionnellement
        if (hits === 1) totalScore += 1;
        if (hits === 2) totalScore += 5;
        if (hits === 3) totalScore += 20;
        if (hits === 4) totalScore += 100;
        if (hits === 5) totalScore += 1000;
    }

    return totalScore;
};

const mutateGaussian = (w: AlgoWeights, rate: number, intensity: number = 0.2): AlgoWeights => {
    const mutated = { ...w };
    Object.keys(mutated).forEach(k => {
        if (Math.random() < rate) {
            const noise = (Math.random() - 0.5) * intensity;
            const currentVal = mutated[k] || 0;
            mutated[k] = Math.max(0.001, currentVal + noise);
        }
    });
    return normalizeWeights(mutated);
};

const crossover = (p1: AlgoWeights, p2: AlgoWeights): AlgoWeights => {
    const child: AlgoWeights = {};
    Object.keys(p1).forEach(k => {
        child[k] = Math.random() > 0.5 ? p1[k] : p2[k];
    });
    return normalizeWeights(child);
};

// Distance pour diversité
const geneticDistance = (w1: AlgoWeights, w2: AlgoWeights): number => {
    let sumSq = 0;
    const keys = Object.keys(w1);
    keys.forEach(k => {
        sumSq += Math.pow((w1[k] || 0) - (w2[k] || 0), 2);
    });
    return Math.sqrt(sumSq);
};

ctx.onmessage = (e) => {
    if (e.data.type === 'start') {
        const { baseWeights, baseRules, config, history } = e.data.payload;
        
        const POPSIZE = config.populationSize || 40;
        const GENERATIONS = config.maxGenerations || 30;
        const MUTATION_RATE = config.mutationRate || 0.2;

        let population = Array.from({ length: POPSIZE }, (_, i) => ({
            weights: i === 0 ? baseWeights : mutateGaussian(baseWeights, 1.0, 0.5), 
            rules: baseRules,
            fitness: 0
        }));

        for (let gen = 0; gen < GENERATIONS; gen++) {
            population.forEach(ind => {
                ind.fitness = evaluate(ind.weights, ind.rules, history, config.historyDepth);
            });

            population.sort((a, b) => b.fitness - a.fitness);
            
            const bestFitness = population[0].fitness;
            const avgFitness = population.reduce((a,b) => a + b.fitness, 0) / POPSIZE;
            
            let totalDist = 0;
            for(let i=1; i<POPSIZE; i++) totalDist += geneticDistance(population[0].weights, population[i].weights);
            const diversity = totalDist / (POPSIZE - 1);

            ctx.postMessage({ 
                type: 'progress', 
                data: { gen: gen + 1, bestFitness, avgFitness, diversity, bestGenome: population[0].weights } 
            });

            const nextGen = [];
            const eliteCount = Math.max(2, Math.floor(POPSIZE * 0.1));
            for(let i=0; i<eliteCount; i++) nextGen.push(population[i]);

            while (nextGen.length < POPSIZE) {
                const p1 = population[Math.floor(Math.random() * (POPSIZE / 2))]; 
                const p2 = population[Math.floor(Math.random() * POPSIZE)]; 
                
                let childWeights = crossover(p1.weights, p2.weights);
                const dynRate = diversity < 0.1 ? MUTATION_RATE * 2 : MUTATION_RATE;
                const dynInt = diversity < 0.1 ? 0.3 : 0.1;
                
                if (Math.random() < 0.7) childWeights = mutateGaussian(childWeights, dynRate, dynInt);
                
                nextGen.push({ weights: childWeights, rules: baseRules, fitness: 0 });
            }
            population = nextGen;
        }

        ctx.postMessage({
            type: 'result',
            data: { bestChromosome: population[0] }
        });
    }
};
