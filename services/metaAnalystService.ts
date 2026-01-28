
import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  PlatinumCombo,
  ScoreBreakdown
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateShannonEntropy, 
    detectGameRegime,
    calculateRegularity,
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v16.1 - Organic Adaptive Kernel
 * Optimisé pour les datasets "Gagnants Uniquement" et la gestion des amplitudes extrêmes.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    if (cached && (now - cached.ts < 1800000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const deepHistory = history.slice(0, 120);
    
    const masterPred = await generateMasterPrediction(drawName, deepHistory, weights, metrics);
    
    const data = masterPred.breakdown || {};
    
    for (let i = 1; i <= 90; i++) {
        if (!data[i]) {
            data[i] = { 
                frequency: 0, gap: 0, spectral: 0, fractal: 0, markov: 0, 
                wavelet: 0, momentum: 0, orchestration: 0, equilibrium: 50 
            } as any;
        }
    }

    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

/**
 * Calcule les biais optimaux en détectant la présence de données machine 
 * et l'amplitude de la volatilité (Sigma).
 */
export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history);
    
    // Valeurs par défaut
    let stability = 0.35;
    let chaos = 0.4;
    let harmony = 0.45;
    let wavelet = 0.5;
    let orchestration = 0.4;

    // 1. Détection de la densité des données Machine
    let hasMachineData = false;
    const checkDepth = Math.min(history.length, 20);
    let machineDrawsCount = 0;
    
    for(let i=0; i<checkDepth; i++) {
        if(history[i].machine && history[i].machine!.length >= 3) {
            machineDrawsCount++;
        }
    }
    
    // Si moins de 20% des tirages récents ont une machine, on considère le mode "Organique Pur"
    if (machineDrawsCount < (checkDepth * 0.2)) {
        hasMachineData = false;
    } else {
        hasMachineData = true;
    }

    // 2. Ajustement des biais selon le mode
    if (!hasMachineData) {
        // Mode Organique : On tue l'orchestration (qui dépend de la machine) 
        // et on booste le Chaos (pour attraper les écarts) et Wavelet (tendances courtes)
        orchestration = 0.1; 
        chaos = 0.65; // Boost Chaos pour compenser la perte d'info machine
        wavelet = 0.6; // Boost Wavelet pour suivre la "forme" pure des numéros
        stability = 0.45; // Légère hausse de stabilité pour les répétitions simples
    } else {
        // Logique Standard avec analyse des fuites
        // ... (Code existant conservé pour les autres tirages)
        let machineLeakCount = 0;
        let totalMachineChecks = 0;
        for (let i = 0; i < checkDepth - 1; i++) {
            const currentDraw = history[i];
            const prevDraw = history[i+1];
            if (prevDraw.machine && prevDraw.machine.length > 0) {
                const leaks = currentDraw.gagnants.filter(n => prevDraw.machine?.includes(n)).length;
                machineLeakCount += leaks;
                totalMachineChecks += 5;
            }
        }
        const leakageRate = totalMachineChecks > 0 ? (machineLeakCount / totalMachineChecks) : 0;
        if (leakageRate > 0.10) {
            orchestration = 0.7 + (leakageRate * 2);
            chaos -= 0.1;
        }
    }

    // 3. Ajustement sur Volatilité Extrême (Analyse Sigma du CSV fourni)
    // Le CSV montre des sommes variant de 133 à 395. C'est énorme.
    // On doit forcer l'équilibre (Harmony) si la volatilité est trop haute.
    if (vol.score > 70) {
        harmony = 0.8; // Force le retour à la moyenne harmonique
        chaos = Math.min(0.9, chaos + 0.1); // Le chaos est confirmé
    }

    return { 
        stability: parseFloat(stability.toFixed(2)), 
        chaos: parseFloat(chaos.toFixed(2)), 
        harmony: parseFloat(harmony.toFixed(2)), 
        wavelet: parseFloat(wavelet.toFixed(2)), 
        orchestration: parseFloat(orchestration.toFixed(2)) 
    };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias
): Promise<PlatinumResult> {
    if (!history || history.length < 15) throw new Error("Historique insuffisant pour la synthèse.");

    const bias = userBias || calculateOptimalUserBias(drawName, history);
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const regularity = calculateRegularity(history);
    const pool = Object.keys(scores).map(Number);

    // Analyse du dernier tirage pour déterminer la tendance de Somme
    const lastDrawSum = history[0].gagnants.reduce((a,b) => a+b, 0);
    const targetLowSum = lastDrawSum > 280; // Si dernier tirage très haut (ex: 395), on vise bas
    const targetHighSum = lastDrawSum < 160; // Si dernier tirage très bas (ex: 133), on vise haut

    // --- SÉLECTION DES "KING NUMBERS" ---
    
    // 1. Hot Kings (Fréquence pure)
    const hotKings = pool
        .map(n => {
            const localFreq = history.slice(0, 12).filter(d => d.gagnants.includes(n)).length;
            return { num: n, freq: localFreq, val: scores[n] };
        })
        .filter(item => item.freq >= 2)
        .sort((a, b) => (b.val.frequency || 0) - (a.val.frequency || 0))
        .slice(0, 4)
        .map(k => k.num);

    // 2. Corrective Kings (Basés sur l'équilibre de Somme)
    // Si on doit baisser la somme, on prend des petits numéros à fort potentiel
    // Si on doit monter, on prend des grands numéros
    const correctiveKings = pool
        .map(n => ({ num: n, score: scores[n].spectral || 0 }))
        .filter(item => {
            if (targetLowSum) return item.num <= 45; // On cherche des petits
            if (targetHighSum) return item.num > 45; // On cherche des grands
            return true; // Sinon tout
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(k => k.num);

    const kingNumbers = Array.from(new Set([...hotKings, ...correctiveKings])).slice(0, 8);

    const combinations: PlatinumCombo[] = [];

    // --- GÉNÉRATION TOURNOI ---
    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let maxFitness = -Infinity;

        for (let attempt = 0; attempt < 150; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...pool];
            let kingCount = 0;

            while (candidate.length < 5 && tempPool.length > 0) {
                let bestInTournament = -1;
                let topTournamentScore = -Infinity;

                for (let k = 0; k < 10; k++) { 
                    const idx = Math.floor(Math.random() * tempPool.length);
                    const n = tempPool[idx];
                    const b = scores[n];
                    
                    const score = ((b.spectral || 0) * bias.harmony) + 
                                  ((b.momentum || 50) * bias.stability) + 
                                  ((b.gap || 0) * bias.chaos) +
                                  ((b.orchestration || 0) * bias.orchestration); // Orchestration faible si pas de machine

                    if (score > topTournamentScore) {
                        topTournamentScore = score;
                        bestInTournament = n;
                    }
                }

                if (bestInTournament !== -1) {
                    const isKing = kingNumbers.includes(bestInTournament);
                    if (isKing && kingCount >= 3) {
                        tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                        continue;
                    }
                    if (isKing) kingCount++;
                    candidate.push(bestInTournament);
                    tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                }
            }

            candidate.sort((a, b) => a - b);
            
            // --- VALIDATION STRUCTURELLE ADAPTATIVE ---
            const sum = candidate.reduce((a, b) => a + b, 0);
            const ac = calculateACValue(candidate);
            
            // Filtre Sigma dynamique
            if (targetLowSum && sum > 230) continue; // On force la baisse
            if (targetHighSum && sum < 220) continue; // On force la hausse
            if (!targetLowSum && !targetHighSum && (sum < 130 || sum > 320)) continue;

            if (ac < 6) continue; 

            let fitness = candidate.reduce((acc, n) => acc + (scores[n].spectral || 0), 0);
            if (ac >= 8) fitness += 40; 

            if (fitness > maxFitness) {
                maxFitness = fitness;
                bestCombo = candidate;
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(maxFitness / 6)),
            tags: i === 0 ? ["Alpha Fusion"] : i === 1 ? ["Sigma Correctif"] : ["Vecteur Organique"],
            breakdown: { 
                harmony: Math.round(bias.harmony * 100), 
                stability: Math.round(bias.stability * 100), 
                chaos: Math.round(bias.chaos * 100),
                kings: bestCombo.filter(n => kingNumbers.includes(n)).length
            }
        });
    }

    const machineStatus = bias.orchestration < 0.2 ? "OFF" : "ON";
    const sigmaTrend = targetLowSum ? "BAISSIERE" : targetHighSum ? "HAUSSIERE" : "NEUTRE";

    return {
        id: crypto.randomUUID(),
        kingNumbers: kingNumbers.map(n => ({ 
            number: n, 
            count: hotKings.includes(n) ? 2 : 1 
        })), 
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: Math.round(combinations[0].score * 0.95),
        analysis: `Mode Organique (Machine ${machineStatus}). Correction Sigma ${sigmaTrend} activée suite à la volatilité récente.`,
        drawName,
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existingStr = localStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 10)));
};
