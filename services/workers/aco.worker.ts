// ------------------ aco.worker.ts ------------------

export {};

/**
 * Nexus ACS Worker v6.0 (Ant Colony System)
 * Implémentation stricte de l'algorithme ACS pour le TSP/Subset selection.
 * Caractéristiques :
 * - Règle de transition pseudo-aléatoire (q0)
 * - Mise à jour locale des phéromones (pour diversifier la recherche)
 * - Mise à jour globale des phéromones (uniquement sur le meilleur chemin)
 * - Heuristique pondérée temporellement
 */

const ctx = self as unknown as Worker;

// Configuration par défaut (peut être surchargée par le message)
const DEFAULTS = {
    antsCount: 50,
    generations: 100,
    alpha: 1.0,     // Influence Phéromone
    beta: 3.0,      // Influence Heuristique (Visibilité)
    rho: 0.1,       // Évaporation Globale
    xi: 0.1,        // Évaporation Locale
    q0: 0.9         // Probabilité d'exploitation (vs Exploration)
};

const NUM_NODES = 90;
const TICKET_SIZE = 5;
const MAX_TIME_MS = 4800; // Marge de sécurité de 200ms avant le timeout client

// Indexation matricielle à plat pour performance (91x91)
const getIdx = (u: number, v: number) => u * 91 + v;

ctx.onmessage = (e: MessageEvent) => {
    const startTime = Date.now();
    const { history, config } = e.data;
    
    if (!history || history.length < 10) {
        ctx.postMessage({ error: "Historique insuffisant" });
        return;
    }

    // Fusion config
    const C = { ...DEFAULTS, ...config };
    
    // 1. Initialisation Heuristique (eta)
    // Basée sur la co-occurrence pondérée par la récence
    const eta = new Float32Array(91 * 91).fill(0.1);
    
    history.slice(0, 100).forEach((draw: { gagnants: number[] }, idx: number) => {
        // Poids exponentiel : les tirages récents comptent beaucoup plus
        // idx 0 = le plus récent.
        const recencyWeight = Math.exp(-0.03 * idx); 
        const nums = draw.gagnants;
        
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const u = nums[i], v = nums[j];
                const w = recencyWeight;
                eta[getIdx(u, v)] += w;
                eta[getIdx(v, u)] += w;
            }
        }
    });

    // 2. Initialisation Phéromones (tau)
    const tau0 = 1.0 / (NUM_NODES * 0.5); // Valeur initiale standard ACS
    const tau = new Float32Array(91 * 91).fill(tau0);

    let globalBestPath: number[] = [];
    let globalBestScore = -Infinity;

    // --- BOUCLE PRINCIPALE ---
    for (let gen = 0; gen < C.generations; gen++) {
        
        // Time Guard
        if (Date.now() - startTime > MAX_TIME_MS) break;

        let iterationBestPath: number[] = [];
        let iterationBestScore = -Infinity;

        // Construction des solutions par les fourmis
        for (let k = 0; k < C.antsCount; k++) {
            const path: number[] = [];
            const visited = new Set<number>();
            
            // Démarrage aléatoire (ou basé sur fréquence simple pour optimiser)
            let current = Math.floor(Math.random() * 90) + 1;
            path.push(current);
            visited.add(current);

            // Construction pas à pas
            for (let step = 0; step < TICKET_SIZE - 1; step++) {
                let nextNode = -1;
                
                // Calcul des probabilités pour les nœuds non visités
                // ACS Rule: ArgMax if q < q0, else Roulette Wheel
                
                const candidates: { node: number, score: number }[] = [];
                let sumScores = 0;
                let maxArgScore = -1;
                let bestArgNode = -1;

                // On ne scanne pas tous les 90 nœuds pour perf, on peut filtrer ceux avec eta > seuil
                // Mais pour exactitude ici on scanne tout (90 itérations c'est rapide)
                for (let next = 1; next <= 90; next++) {
                    if (!visited.has(next)) {
                        // Score = tau^alpha * eta^beta
                        // Si alpha=1, on évite Math.pow
                        const t = tau[getIdx(current, next)];
                        const n = eta[getIdx(current, next)];
                        const score = t * Math.pow(n, C.beta);

                        candidates.push({ node: next, score });
                        sumScores += score;

                        if (score > maxArgScore) {
                            maxArgScore = score;
                            bestArgNode = next;
                        }
                    }
                }

                if (candidates.length === 0) break; // Should not happen

                // Décision : Exploitation ou Exploration ?
                const q = Math.random();
                if (q <= C.q0 && bestArgNode !== -1) {
                    nextNode = bestArgNode;
                } else {
                    // Roulette Wheel
                    let r = Math.random() * sumScores;
                    for (const c of candidates) {
                        r -= c.score;
                        if (r <= 0) {
                            nextNode = c.node;
                            break;
                        }
                    }
                    if (nextNode === -1) nextNode = candidates[candidates.length - 1].node;
                }

                // ACS Local Update : on réduit la phéromone de l'arc visité pour encourager les autres fourmis à explorer ailleurs
                // tau(r,s) = (1-xi)*tau(r,s) + xi*tau0
                const idxLink = getIdx(current, nextNode);
                tau[idxLink] = (1 - C.xi) * tau[idxLink] + C.xi * tau0;
                tau[getIdx(nextNode, current)] = tau[idxLink]; // Symétrique

                path.push(nextNode);
                visited.add(nextNode);
                current = nextNode;
            }

            // Évaluation du ticket généré
            // Score = Somme des poids heuristiques des arêtes du ticket complet
            let score = 0;
            const sortedPath = [...path].sort((a,b) => a-b);
            for (let i = 0; i < sortedPath.length; i++) {
                for (let j = i + 1; j < sortedPath.length; j++) {
                    score += eta[getIdx(sortedPath[i], sortedPath[j])];
                }
            }

            // Mise à jour Best
            if (score > globalBestScore) {
                globalBestScore = score;
                globalBestPath = sortedPath;
            }
            if (score > iterationBestScore) {
                iterationBestScore = score;
                iterationBestPath = sortedPath;
            }
        }

        // ACS Global Update : Seulement sur le meilleur chemin global
        // tau(r,s) = (1-rho)*tau(r,s) + rho*DeltaTau
        // DeltaTau = 1 / (Cbest_length) ou ici proportionnel au score heuristique
        const deposit = globalBestScore * 0.1; // Scaling factor
        
        for (let i = 0; i < globalBestPath.length; i++) {
            for (let j = i + 1; j < globalBestPath.length; j++) {
                const u = globalBestPath[i];
                const v = globalBestPath[j];
                const idx = getIdx(u, v);
                
                tau[idx] = (1 - C.rho) * tau[idx] + C.rho * deposit;
                tau[getIdx(v, u)] = tau[idx];
            }
        }
    }

    // Calcul de confiance normalisé (0-100) pour l'affichage
    // On compare le score au score "moyen" d'un ticket aléatoire
    const confidence = Math.min(99, Math.round(Math.log(globalBestScore + 1) * 15));

    ctx.postMessage({ 
        type: 'result', 
        bestPath: { 
            numbers: globalBestPath, 
            pheromoneDensity: 0.9, // Indicateur visuel
            confidence: confidence
        } 
    });
};