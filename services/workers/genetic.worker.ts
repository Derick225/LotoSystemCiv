import { secureRandom } from '../../utils/secureRandom';


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
    const u = 1 - secureRandom(); // Converting [0,1) to (0,1]
    const v = secureRandom();
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
        child[k] = secureRandom() > 0.5 ? (p1[k] || 0) : (p2[k] || 0);
    });
    return normalizeWeights(child);
};

// Mutation Gaussienne Adaptative
const mutateGaussian = (w: AlgoWeights, sigma: number, rate: number): AlgoWeights => {
    const mutant = { ...w };
    const keys = Object.keys(mutant);
    
    keys.forEach(k => {
        if (secureRandom() < rate) {
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

        // 5. Anti-Consensus (Contrarian)
        const antiConsensusWeight = w.anti_consensus || 0;
        if (antiConsensusWeight > 0.01) {
            // Favorise les numéros qui NE SONT PAS dans les favoris fréquence/markov
            // On calcule un score inverse basé sur la fréquence récente
            const freqMap = new Map<number, number>();
            subPast.forEach(d => d.gagnants.forEach(n => freqMap.set(n, (freqMap.get(n) || 0) + 1)));
            
            for(let n=1; n<=90; n++) {
                const freq = freqMap.get(n) || 0;
                // Score élevé si fréquence faible (mais pas nulle, pour éviter les numéros morts)
                // Idéalement : fréquence faible ou moyenne, mais pas top
                let score = 0;
                if (freq === 0) score = 80; // Froid
                else if (freq === 1) score = 100; // Tiède-Froid (potentiel réveil)
                else if (freq > 3) score = 20; // Trop chaud
                else score = 60;
                
                candidates.set(n, (candidates.get(n)||0) + (score * antiConsensusWeight));
            }
        }

        // 6. Equilibrium (Retour à la moyenne)
        const equilibriumWeight = w.equilibrium || 0;
        if (equilibriumWeight > 0.01) {
             // Favorise l'équilibre Pair/Impair et Bas/Haut par rapport à l'historique récent
             let oddCount = 0;
             let lowCount = 0; // 1-45
             let totalNums = 0;
             
             subPast.slice(0, 10).forEach(d => {
                 d.gagnants.forEach(n => {
                     if (n % 2 !== 0) oddCount++;
                     if (n <= 45) lowCount++;
                     totalNums++;
                 });
             });
             
             const oddRatio = totalNums > 0 ? oddCount / totalNums : 0.5;
             const lowRatio = totalNums > 0 ? lowCount / totalNums : 0.5;
             
             // Si trop de pairs récemment (oddRatio < 0.5), on favorise les impairs
             // Si trop de hauts récemment (lowRatio < 0.5), on favorise les bas
             
             for(let n=1; n<=90; n++) {
                 let score = 50;
                 const isOdd = n % 2 !== 0;
                 const isLow = n <= 45;
                 
                 if (oddRatio < 0.45 && isOdd) score += 25;
                 else if (oddRatio > 0.55 && !isOdd) score += 25;
                 
                 if (lowRatio < 0.45 && isLow) score += 25;
                 else if (lowRatio > 0.55 && !isLow) score += 25;
                 
                 candidates.set(n, (candidates.get(n)||0) + (score * equilibriumWeight));
             }
        }

        // 7. Spectral (Simulation simplifiée de périodicité)
        const spectralWeight = w.spectral || 0;
        if (spectralWeight > 0.01) {
            // On cherche les numéros qui ont une périodicité régulière
            // Simplification : on regarde l'écart type des écarts
            const gapsRegistry = new Map<number, number[]>();
            
            // On scanne plus loin pour le spectral
            const spectralPast = past.slice(0, 60);
            
            spectralPast.forEach((d, idx) => {
                d.gagnants.forEach(n => {
                    const gaps = gapsRegistry.get(n) || [];
                    gaps.push(idx);
                    gapsRegistry.set(n, gaps);
                });
            });
            
            gapsRegistry.forEach((indices, n) => {
                if (indices.length < 3) return; // Pas assez de données
                
                // Calcul des intervalles entre apparitions
                const intervals: number[] = [];
                for(let k=0; k<indices.length-1; k++) {
                    intervals.push(Math.abs(indices[k] - indices[k+1]));
                }
                
                // Moyenne et Ecart-type
                const avg = intervals.reduce((a,b)=>a+b,0) / intervals.length;
                const variance = intervals.reduce((a,b)=>a+Math.pow(b-avg, 2),0) / intervals.length;
                const stdDev = Math.sqrt(variance);
                
                // Si l'écart-type est faible, le numéro est régulier (périodique)
                // Score inversement proportionnel à la variabilité (CV)
                const cv = stdDev / (avg || 1);
                let score = 0;
                if (cv < 0.3) score = 100; // Très régulier
                else if (cv < 0.6) score = 70;
                else if (cv < 1.0) score = 30;
                
                // Bonus si on est proche du cycle attendu
                const lastSeenIndex = indices[0]; // Le plus récent (car on a itéré sur l'historique inversé ou non ? past est slice(i+1), donc indices[0] est le plus proche de i)
                // Attends, past[0] est le tirage i+1 (le plus récent par rapport à i).
                // Donc indices[0] est l'index dans past où le numéro est apparu. C'est le gap actuel.
                
                const currentGap = lastSeenIndex;
                const distToCycle = Math.abs(currentGap - avg);
                
                if (distToCycle < avg * 0.2) score += 50; // On est dans la fenêtre de tir
                
                candidates.set(n, (candidates.get(n)||0) + (Math.min(100, score) * spectralWeight));
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
                    let best = population[Math.floor(secureRandom() * POPSIZE)];
                    for(let k=1; k<tournamentSize; k++) {
                        const contender = population[Math.floor(secureRandom() * POPSIZE)];
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
