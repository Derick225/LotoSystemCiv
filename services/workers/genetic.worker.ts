
export {};

/**
 * Nexus Genetic Engine v5.0 (Deep Science Edition)
 * Implémente un algorithme génétique complet avec calcul de ratio de Sharpe et diversité de population.
 */

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }

const ctx = self as unknown as Worker;

// Normalisation vectorielle stricte (Somme = 1.0)
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

// Métrique d'entropie pour la diversité des prédictions
const calculatePredictionEntropy = (predictions: number[]): number => {
    const freq: Record<number, number> = {};
    predictions.forEach(n => freq[n] = (freq[n] || 0) + 1);
    let entropy = 0;
    const total = predictions.length || 1;
    Object.values(freq).forEach(c => {
        const p = c / total;
        if (p > 0) entropy -= p * Math.log2(p);
    });
    return entropy; // Plus c'est haut, mieux c'est (moins prévisible)
};

/**
 * FITNESS FUNCTION AVANCÉE (Sharpe-like)
 * Récompense : Hits, Stabilité.
 * Pénalité : Variance excessive, Overfitting (scores trop hauts sans hits).
 */
const evaluate = (w: AlgoWeights, _r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
    const limit = Math.min(history.length - 1, depth);
    const returns: number[] = []; 
    const allPredictedNumbers: number[] = [];
    let hitsCount = 0;

    // Simulation rapide sur l'historique
    for (let i = 0; i < limit; i++) {
        const target = history[i]; 
        const past = history.slice(i + 1);
        if (past.length < 10) break;

        let drawScore = 0;
        
        // Simulation ultra-rapide des algos principaux
        const candidates = new Map<number, number>();
        
        // 1. Fréquence (Optimisé)
        const freqWeight = w.frequency || 0;
        if (freqWeight > 0.01) {
            const freqMap = new Uint16Array(91);
            for(let k=0; k<Math.min(past.length, 30); k++) {
                const d = past[k].gagnants;
                for(let j=0; j<d.length; j++) freqMap[d[j]]++;
            }
            for(let n=1; n<=90; n++) {
                if(freqMap[n] > 0) candidates.set(n, (candidates.get(n)||0) + (freqMap[n] * freqWeight));
            }
        }

        // 2. Markov (Optimisé T-1)
        const markovWeight = w.markov || 0;
        if (markovWeight > 0.01 && past.length > 1) {
            const lastDraw = past[0].gagnants;
            const transitions = new Uint16Array(91);
            // On regarde les transitions sur les 50 derniers tirages
            for(let k=0; k<Math.min(past.length-1, 50); k++) {
                const curr = past[k].gagnants;
                const prev = past[k+1].gagnants;
                // Si le tirage prev contient un numéro du lastDraw
                if(prev.some(x => lastDraw.includes(x))) {
                    for(let j=0; j<curr.length; j++) transitions[curr[j]]++;
                }
            }
            for(let n=1; n<=90; n++) {
                 if(transitions[n] > 0) candidates.set(n, (candidates.get(n)||0) + (transitions[n] * markovWeight * 2));
            }
        }

        // 3. Gap (Optimisé)
        const gapWeight = w.gap || 0;
        if (gapWeight > 0.01) {
             const gaps = new Int16Array(91).fill(-1);
             let found = 0;
             for(let k=0; k<past.length; k++) {
                 if(found >= 90) break;
                 const d = past[k].gagnants;
                 for(let j=0; j<d.length; j++) {
                     if(gaps[d[j]] === -1) {
                         gaps[d[j]] = k;
                         found++;
                     }
                 }
             }
             for(let n=1; n<=90; n++) {
                 const g = gaps[n];
                 // Zone critique "Hot" pour 5/90 : 8 à 22
                 if (g >= 8 && g <= 22) candidates.set(n, (candidates.get(n)||0) + (gapWeight * 3));
             }
        }

        // Extraction Top 5
        const top5 = Array.from(candidates.entries())
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(x => x[0]);
        
        allPredictedNumbers.push(...top5);

        const currentHits = top5.filter(n => target.gagnants.includes(n)).length;
        hitsCount += currentHits;

        // Reward function non-linéaire (récompense exponentiellement les hits multiples)
        const reward = currentHits === 0 ? -0.1 : Math.pow(currentHits, 2.5);
        returns.push(reward);
    }

    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, val) => acc + Math.pow(val - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Sharpe Ratio modifié : (Performance - RiskFree) / Volatilité
    // Ici on pénalise la volatilité des résultats
    const sharpeRatio = (avgReturn * 10) / (stdDev + 0.1); 

    const entropy = calculatePredictionEntropy(allPredictedNumbers);
    
    // Fitness composite : Performance + Stabilité + Diversité des prédictions (évite de toujours jouer le 1)
    return (sharpeRatio * 100) + (hitsCount * 5) + (entropy * 2);
};

const mutateGaussian = (w: AlgoWeights, rate: number, intensity: number = 0.2): AlgoWeights => {
    const mutated = { ...w };
    Object.keys(mutated).forEach(k => {
        if (Math.random() < rate) {
            const noise = (Math.random() - 0.5) * intensity;
            const currentVal = mutated[k] || 0;
            // Mutation
            mutated[k] = Math.max(0.001, currentVal + noise);
        }
    });
    return normalizeWeights(mutated);
};

const crossover = (p1: AlgoWeights, p2: AlgoWeights): AlgoWeights => {
    const child: AlgoWeights = {};
    Object.keys(p1).forEach(k => {
        // Mélange uniforme avec légère préférence pour le gène dominant
        const gene1 = p1[k] || 0;
        const gene2 = p2[k] || 0;
        child[k] = Math.random() > 0.5 ? gene1 : gene2;
    });
    return normalizeWeights(child);
};

// Calcul de la distance Euclidienne entre deux génomes (pour la diversité)
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
            weights: i === 0 ? baseWeights : mutateGaussian(baseWeights, 1.0, 0.5), // Initialisation diverse
            rules: baseRules,
            fitness: 0
        }));

        for (let gen = 0; gen < GENERATIONS; gen++) {
            // 1. Évaluation
            population.forEach(ind => {
                ind.fitness = evaluate(ind.weights, ind.rules, history, config.historyDepth);
            });

            // 2. Tri
            population.sort((a, b) => b.fitness - a.fitness);
            
            // 3. Calcul Télémétrie
            const bestFitness = population[0].fitness;
            const avgFitness = population.reduce((a,b) => a + b.fitness, 0) / POPSIZE;
            
            // Diversité : distance moyenne par rapport au meilleur
            let totalDist = 0;
            for(let i=1; i<POPSIZE; i++) {
                totalDist += geneticDistance(population[0].weights, population[i].weights);
            }
            const diversity = totalDist / (POPSIZE - 1);

            ctx.postMessage({ 
                type: 'progress', 
                data: { 
                    gen: gen + 1, 
                    bestFitness,
                    avgFitness,
                    diversity,
                    bestGenome: population[0].weights // Pour visualisation live
                } 
            });

            // 4. Evolution (Elitisme + Tournoi)
            const nextGen = [];
            const eliteCount = Math.max(2, Math.floor(POPSIZE * 0.1));
            
            // On garde l'élite pure
            for(let i=0; i<eliteCount; i++) nextGen.push(population[i]);

            while (nextGen.length < POPSIZE) {
                // Tournoi
                const p1 = population[Math.floor(Math.random() * (POPSIZE / 2))];
                const p2 = population[Math.floor(Math.random() * POPSIZE)]; // Peut prendre des moins bons pour diversité
                
                let childWeights = crossover(p1.weights, p2.weights);
                
                // Mutation dynamique : augmente si la diversité est faible
                const dynamicMutationRate = diversity < 0.1 ? MUTATION_RATE * 2 : MUTATION_RATE;
                const dynamicIntensity = diversity < 0.1 ? 0.3 : 0.1;
                
                childWeights = mutateGaussian(childWeights, dynamicMutationRate, dynamicIntensity);
                
                nextGen.push({
                    weights: childWeights,
                    rules: baseRules, // Rules constantes pour l'instant
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
