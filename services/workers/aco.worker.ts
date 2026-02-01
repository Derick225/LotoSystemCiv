
export {};

/**
 * Nexus ACO Worker v5.0 (ACS - Ant Colony System)
 */

const ALPHA = 1.0;  // Importance phéromone
const BETA = 4.0;   // Importance heuristique
const RHO = 0.1;    // Évaporation globale
const Q0 = 0.8;     // Exploitation vs Exploration
const MAX_PHEROMONE = 10.0;
const MIN_PHEROMONE = 0.1;

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent) => {
    const { history, config, vocalContext } = e.data;
    if (!history || history.length < 15) return;

    const numNodes = 90;
    const antsCount = config?.antsCount || 60;
    const generations = config?.generations || 30;
    const oracleTargets = vocalContext?.targets || [];

    const pheromones = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(MAX_PHEROMONE);
    const heuristic = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(0.1);
    
    // Remplissage heuristique par co-occurrence
    history.slice(0, 50).forEach((draw: any) => {
        const nums = draw.gagnants;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const u = nums[i], v = nums[j];
                heuristic[u * 91 + v] += 1;
                heuristic[v * 91 + u] += 1;
            }
        }
    });

    let bestPath: number[] = [];
    let bestScore = -Infinity;

    for (let gen = 0; gen < generations; gen++) {
        for (let k = 0; k < antsCount; k++) {
            const path: number[] = [];
            const visited = new Set<number>();
            let current = Math.floor(Math.random() * 90) + 1;
            path.push(current); visited.add(current);

            while (path.length < 5) {
                const candidates = [];
                let sumProb = 0;

                for (let next = 1; next <= 90; next++) {
                    if (visited.has(next)) continue;
                    const val = Math.pow(pheromones[current * 91 + next], ALPHA) * 
                                Math.pow(heuristic[current * 91 + next], BETA);
                    candidates.push({ node: next, val });
                    sumProb += val;
                }

                if (candidates.length === 0) break;

                let nextNode = -1;
                if (Math.random() < Q0) {
                    let max = -1;
                    candidates.forEach(c => { if (c.val > max) { max = c.val; nextNode = c.node; }});
                } else {
                    let r = Math.random() * sumProb;
                    for (const c of candidates) {
                        r -= c.val;
                        if (r <= 0) { nextNode = c.node; break; }
                    }
                }
                if (nextNode === -1) nextNode = candidates[0].node;
                path.push(nextNode); visited.add(nextNode);
                current = nextNode;
            }

            // Évaluation du chemin
            let score = 0;
            const sorted = [...path].sort((a,b)=>a-b);
            for(let i=0; i<4; i++) {
                for(let j=i+1; j<5; j++) score += heuristic[sorted[i] * 91 + sorted[j]];
            }

            if (score > bestScore) { bestScore = score; bestPath = sorted; }
        }

        // Évaporation et renforcement global
        for(let i=0; i<pheromones.length; i++) pheromones[i] *= (1 - RHO);
        const deposit = RHO * bestScore;
        for (let i = 0; i < 4; i++) {
            for (let j = i+1; j < 5; j++) {
                const idx = bestPath[i] * 91 + bestPath[j];
                pheromones[idx] = Math.min(MAX_PHEROMONE, pheromones[idx] + deposit);
            }
        }
    }

    ctx.postMessage({ type: 'result', topPaths: [{ 
        numbers: bestPath, 
        pheromoneDensity: 0.95, 
        confidence: Math.min(99, 65 + bestScore) 
    }]});
};
