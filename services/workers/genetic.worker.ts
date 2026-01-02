
export {};

/**
 * Darwin Genetic Worker v3.3.6
 * Optimisé pour la synthèse stochastique 2025.
 */

interface DrawResultLite { gagnants: number[]; machine?: number[]; }
interface AlgoWeights { [key: string]: number | undefined; }
interface AdaptiveRules { criticalZoneMin: number; criticalZoneMax: number; }

// Fix: Explicit typing for self
const ctx = self as unknown as Worker;

const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
    const keys = Object.keys(w);
    // FIX: Explicitly type reduce accumulator to avoid TS18048
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

/**
 * Fitness Multi-Objectif : Performance + Stabilité + Diversité Jaccard.
 */
const evaluate = (w: AlgoWeights, r: AdaptiveRules, history: DrawResultLite[], depth: number): number => {
    const limit = Math.min(history.length - 1, depth);
    const cMin = r.criticalZoneMin || 12;
    const cMax = r.criticalZoneMax || 18;
    
    let totalHits = 0;
    const hitsByDraw: number[] = [];

    for (let i = 0; i < limit; i++) {
        const target = history[i]; 
        const past = history.slice(i + 1);
        if (past.length < 10) break;

        let drawFitness = 0;
        target.gagnants.forEach(n => {
            // 1. Fréquence locale pondérée
            const freq = past.slice(0, 25).filter(d => d.gagnants.includes(n)).length;
            drawFitness += freq * (w.frequency || 0.05) * 4;
            
            // 2. Résonance Zone Critique (Sniper)
            let gap = 50;
            for(let j=0; j<25; j++) { if(past[j]?.gagnants.includes(n)) { gap = j; break; } }
            if (gap >= cMin && gap <= cMax) drawFitness += 15 * (w.temporal || 0.05);

            // 3. Force de Transition (Markov)
            const prevDraw = past[0].gagnants;
            if (prevDraw.some(p => Math.abs(p - n) <= 1)) drawFitness += 10 * (w.orchestration || 0.05);
        });

        hitsByDraw.push(drawFitness);
        totalHits += drawFitness;
    }

    // Calcul de Stabilité (Inverse de la variance)
    const avg = totalHits / (hitsByDraw.length || 1);
    const variance = hitsByDraw.reduce<number>((acc, v) => acc + Math.pow(v - avg, 2), 0) / (hitsByDraw.length || 1);
    const stabilityBonus = 1 / (1 + Math.sqrt(variance));

    // Résultat final : Performance brute boostée par la régularité
    return totalHits * (1 + stabilityBonus);
};

/**
 * Mutation Gaussienne pour un ajustement fin des poids.
 */
const mutateGaussian = (w: AlgoWeights, rate: number): AlgoWeights => {
    const mutated = { ...w };
    Object.keys(mutated).forEach(k => {
        if (Math.random() < rate) {
            // Bruit gaussien approximatif
            const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 0.3;
            const currentVal = mutated[k] || 0;
            mutated[k] = Math.max(0.001, Math.min(1, currentVal + noise));
        }
    });
    return normalizeWeights(mutated);
};

/**
 * Uniform Crossover : Mélange l'ADN de deux parents élites.
 */
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
        
        // Initialisation avec diversité forcée
        let population = Array.from({ length: config.populationSize }, (_, i) => ({
            weights: i === 0 ? baseWeights : mutateGaussian(baseWeights, 0.9),
            rules: i === 0 ? baseRules : mutateRules(baseRules, 0.9),
            fitness: 0
        }));

        for (let gen = 0; gen < config.maxGenerations; gen++) {
            // 1. Évaluation
            population.forEach(ind => {
                ind.fitness = evaluate(ind.weights, ind.rules, history, config.historyDepth);
            });

            // 2. Tri par performance
            population.sort((a, b) => b.fitness - a.fitness);

            // 3. Télémétrie
            ctx.postMessage({ 
                type: 'progress', 
                data: { 
                    gen: gen + 1, 
                    bestFitness: Math.round(population[0].fitness * 10) / 10,
                    diversity: new Set(population.map(p => (p.weights.frequency || 0).toFixed(2))).size / config.populationSize
                } 
            });

            // 4. Nouvelle Génération (Élitisme + Crossover + Mutation)
            const eliteCount = Math.max(2, Math.floor(config.populationSize * 0.15));
            const nextGen = population.slice(0, eliteCount); // Elitisme strict

            while (nextGen.length < config.populationSize) {
                // Sélection par tournoi pour le crossover
                const parent1 = population[Math.floor(Math.random() * eliteCount)];
                const parent2 = population[Math.floor(Math.random() * (config.populationSize / 2))];
                
                let childWeights = crossover(parent1.weights, parent2.weights);
                
                // Mutation aléatoire sur l'enfant
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
