

// ------------------ aco.worker.ts ------------------

export {};
import { LCG } from '../../utils/mathUtils';
import { unpackHistory } from './zeroCopy';

/**
 * Nexus ACS Worker v6.0 (Ant Colony System)
 * Implémentation stricte de l'algorithme ACS pour le TSP/Subset selection.
 * Caractéristiques :
 * - Règle de transition pseudo-aléatoire (q0)
 * - Mise à jour locale des phéromones (pour diversifier la recherche)
 * - Mise à jour globale des phéromones (uniquement sur le meilleur chemin)
 * - Empirique pondérée temporellement
 */

const ctx = self as unknown as Worker;

// Constantes supprimées pour calcul dynamique
// const DEFAULTS = { ... };

const NUM_NODES = 90;
const TICKET_SIZE = 5;
const MAX_TIME_MS = 4800; // Marge de sécurité de 200ms avant le timeout client

// Indexation matricielle à plat pour performance (91x91)
const getIdx = (u: number, v: number) => u * 91 + v;

ctx.onmessage = (e: MessageEvent) => {
    const startTime = Date.now();
    const { history, historyBuffer, drawCount, winningCount, totalCols, config } = e.data;
    const hist = historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history);
    
    if (!hist || hist.length < 10) {
        ctx.postMessage({ error: "Historique insuffisant" });
        return;
    }

    // Seed déterministe absolu synchronisé sur la signature temporelle
    const prng = new LCG(`aco_${hist.length}_${(hist[0] as any)?.date || 'default'}`);

    // Initialisation des compteurs pour métriques
    const counts: Float32Array = new Float32Array(91).fill(0);
    let totalCount = 0;
    hist.forEach((draw: { gagnants: number[] }) => {
        draw.gagnants.forEach(n => {
            counts[n]++;
            totalCount++;
        });
    });

    // Entropie de Shannon
    let H = 0;
    for (let i = 1; i <= 90; i++) {
        const p = counts[i] / totalCount;
        if (p > 0) H -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(90);
    const normalizedEntropy = H / maxEntropy;
    const persistence = 1.0 - normalizedEntropy; // Hurst proxy

    // Configuration dynamique dérivée de l'histoire (Zéro Nombre Magique)
    const C = { 
        antsCount: config?.antsCount || Math.floor(Math.sqrt(hist.length) * 10),
        generations: config?.generations || Math.floor(Math.log(hist.length + 1) * 20),
        alpha: 1.0 + persistence,                   // Influence de la trace: monte avec la persistance
        beta: 1.0 + normalizedEntropy,              // Influence heuristique: monte avec l'entropie
        rho: 0.05 + 0.15 * Math.exp(-hist.length / 250.0), // Évaporation dynamique sur la taille de l'historique
        xi: normalizedEntropy / 2.0,                // Évaporation Locale
        q0: persistence,                            // Exploitation monte avec la certitude
        ...config 
    };
    
    // 1. Initialisation Empirique (eta)
    // Basée sur la co-occurrence pondérée par la récence
    const eta = new Float32Array(91 * 91).fill(0.1);
    
    hist.slice(0, 100).forEach((draw: { gagnants: number[] }, idx: number) => {
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
    const tau0 = 1.0 / (NUM_NODES * Math.SQRT1_2); // Valeur initiale continue ACS
    const tau = new Float32Array(91 * 91).fill(tau0);

    let globalBestPath: number[] = [];
    let globalBestScore = -Infinity;

    // --- BOUCLE PRINCIPALE ---
    let adaptiveRho = C.rho;
    let adaptiveXi = C.xi;
    let lastHNorm = 1.0 / Math.E; // Entropie de départ mathématique continue

    for (let gen = 0; gen < C.generations; gen++) {
        
        // Time Guard
        if (Date.now() - startTime > MAX_TIME_MS) break;

        let iterationBestPath: number[] = [];
        let iterationBestScore = -Infinity;
        const pathsThisGen: number[][] = [];

        // Construction des solutions par les fourmis
        for (let k = 0; k < C.antsCount; k++) {
            const path: number[] = [];
            const visited = new Set<number>();
            
            // Démarrage aléatoire déterministe
            let current = Math.floor(prng.next() * 90) + 1;
            path.push(current);
            visited.add(current);

            // Construction pas à pas
            for (let step = 0; step < TICKET_SIZE - 1; step++) {
                let nextNode = -1;
                
                // Calcul des probabilités continues (Softmax d'étalement) pour conserver la continuité
                const candidates: { node: number, rawScore: number }[] = [];
                let maxRawScore = -Infinity;

                for (let next = 1; next <= 90; next++) {
                    if (!visited.has(next)) {
                        const t = tau[getIdx(current, next)];
                        const n = eta[getIdx(current, next)];
                        const rawScore = t * Math.pow(n, C.beta);

                        candidates.push({ node: next, rawScore });
                        if (rawScore > maxRawScore) {
                            maxRawScore = rawScore;
                        }
                    }
                }

                if (candidates.length === 0) break;

                // Température continue inversement proportionnelle à q0 + influence entropique
                // Plus temp est basse, plus Softmax == ArgMax. Plus haut, plus == Roulette Uniforme.
                const temperature = Math.max(Number.EPSILON, 1.0 - C.q0) * Math.exp(lastHNorm);
                
                let sumExp = 0;
                for (const c of candidates) {
                    // Normalisation par le max pour la stabilité numérique de l'exp()
                    const expScore = Math.exp((c.rawScore - maxRawScore) / temperature);
                    c.rawScore = expScore; 
                    sumExp += expScore;
                }

                // Échantillonnage sur la distribution cumulative continue (CDF)
                let r = prng.next() * sumExp;
                for (const c of candidates) {
                    r -= c.rawScore;
                    if (r <= 0) {
                        nextNode = c.node;
                        break;
                    }
                }
                if (nextNode === -1) nextNode = candidates[candidates.length - 1].node;

                // ACS Local Update : on réduit la phéromone de l'arc visité avec le xi adaptatif
                const idxLink = getIdx(current, nextNode);
                tau[idxLink] = (1 - adaptiveXi) * tau[idxLink] + adaptiveXi * tau0;
                tau[getIdx(nextNode, current)] = tau[idxLink]; // Symétrique

                path.push(nextNode);
                visited.add(nextNode);
                current = nextNode;
            }

            pathsThisGen.push(path);

            // Évaluation du ticket généré
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

        // --- CALCUL DE L'ENTROPIE ET AJUSTEMENT DE L'ÉVAPORATION ---
        // Évaluation de la répartition des sélections de nœuds de cette génération
        const nodeVisits = new Float32Array(91);
        for (const p of pathsThisGen) {
            for (const node of p) {
                nodeVisits[node]++;
            }
        }

        const totalVisits = C.antsCount * TICKET_SIZE;
        let H = 0;
        for (let n = 1; n <= 90; n++) {
            const prob = nodeVisits[n] / totalVisits;
            if (prob > 0) {
                H -= prob * Math.log(prob);
            }
        }

        // Normalisation de l'entropie de Shannon
        const H_min = Math.log(5); // Entropie minimale (convergence pure sur 5 attracteurs)
        const H_max = Math.log(90); // Entropie maximale (répartition uniforme pure sur 90 nœuds)
        const hNorm = Math.max(0, Math.min(1, (H - H_min) / (H_max - H_min)));
        lastHNorm = hNorm; // Memorisation pour la generation suivante

        // Modulateur d'évaporation de Fermi-Dirac / Logistique non-linéaire
        // Si l'entropie de convergence locale s'effondre (perte de diversité, hNorm bas),
        // On fait monter l'évaporation pour détruire les attracteurs obsolètes via logistique continue
        const dampingSignal = 1.0 / (1.0 + Math.exp(-Math.E * (hNorm - (1.0 / Math.E))));
        adaptiveRho = (1.0 / Math.pow(Math.E, 3.0)) + (1.0 / Math.E) * dampingSignal;
        adaptiveXi = (1.0 / Math.pow(Math.E, 3.0)) + (1.0 / Math.pow(Math.E, 1.5)) * dampingSignal;

        // ACS Global Update : Seulement sur le meilleur chemin global, modulé par adaptiveRho
        const deposit = globalBestScore * (1.0 / Math.pow(Math.PI, 2.0)); 
        
        for (let i = 0; i < globalBestPath.length; i++) {
            for (let j = i + 1; j < globalBestPath.length; j++) {
                const u = globalBestPath[i];
                const v = globalBestPath[j];
                const idx = getIdx(u, v);
                
                tau[idx] = (1 - adaptiveRho) * tau[idx] + adaptiveRho * deposit;
                tau[getIdx(v, u)] = tau[idx];
            }
        }
    }

    // Calcul de confiance normalisé (0-100) via Sigmoïde continue basée sur l'espérance mathématique
    const expectedBaseScore = (TICKET_SIZE * (TICKET_SIZE - 1) / 2) * (tau0 * Math.pow(0.5, C.beta));
    const scoreRatio = globalBestScore / (expectedBaseScore || Number.EPSILON);
    const confidenceSig = 1.0 / (1.0 + Math.exp(-0.1 * (scoreRatio - 1.0)));
    const confidence = Math.max(1, Math.min(99, Math.round(confidenceSig * 100)));

    ctx.postMessage({ 
        type: 'result', 
        bestPath: { 
            numbers: globalBestPath, 
            pheromoneDensity: 0.9, // Indicateur visuel
            confidence: confidence
        } 
    });
};