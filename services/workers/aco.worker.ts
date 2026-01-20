
export {};

/**
 * Nexus ACO Worker v4.6 (Balanced & Oracle-Biased Edition)
 */

interface AntPath { path: number[]; score: number; }

const ALPHA = 1.2; 
const BETA = 3.5;  
const RHO = 0.15;   
const Q = 100;     
const MAX_PHEROMONE = 8.0;
const MIN_PHEROMONE = 0.05;
const ORACLE_BOOST = 4.0;

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent) => {
    const { history, config, vocalContext } = e.data;
    if (!history || history.length < 15) {
        ctx.postMessage({ error: "Data depth insufficient" });
        return;
    }

    const numNodes = 90;
    const antsCount = config?.antsCount || 300;
    const generations = config?.generations || 40;
    const oracleTargets = vocalContext?.targets || [];

    const pheromones = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(MIN_PHEROMONE);
    
    if (oracleTargets.length > 0) {
        oracleTargets.forEach((t: number) => {
            for (let i = 1; i <= 90; i++) {
                if (i === t) continue;
                pheromones[t * (numNodes + 1) + i] = ORACLE_BOOST;
                pheromones[i * (numNodes + 1) + t] = ORACLE_BOOST;
            }
        });
    }

    const rawHeuristic = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(0);
    const recentHistory = history.slice(0, 60);
    
    recentHistory.forEach((draw: { gagnants: number[] }) => {
        const nums = draw.gagnants;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const u = nums[i], v = nums[j];
                if (u > 90 || v > 90) continue;
                rawHeuristic[u * (numNodes + 1) + v] += 1;
                rawHeuristic[v * (numNodes + 1) + u] += 1;
            }
        }
    });

    // Amortissement racinaire de l'heuristique pour réduire la dominance fréquentielle
    const heuristic = new Float32Array((numNodes + 1) * (numNodes + 1));
    for (let i = 0; i < rawHeuristic.length; i++) {
        heuristic[i] = Math.sqrt(rawHeuristic[i]) + 0.1;
    }

    let globalBestPath: number[] = [];
    let globalBestScore = -Infinity;

    for (let gen = 0; gen < generations; gen++) {
        const iterationPaths: AntPath[] = [];
        
        for (let k = 0; k < antsCount; k++) {
            const path: number[] = [];
            const visited = new Set<number>();
            
            let current: number;
            if (oracleTargets.length > 0 && Math.random() < 0.4) {
                current = oracleTargets[Math.floor(Math.random() * oracleTargets.length)];
            } else {
                current = Math.floor(Math.random() * 90) + 1;
            }
            
            path.push(current);
            visited.add(current);

            while (path.length < 5) {
                const probs = [];
                const nodes = [];
                let sum = 0;

                for (let next = 1; next <= 90; next++) {
                    if (visited.has(next)) continue;
                    
                    const idx = current * (numNodes + 1) + next;
                    const tau = Math.pow(pheromones[idx], ALPHA);
                    const eta = Math.pow(heuristic[idx], BETA);
                    const p = tau * eta;
                    
                    probs.push(p);
                    nodes.push(next);
                    sum += p;
                }

                if (sum === 0) break;

                let r = Math.random() * sum;
                let nextNode = nodes[nodes.length - 1];
                for (let i = 0; i < probs.length; i++) {
                    r -= probs[i];
                    if (r <= 0) { nextNode = nodes[i]; break; }
                }

                path.push(nextNode);
                visited.add(nextNode);
                current = nextNode;
            }

            if (path.length < 5) continue;

            let score = 0;
            const sorted = [...path].sort((a,b)=>a-b);
            for(let i=0; i<4; i++) {
                for(let j=i+1; j<5; j++) {
                    score += heuristic[sorted[i] * (numNodes + 1) + sorted[j]];
                    if (oracleTargets.includes(sorted[i])) score += 5;
                    if (oracleTargets.includes(sorted[j])) score += 5;
                }
            }
            iterationPaths.push({ path: sorted, score });
        }

        if (iterationPaths.length === 0) continue;
        iterationPaths.sort((a,b) => b.score - a.score);
        const bestIter = iterationPaths[0];
        
        if (bestIter.score > globalBestScore) {
            globalBestScore = bestIter.score;
            globalBestPath = bestIter.path;
        }

        for (let i = 0; i < pheromones.length; i++) {
            pheromones[i] = Math.max(MIN_PHEROMONE, pheromones[i] * (1 - RHO));
        }

        const deposit = Q / (Math.max(1, 100 / bestIter.score));
        for (let i = 0; i < 4; i++) {
            for (let j = i+1; j < 5; j++) {
                const u = bestIter.path[i], v = bestIter.path[j];
                const idx1 = u * (numNodes + 1) + v;
                const idx2 = v * (numNodes + 1) + u;
                pheromones[idx1] = Math.min(MAX_PHEROMONE, pheromones[idx1] + deposit);
                pheromones[idx2] = Math.min(MAX_PHEROMONE, pheromones[idx2] + deposit);
            }
        }
    }

    const topResults = [{ 
        numbers: globalBestPath, 
        pheromoneDensity: 0.98, 
        confidence: Math.min(98, 70 + globalBestScore / 5),
        isOracleBiased: oracleTargets.some((t: number) => globalBestPath.includes(t))
    }];
    
    ctx.postMessage({ type: 'result', topPaths: topResults });
};
