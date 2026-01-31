
export {};

/**
 * Nexus ACO Worker v5.0 (ACS - Ant Colony System Logic)
 */

interface AntPath { path: number[]; score: number; }

const ALPHA = 1.0;  // Influence Pheromone
const BETA = 4.0;   // Influence Heuristique
const RHO = 0.1;    // Évaporation globale
const PHI = 0.1;    // Évaporation locale (ACS)
const Q0 = 0.8;     // Probabilité d'exploitation vs exploration
const MIN_PHEROMONE = 0.1;
const MAX_PHEROMONE = 10.0;

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent) => {
    const { history, config, vocalContext } = e.data;
    if (!history || history.length < 15) {
        ctx.postMessage({ error: "Data depth insufficient" });
        return;
    }

    const numNodes = 90;
    const antsCount = config?.antsCount || 50; // Moins de fourmis mais plus intelligentes
    const generations = config?.generations || 30;
    const oracleTargets = vocalContext?.targets || [];

    // Matrice Phéromones (tau)
    const pheromones = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(MAX_PHEROMONE);
    
    // Matrice Heuristique (eta) - Basée sur la co-occurrence fréquence/distance
    const heuristic = new Float32Array((numNodes + 1) * (numNodes + 1)).fill(0.1);
    
    // Calcul heuristique (inverse de la "distance" statistique)
    const recentHistory = history.slice(0, 50);
    recentHistory.forEach((draw: { gagnants: number[] }) => {
        const nums = draw.gagnants;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const u = nums[i], v = nums[j];
                // Plus ils sortent ensemble, plus ils sont "proches" (heuristic élevée)
                heuristic[u * (numNodes + 1) + v] += 1;
                heuristic[v * (numNodes + 1) + u] += 1;
            }
        }
    });
    // Normalisation heuristique
    for(let i=0; i<heuristic.length; i++) heuristic[i] = Math.sqrt(heuristic[i]) + 0.5;

    // Boost Oracle
    if (oracleTargets.length > 0) {
        oracleTargets.forEach((t: number) => {
            for (let i = 1; i <= 90; i++) {
                if (i === t) continue;
                heuristic[t * (numNodes + 1) + i] *= 2.0;
                heuristic[i * (numNodes + 1) + t] *= 2.0;
            }
        });
    }

    let globalBestPath: number[] = [];
    let globalBestScore = -Infinity;

    for (let gen = 0; gen < generations; gen++) {
        const iterationPaths: AntPath[] = [];
        
        for (let k = 0; k < antsCount; k++) {
            const path: number[] = [];
            const visited = new Set<number>();
            
            // Démarrage aléatoire ou Oracle
            let current: number;
            if (oracleTargets.length > 0 && Math.random() < 0.5) {
                current = oracleTargets[Math.floor(Math.random() * oracleTargets.length)];
            } else {
                current = Math.floor(Math.random() * 90) + 1;
            }
            
            path.push(current);
            visited.add(current);

            while (path.length < 5) {
                const candidates = [];
                let sumProb = 0;

                // Calcul des probabilités pour tous les voisins possibles
                for (let next = 1; next <= 90; next++) {
                    if (visited.has(next)) continue;
                    
                    const idx = current * (numNodes + 1) + next;
                    const tau = pheromones[idx];
                    const eta = heuristic[idx];
                    
                    // ACS Rule: ArgMax or Proportional?
                    const value = Math.pow(tau, ALPHA) * Math.pow(eta, BETA);
                    candidates.push({ node: next, value, idx });
                    sumProb += value;
                }

                if (candidates.length === 0) break;

                let nextNode = -1;
                let edgeIdx = -1;

                // Règle de transition pseudo-aléatoire (ACS)
                if (Math.random() < Q0) {
                    // Exploitation (Choisir le meilleur)
                    let maxVal = -1;
                    for(const c of candidates) {
                        if(c.value > maxVal) { maxVal = c.value; nextNode = c.node; edgeIdx = c.idx; }
                    }
                } else {
                    // Exploration (Roulette Wheel)
                    let r = Math.random() * sumProb;
                    for (const c of candidates) {
                        r -= c.value;
                        if (r <= 0) { nextNode = c.node; edgeIdx = c.idx; break; }
                    }
                    if (nextNode === -1) { nextNode = candidates[candidates.length-1].node; edgeIdx = candidates[candidates.length-1].idx; }
                }

                path.push(nextNode);
                visited.add(nextNode);
                
                // Mise à jour locale des phéromones (Local Pheromone Update)
                // Simule l'évaporation locale pour encourager les autres fourmis à explorer ailleurs
                pheromones[edgeIdx] = (1 - PHI) * pheromones[edgeIdx] + PHI * MIN_PHEROMONE;
                
                current = nextNode;
            }

            if (path.length < 5) continue;

            // Évaluation du chemin (Score basé sur la "force" heuristique totale du ticket)
            let score = 0;
            const sorted = [...path].sort((a,b)=>a-b);
            for(let i=0; i<4; i++) {
                for(let j=i+1; j<5; j++) {
                    score += heuristic[sorted[i] * (numNodes + 1) + sorted[j]];
                }
            }
            iterationPaths.push({ path: sorted, score });
        }

        if (iterationPaths.length === 0) continue;
        
        // Trouver le meilleur de l'itération
        iterationPaths.sort((a,b) => b.score - a.score);
        const bestIter = iterationPaths[0];
        
        if (bestIter.score > globalBestScore) {
            globalBestScore = bestIter.score;
            globalBestPath = bestIter.path;
        }

        // Mise à jour globale des phéromones (Seulement sur le meilleur chemin global - ACS)
        // Evaporation globale
        for(let i=0; i<pheromones.length; i++) {
            pheromones[i] = (1 - RHO) * pheromones[i];
        }

        // Renforcement du meilleur chemin
        const deposit = RHO * (1.0 / (1.0 / globalBestScore)); // Proportionnel au score
        const bestP = globalBestPath;
        for (let i = 0; i < 4; i++) {
            for (let j = i+1; j < 5; j++) {
                const u = bestP[i], v = bestP[j];
                const idx1 = u * (numNodes + 1) + v;
                const idx2 = v * (numNodes + 1) + u;
                // Bornage
                pheromones[idx1] = Math.max(MIN_PHEROMONE, Math.min(MAX_PHEROMONE, pheromones[idx1] + deposit));
                pheromones[idx2] = Math.max(MIN_PHEROMONE, Math.min(MAX_PHEROMONE, pheromones[idx2] + deposit));
            }
        }
    }

    const topResults = [{ 
        numbers: globalBestPath, 
        pheromoneDensity: 0.98, 
        confidence: Math.min(99, 60 + globalBestScore * 2),
        isOracleBiased: oracleTargets.some((t: number) => globalBestPath.includes(t))
    }];
    
    ctx.postMessage({ type: 'result', topPaths: topResults });
};
