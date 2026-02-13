
export {};

/**
 * Nexus Genetic Engine v6.0 (Adaptive & Robust)
 * Optimisation génétique avec gestion de la diversité, mutation adaptative et early stopping.
 */

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }
interface Individual { weights: AlgoWeights; fitness: number; }

const ctx = self as unknown as Worker;

// --- UTILS ---

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

// Box-Muller transform for Gaussian distribution
const randomGaussian = (mean: number = 0, stdev: number = 1): number => {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return z * stdev + mean;
};

const euclideanDistance = (w1: AlgoWeights, w2: AlgoWeights): number => {
    const keys = Array.from(new Set([...Object.keys(w1), ...Object.keys(w2)]));
    let sumSq = 0;
    keys.forEach(k => {
        const v1 = w1[k] || 0;
        const v2 = w2[k] || 0;
        sumSq += Math.pow(v1 - v2, 2);
    });
    return Math.sqrt(sumSq);
};

const calculateDiversity = (population: Individual[]): number => {
    if (population.length < 2) return 0;
    // Distance moyenne par rapport au meilleur individu (centroïde approximatif)
    const best = population[0].weights;
    let totalDist = 0;
    for (let i = 1; i < population.length; i++) {
        totalDist += euclideanDistance(best, population[i].weights);
    }
    return totalDist / (population.length - 1);
};

// --- GENETIC OPERATORS ---

// Crossover Uniforme : Chaque gène a 50% de chance de venir de P1 ou P2
const uniformCrossover = (p1: AlgoWeights, p2: AlgoWeights): AlgoWeights => {
    const child: AlgoWeights = {};
    const keys = Array.from(new Set([...Object.keys(p1), ...Object.keys(p2)]));
    
    keys.forEach(k => {
        child[k] = Math.random() > 0.5 ? (p1[k] || 0) : (p2[k] || 0);
    });
    return normalizeWeights(child);
};

// Mutation Gaussienne Adaptative
const mutateGaussian = (w: AlgoWeights, sigma: number, rate: number): AlgoWeights => {
    const mutant = { ...w };
    const keys = Object.keys(mutant);
    
    keys.forEach(k => {
        if (Math.random() < rate) {
            // Mutation : valeur actuelle + bruit gaussien centré sur 0
            const noise = randomGaussian(0, sigma);
            const currentVal = mutant[k] || 0;
            // On clamp entre 0.001 et 1.0 pour éviter les poids nuls ou négatifs
            mutant[k] = Math.max(0.001, Math.min(1.0, currentVal + noise));
        }
    });
    return normalizeWeights(mutant);
};

// --- FITNESS FUNCTION ---

const evaluate = (w: AlgoWeights, _r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
    const limit = Math.min(history.length - 1, depth);
    let totalScore = 0;
    
    // Pré-calcul pour optimisation
    const freqWeight = w.frequency || 0;
    const markovWeight = w.markov || 0;
    const gapWeight = w.gap || 0;
    const momWeight = w.momentum || 0;

    for (let i = 0; i < limit; i++) {
        const target = history[i].gagnants;
        const past = history.slice(i + 1); 
        if (past.length < 20) break;

        const contextSize = Math.min(past.length, 40);
        const subPast = past.slice(0, contextSize);
        const candidates = new Map<number, number>();

        // 1. Fréquence
        if (freqWeight > 0.01) {
            const freqMap = new Map<number, number>();
            subPast.forEach(d => d.gagnants.forEach(n => freqMap.set(n, (freqMap.get(n) || 0) + 1)));
            const maxFreq = Math.max(...freqMap.values()) || 1;
            freqMap.forEach((count, n) => {
                 candidates.set(n, (candidates.get(n)||0) + ((count / maxFreq) * 100 * freqWeight));
            });
        }

        // 2. Markov (T-1)
        if (markovWeight > 0.01) {
            const lastDraw = past[0].gagnants;
            const markovMap = new Map<number, number>();
            for (let k = 0; k < contextSize - 1; k++) {
                const curr = past[k].gagnants;
                const prev = past[k+1].gagnants;
                if (prev.some(x => lastDraw.includes(x))) {
                     curr.forEach(n => markovMap.set(n, (markovMap.get(n)||0) + 1));
                }
            }
            const maxMark = Math.max(...markovMap.values()) || 1;
            if (maxMark > 0) {
                markovMap.forEach((val, key) => {
                    candidates.set(key, (candidates.get(key)||0) + ((val/maxMark)*100 * markovWeight));
                });
            }
        }

        // 3. Gap
        if (gapWeight > 0.01) {
            for(let n=1; n<=90; n++) {
                let gap = 0;
                for(let k=0; k<subPast.length; k++) {
                    if(subPast[k].gagnants.includes(n)) break;
                    gap++;
                }
                let score = 0;
                // Logique "Ecart Critique"
                if(gap < 10) score = (gap/10)*20;
                else if(gap >= 10 && gap <= 25) score = 50 + ((gap-10)/15)*50; // Zone chaude
                else score = 100; // Zone critique
                
                candidates.set(n, (candidates.get(n)||0) + (score * gapWeight));
            }
        }

        // 4. Momentum
        if (momWeight > 0.01) {
            const momPast = past.slice(0, 8);
            const momMap = new Map<number, number>();
            momPast.forEach(d => d.gagnants.forEach(n => momMap.set(n, (momMap.get(n)||0)+1)));
            momMap.forEach((val, key) => {
                candidates.set(key, (candidates.get(key)||0) + (Math.min(100, val*30) * momWeight));
            });
        }

        // Top 5 Prediction
        const top5 = Array.from(candidates.entries())
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(x => x[0]);
        
        const hits = top5.filter(n => target.includes(n)).length;
        
        // Fitness exponentielle pour favoriser les "gros coups"
        if (hits === 1) totalScore += 10;
        if (hits === 2) totalScore += 50;
        if (hits === 3) totalScore += 250;
        if (hits === 4) totalScore += 1000;
        if (hits === 5) totalScore += 5000;
    }

    return totalScore;
};

// --- WORKER HANDLER ---

ctx.onmessage = (e) => {
    if (e.data.type === 'start') {
        const { baseWeights, baseRules, config, history } = e.data.payload;
        
        const POPSIZE = config.populationSize || 40;
        const MAX_GENERATIONS = config.maxGenerations || 40;
        const INITIAL_MUTATION_RATE = config.mutationRate || 0.2;
        const ELITISM_COUNT = Math.max(2, Math.floor(POPSIZE * 0.1));
        const EARLY_STOP_PATIENCE = 6;
        const DIVERSITY_THRESHOLD = 0.05;

        let population: Individual[] = Array.from({ length: POPSIZE }, (_, i) => ({
            weights: i === 0 ? baseWeights : mutateGaussian(baseWeights, 0.5, 0.5), // Diversité initiale
            fitness: 0
        }));

        let bestFitnessEver = -Infinity;
        let stagnationCount = 0;
        let lastBestFitness = -Infinity;

        for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
            // 1. Evaluation
            population.forEach(ind => {
                // Optimization: Ne pas recalculer si fitness déjà connue (sauf si l'algo était stochastique, ce qui n'est pas le cas ici pour une historique fixe)
                if (ind.fitness === 0) { 
                    ind.fitness = evaluate(ind.weights, baseRules, history, config.historyDepth);
                }
            });

            // 2. Sort & Stats
            population.sort((a, b) => b.fitness - a.fitness);
            
            const currentBest = population[0];
            const currentAvg = population.reduce((a,b) => a + b.fitness, 0) / POPSIZE;
            const diversity = calculateDiversity(population);

            // 3. Stagnation Check (Early Stopping)
            if (currentBest.fitness > lastBestFitness) {
                lastBestFitness = currentBest.fitness;
                stagnationCount = 0;
            } else {
                stagnationCount++;
            }

            // 4. Reporting
            ctx.postMessage({ 
                type: 'progress', 
                data: { 
                    gen: gen + 1, 
                    bestFitness: currentBest.fitness, 
                    avgFitness: currentAvg, 
                    diversity, 
                    stagnation: stagnationCount,
                    bestGenome: currentBest.weights 
                } 
            });

            if (stagnationCount >= EARLY_STOP_PATIENCE) {
                // Early stopping triggered
                break;
            }

            if (currentBest.fitness > bestFitnessEver) {
                bestFitnessEver = currentBest.fitness;
            }

            // 5. Adaptive Parameters
            // Si la diversité est faible, on augmente massivement le taux de mutation (Cataclysm)
            // Sinon on réduit sigma progressivement pour converger
            let currentSigma = 0.3 * (1 - (gen / MAX_GENERATIONS)); 
            let currentMutationRate = INITIAL_MUTATION_RATE;

            if (diversity < DIVERSITY_THRESHOLD) {
                currentSigma = 0.6; // Boost
                currentMutationRate = 0.6; // High mutation
            }

            // 6. Reproduction
            const nextGen: Individual[] = [];
            
            // Elitisme
            for(let i=0; i<ELITISM_COUNT; i++) {
                nextGen.push({ ...population[i] }); // Clone
            }

            // Breeding
            while (nextGen.length < POPSIZE) {
                // Tournoi Selection
                const tournamentSize = 3;
                const selectParent = () => {
                    let best = population[Math.floor(Math.random() * POPSIZE)];
                    for(let k=1; k<tournamentSize; k++) {
                        const contender = population[Math.floor(Math.random() * POPSIZE)];
                        if (contender.fitness > best.fitness) best = contender;
                    }
                    return best;
                };

                const p1 = selectParent();
                const p2 = selectParent();
                
                let childWeights = uniformCrossover(p1.weights, p2.weights);
                
                // Mutation
                childWeights = mutateGaussian(childWeights, currentSigma, currentMutationRate);
                
                nextGen.push({ weights: childWeights, fitness: 0 });
            }
            population = nextGen;
        }

        ctx.postMessage({
            type: 'result',
            data: { bestChromosome: population[0] }
        });
    }
};
