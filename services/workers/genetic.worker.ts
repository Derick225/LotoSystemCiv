
export {};

/**
 * Darwin Genetic Worker v4.1 (Entropy-Regularized Edition)
 * Optimisé pour la synthèse stochastique ROBUSTE avec régularisation par entropie.
 */

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }

// Fix: Explicit typing for self
const ctx = self as unknown as Worker;

const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
    const keys = Object.keys(w);
    const total = Object.values(w).reduce<number>((acc, val) => acc + (val ?? 0), 0);
    const normalized: AlgoWeights = { ...w };
    if (total <= 0) return w; 
    keys.forEach(k => {
        const val = normalized[k];
        if (typeof val === 'number') {
            normalized[k] = parseFloat((val / total).toFixed(4));
        }
    });
    return normalized;
};

// Fonction utilitaire pour calculer l'entropie d'un ensemble de prédictions
const calculatePredictionEntropy = (predictions: number[]): number => {
    const freq: Record<number, number> = {};
    predictions.forEach(n => freq[n] = (freq[n] || 0) + 1);
    let entropy = 0;
    const total = predictions.length;
    Object.values(freq).forEach(c => {
        const p = c / total;
        entropy -= p * Math.log2(p);
    });
    return entropy;
};

/**
 * Fitness Multi-Objectif : Sharpe Ratio + Entropy Penalty
 * Punit les stratégies qui prédisent toujours les mêmes numéros (faible entropie).
 */
const evaluate = (w: AlgoWeights, r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
    const limit = Math.min(history.length - 1, depth);
    const cMin = r.criticalZoneMin || 12;
    const cMax = r.criticalZoneMax || 18;
    
    const returns: number[] = []; 
    const allPredictedNumbers: number[] = [];

    for (let i = 0; i < limit; i++) {
        const target = history[i]; 
        const past = history.slice(i + 1);
        if (past.length < 10) break;

        let drawScore = 0;
        
        // Simulation rapide de prédiction pour collecter les numéros "choisis" par ces poids
        // On ne fait pas un calcul complet coûteux, mais une approximation
        const candidates = [];
        
        // On évalue chaque gagnant réel pour voir si les poids l'auraient favorisé
        target.gagnants.forEach(n => {
            // 1. Fréquence
            const freq = past.slice(0, 25).filter(d => d.gagnants.includes(n)).length;
            let score = freq * (w.frequency || 0.05) * 4;
            
            // 2. Résonance
            let gap = 50;
            for(let j=0; j<25; j++) { if(past[j]?.gagnants.includes(n)) { gap = j; break; } }
            if (gap >= cMin && gap <= cMax) score += 15 * (w.temporal || 0.05);

            // 3. Poisson (Nouveau)
            const lambda = (freq / 25) * (90/5);
            const poissonP = (Math.exp(-lambda) * Math.pow(lambda, gap)); // Approx
            score += poissonP * (w.poisson || 0.05) * 100;

            drawScore += score;
            
            // Pour l'entropie, on triche un peu en considérant que si le score est haut, 
            // le numéro aurait été prédit.
            if (score > 1.5) allPredictedNumbers.push(n);
        });

        returns.push(drawScore);
    }

    if (returns.length === 0) return 0;

    // Calcul Sharpe Ratio
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, val) => acc + Math.pow(val - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = avgReturn / (stdDev + 1); 

    // Pénalité d'Entropie (Regularization)
    // On veut que l'algo explore une variété de numéros, pas qu'il sur-apprenne sur quelques uns
    const entropy = calculatePredictionEntropy(allPredictedNumbers);
    const entropyBonus = entropy * 0.1; // Petit bonus pour la diversité

    return (sharpeRatio + entropyBonus) * 1000;
};

const mutateGaussian = (w: AlgoWeights, rate: number): AlgoWeights => {
    const mutated = { ...w };
    Object.keys(mutated).forEach(k => {
        if (Math.random() < rate) {
            const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 0.3;
            const currentVal = mutated[k] || 0;
            mutated[k] = Math.max(0.001, Math.min(1, currentVal + noise));
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

const mutateRules = (r: AdaptiveRules, rate: number): AdaptiveRules => {
    const mutated = { ...r };
    if (Math.random() < rate) {
        mutated.criticalZoneMin = Math.max(5, Math.min(25, r.criticalZoneMin + (Math.random() > 0.5 ? 1 : -1)));
        mutated.criticalZoneMax = Math.max(mutated.criticalZoneMin + 2, Math.min(45, r.criticalZoneMax + (Math.random() > 0.5 ? 1 : -1)));
    }
    return mutated;
};

ctx.onmessage = (e) => {
    if (e.data.type === 'start') {
        const { baseWeights, baseRules, config, history } = e.data.payload;
        
        let population = Array.from({ length: config.populationSize }, (_, i) => ({
            weights: i === 0 ? baseWeights : mutateGaussian(baseWeights, 0.9),
            rules: i === 0 ? baseRules : mutateRules(baseRules, 0.9),
            fitness: 0
        }));

        for (let gen = 0; gen < config.maxGenerations; gen++) {
            population.forEach(ind => {
                ind.fitness = evaluate(ind.weights, ind.rules, history, config.historyDepth);
            });

            population.sort((a, b) => b.fitness - a.fitness);

            ctx.postMessage({ 
                type: 'progress', 
                data: { 
                    gen: gen + 1, 
                    bestFitness: Math.round(population[0].fitness * 10) / 10,
                    diversity: new Set(population.map(p => (p.weights.frequency || 0).toFixed(2))).size / config.populationSize
                } 
            });

            const eliteCount = Math.max(2, Math.floor(config.populationSize * 0.15));
            const nextGen = population.slice(0, eliteCount);

            while (nextGen.length < config.populationSize) {
                const parent1 = population[Math.floor(Math.random() * eliteCount)];
                const parent2 = population[Math.floor(Math.random() * (config.populationSize / 2))];
                
                let childWeights = crossover(parent1.weights, parent2.weights);
                
                if (Math.random() < config.mutationRate) {
                    childWeights = mutateGaussian(childWeights, 0.4);
                }

                nextGen.push({
                    weights: childWeights,
                    rules: mutateRules(parent1.rules, config.mutationRate),
                    fitness: 0
                });
            }
            population = nextGen;
        }

        ctx.postMessage({
            type: 'result',
            data: { bestChromosome: population[0] }
        });
    }
};
