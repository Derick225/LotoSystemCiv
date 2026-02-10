
import { DrawResult, DetectedPattern, PatternType, OrchestrationMetrics, MimicryMetric, ScoreComposition } from '../types';
import { calculateSuccessionMatrixAsync, calculateACValue } from './mathService';

export interface OrchestrationConfig {
    lambdaDecay: number; 
    echoDecay: number;   
    machineBoost: number; 
    mirrorBoost: number;  
}

const DEFAULT_CONFIG: OrchestrationConfig = {
    lambdaDecay: 0.1,
    echoDecay: 0.1,
    machineBoost: 30,
    mirrorBoost: 20
};

const getMirror = (n: number): number | null => {
    if (n < 1 || n > 90) return null;
    const mirror = 91 - n; // Miroir Loto Standard (1 <-> 90, 2 <-> 89...)
    return (mirror !== n && mirror >= 1 && mirror <= 90) ? mirror : null;
};

export interface ImmediateLesson {
    pattern: PatternType;
    description: string;
    impactScore: number;
}

/**
 * Analyse le mimétisme séquentiel sur les 3 derniers tirages (T vs T-1, T vs T-2).
 * Détecte les répétitions exactes et les effets de voisinage immédiat.
 */
export const analyzeShortTermMimicry = (history: DrawResult[]): MimicryMetric[] => {
    if (history.length < 3) return [];
    
    const t0 = history[0]; // Dernier tirage connu (pour analyse backtest) ou base de projection
    // Pour projection future, T est inconnu. Cette fonction compare T(dernier) avec T-1 et T-2.
    // Elle sert à dire "Voici ce qui s'est passé récemment".
    
    // Si on veut prédire pour T+1, on regarde les comportements récents.
    
    const metrics: MimicryMetric[] = [];
    const recentWinners = [...new Set([...history[0].gagnants, ...history[1].gagnants])]; // Pool d'analyse

    recentWinners.forEach(n => {
        let score = 0;
        let type: string = 'Complexe';
        let sourceSet = new Set<string>();

        // Analyse sur les 5 derniers tirages pour détecter les cycles courts
        for(let i=1; i<=5; i++) {
            const pastDraw = history[i];
            if(!pastDraw) continue;

            if (pastDraw.gagnants.includes(n)) { 
                score += (60 / i); // Décroissance rapide
                type = i === 1 ? 'Répétition' : 'Lag'; 
                sourceSet.add(`T-${i}`); 
            } 
            else if (pastDraw.gagnants.includes(n-1) || pastDraw.gagnants.includes(n+1)) { 
                score += (20 / i); 
                if(type === 'Complexe') type = 'Voisin'; 
                sourceSet.add(`T-${i}`); 
            }
            
            // Check Machine
            if (pastDraw.machine && pastDraw.machine.includes(n)) {
                score += (40 / i);
                type = 'Machine';
                sourceSet.add(`Mac-${i}`);
            }
        }

        if (score > 15) {
            metrics.push({ 
                number: n, 
                score: Math.round(score), 
                type: type, 
                sourceDraw: Array.from(sourceSet).slice(0, 2).join(' & ') 
            });
        }
    });

    return metrics.sort((a,b) => b.score - a.score);
};

export const calculateOrchestrationScores = (history: DrawResult[], config: OrchestrationConfig = DEFAULT_CONFIG): Record<number, number> => {
    const scores: Record<number, number> = {};
    if (history.length < 3) return scores;

    // Pondération temporelle : T-1 a plus d'impact que T-2
    const weights = [1.0, 0.6, 0.3];

    for(let i=0; i<3 && i < history.length; i++) {
        const draw = history[i];
        const w = weights[i];
        
        const winners = draw.gagnants;
        const machine = draw.machine || [];

        // 1. Machine Leakage : Les numéros machine tendent à devenir gagnants
        machine.forEach(m => scores[m] = (scores[m] || 0) + (config.machineBoost * w)); 
        
        winners.forEach(winner => {
            // 2. Miroirs (Symétrie 91)
            const mirror = getMirror(winner);
            if (mirror) scores[mirror] = (scores[mirror] || 0) + (config.mirrorBoost * w);
            
            // 3. Voisins (+/- 1)
            const nLeft = winner > 1 ? winner - 1 : 90;
            const nRight = winner < 90 ? winner + 1 : 1;
            scores[nLeft] = (scores[nLeft] || 0) + (15 * w);
            scores[nRight] = (scores[nRight] || 0) + (15 * w);

            // 4. Répétition (Inertie) - Faible poids car la répétition immédiate est rare
            scores[winner] = (scores[winner] || 0) + (10 * w);
        });
    }

    return scores;
};

export const analyzeImmediateTrend = (history: DrawResult[]): { lessons: ImmediateLesson[] } => {
    const lessons: ImmediateLesson[] = [];
    if (history.length < 5) return { lessons };
    
    // Analyse Machine -> Winner sur les 10 derniers tirages
    let machineTransferCount = 0;
    let mirrorCount = 0;
    let neighborCount = 0;
    const depth = Math.min(history.length - 1, 10); 

    for(let i=0; i<depth; i++) {
        const draw = history[i];
        const prev = history[i+1];
        
        if (prev?.machine) {
            const hits = draw.gagnants.filter(n => prev.machine?.includes(n));
            machineTransferCount += hits.length;
        }
        
        draw.gagnants.forEach(n => {
            const mir = getMirror(n);
            if (mir && prev.gagnants.includes(mir)) mirrorCount++;
            if (prev.gagnants.includes(n-1) || prev.gagnants.includes(n+1)) neighborCount++;
        });
    }
    
    const transferRate = machineTransferCount / (depth * 5); // % des gagnants venant de la machine précédente
    
    if (transferRate > 0.08) { // 8% est significatif (statistiquement ~1%)
        lessons.push({ 
            pattern: 'Transfert Machine', 
            description: `Canal Machine Ouvert : ${(transferRate*100).toFixed(0)}% des gagnants proviennent de la Machine T-1.`, 
            impactScore: Math.min(90, transferRate * 500)
        });
    }

    if (mirrorCount > depth) {
        lessons.push({
            pattern: 'Miroir',
            description: `Symétrie active : Effet miroir (91-n) fréquent sur les 10 derniers tirages.`,
            impactScore: 60
        });
    }

    if (neighborCount > depth * 1.5) {
        lessons.push({
            pattern: 'Voisin',
            description: `Glissement : Les numéros tendent à sortir à +/- 1 de leur position précédente.`,
            impactScore: 50
        });
    }

    return { lessons: lessons.sort((a,b) => b.impactScore - a.impactScore) };
};

const calculateCoherence = (numbers: number[]): number => {
    if (numbers.length < 2) return 0;
    const ac = calculateACValue(numbers);
    let acScore = 0;
    // AC Idéal pour 5 numéros : entre 7 et 9
    if (ac >= 7 && ac <= 9) acScore = 100;
    else if (ac === 6 || ac === 10) acScore = 60;
    else acScore = 20;

    // Spread (Écart max)
    const sorted = [...numbers].sort((a,b)=>a-b);
    const spread = sorted[sorted.length-1] - sorted[0];
    const spreadScore = (spread > 40 && spread < 85) ? 100 : 40;

    return Math.round((acScore * 0.6) + (spreadScore * 0.4));
};

export const getFullOrchestrationAnalysis = async (drawName: string, history: DrawResult[]): Promise<OrchestrationMetrics & { candidatesDetails: Record<number, ScoreComposition> }> => {
    
    // 1. Calcul des Scores Vectoriels (Physique)
    // On réutilise la logique de calculateOrchestrationScores mais en isolant les composantes
    const structuralScores: Record<number, number> = {};
    const machineScores: Record<number, number> = {};
    const trendScores: Record<number, number> = {};
    
    const weights = [1.0, 0.6, 0.3]; // T-1, T-2, T-3

    for(let i=0; i<3 && i < history.length; i++) {
        const draw = history[i];
        const w = weights[i];
        
        // Machine
        (draw.machine || []).forEach(m => machineScores[m] = (machineScores[m] || 0) + (30 * w));
        
        draw.gagnants.forEach(winner => {
            // Trend (Répétition)
            trendScores[winner] = (trendScores[winner] || 0) + (10 * w);
            
            // Structure (Miroir/Voisin)
            const mirror = getMirror(winner);
            if (mirror) structuralScores[mirror] = (structuralScores[mirror] || 0) + (20 * w);
            
            const nLeft = winner > 1 ? winner - 1 : 90;
            const nRight = winner < 90 ? winner + 1 : 1;
            structuralScores[nLeft] = (structuralScores[nLeft] || 0) + (15 * w);
            structuralScores[nRight] = (structuralScores[nRight] || 0) + (15 * w);
        });
    }

    // 2. Scores Markov (Successions Probabilistes)
    const { matrix, totals } = await calculateSuccessionMatrixAsync(history); 
    const markovScores: Record<number, number> = {};
    const lastWinners = history[0].gagnants;

    lastWinners.forEach(leader => {
        const followersMap = matrix[leader] || {};
        const total = totals[leader] || 1;
        Object.entries(followersMap).forEach(([fStr, count]) => {
            const follower = parseInt(fStr);
            const prob = (count as number) / total;
            // On ne garde que les probabilités significatives pour réduire le bruit
            if (prob > 0.08) { 
                markovScores[follower] = (markovScores[follower] || 0) + (prob * 200);
            }
        });
    });

    // 3. Agrégation & Synthèse
    const finalScores: Record<number, number> = {};
    const candidatesDetails: Record<number, ScoreComposition> = {};

    for (let i = 1; i <= 90; i++) {
        const s = (structuralScores[i] || 0);
        const m = (markovScores[i] || 0);
        const mac = (machineScores[i] || 0);
        const t = (trendScores[i] || 0);
        
        const total = s + m + mac + t;
        if (total > 15) { // Filtre bruit
            finalScores[i] = total;
            candidatesDetails[i] = {
                structural: Math.round(s),
                markov: Math.round(m),
                machine: Math.round(mac),
                trend: Math.round(t)
            };
        }
    }

    const trend = analyzeImmediateTrend(history);
    const activePatterns: DetectedPattern[] = trend.lessons.map(l => ({ 
        type: l.pattern, 
        count: 1, 
        impact: l.impactScore / 10 
    }));

    const topCandidates = Object.entries(finalScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 18)
        .map(([numStr, score]) => {
            const num = Number(numStr);
            const reasons: string[] = [];
            const details = candidatesDetails[num];

            if (details.machine > 20) reasons.push("Canal Machine");
            if (details.structural > 20) reasons.push("Symétrie T-1");
            if (details.markov > 30) reasons.push("Suite Logique");
            if (details.trend > 10) reasons.push("Inertie");

            if (reasons.length === 0) reasons.push("Résonance faible");

            return { number: num, score: Math.round(score), reasons };
        });

    // Backtest Rapide (Validation de la stratégie sur les 10 derniers tirages)
    let hits = 0;
    let totalChecks = 0;
    const testSample = history.slice(1, 11); 
    
    testSample.forEach((targetDraw, idx) => {
        const subHistory = history.slice(idx + 2); // Contexte au moment du tirage passé
        if (subHistory.length > 5) {
            const subScores = calculateOrchestrationScores(subHistory);
            const candidates = Object.entries(subScores).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => Number(e[0]));
            hits += targetDraw.gagnants.filter(n => candidates.includes(n)).length;
            totalChecks += 5; 
        }
    });
    
    const accuracyScore = Math.min(100, Math.round((totalChecks > 0 ? hits / totalChecks : 0) * 400)); // Facteur 4 pour normaliser ~25% hit rate à 100% score
    const top5 = topCandidates.slice(0, 5).map(c => c.number);
    const coherence = calculateCoherence(top5);
    
    const globalScore = Math.round((accuracyScore * 0.4) + (coherence * 0.4) + (Math.min(100, topCandidates[0]?.score || 0 / 2) * 0.2));

    return { 
        globalScore, 
        activePatterns, 
        topCandidates, 
        backtestAccuracy: accuracyScore, 
        narrativeLesson: trend.lessons[0]?.description || `Cohérence harmonique du Top 5 : ${coherence}%.`,
        candidatesDetails
    };
};
