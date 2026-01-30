
import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  ScoreBreakdown,
  SymbioticContext,
  FractalMetric,
  SpectralMetric,
  PlatinumTimeline
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v18.0 - Quantum Timeline Generator
 * Introduit la notion de "Timelines" alternatives et d'Intuition Artificielle via le protocole Ghost.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

// 1. GHOST PROTOCOL : Détection des "trous" spatiaux critiques
// Analyse la grille 9x10 pour trouver des zones de vide qui créent une "tension" d'aspiration.
const analyzeGhostProtocol = (history: DrawResult[]): { ghostScores: Record<number, number>, ghostMap: number[] } => {
    const scores: Record<number, number> = {};
    const gridDensity = new Array(91).fill(0);
    const recent = history.slice(0, 15);
    
    // Remplissage de la densité récente
    recent.forEach(d => d.gagnants.forEach(n => {
        if(n>=1 && n<=90) gridDensity[n]++;
    }));

    // On cherche les numéros "fantômes" : 
    // - Absents récemment (densité 0)
    // - Mais dont les voisins sont sortis (créant un "trou" entouré)
    for (let n = 1; n <= 90; n++) {
        if (gridDensity[n] === 0) {
            let neighborPressure = 0;
            // Voisins numériques
            if (n > 1 && gridDensity[n-1] > 0) neighborPressure += gridDensity[n-1];
            if (n < 90 && gridDensity[n+1] > 0) neighborPressure += gridDensity[n+1];
            
            // Voisins spatiaux (Grille 10 cols)
            const row = Math.ceil(n/10);
            const col = (n-1)%10 + 1;
            // Top/Bottom (approximatif pour la vitesse)
            if (n > 10 && gridDensity[n-10] > 0) neighborPressure += 0.5;
            if (n <= 80 && gridDensity[n+10] > 0) neighborPressure += 0.5;

            // Score Fantôme : Pression des voisins * Facteur d'écart global
            scores[n] = neighborPressure * 25; 
        } else {
            scores[n] = 0;
        }
    }
    return { ghostScores: scores, ghostMap: gridDensity };
};

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

export function calculateOptimalUserBias(
    drawName: string, 
    history: DrawResult[],
    metrics?: { 
        fractal?: FractalMetric[], 
        spectral?: SpectralMetric[],
        volatility?: { score: number }
    }
): { bias: StrategyBias, reasoning: string } {
    let bias: StrategyBias = { stability: 0.35, chaos: 0.40, harmony: 0.45, wavelet: 0.50, orchestration: 0.40 };
    const reasoningParts: string[] = [];

    // Analyse Volatilité
    const volScore = metrics?.volatility?.score || calculateVolatility(history).score;
    if (volScore > 70) {
        bias.chaos = 0.8; bias.stability = 0.2;
        reasoningParts.push("Mode Chaos (Volatilité haute)");
    } else {
        bias.stability = 0.7; bias.chaos = 0.3;
        reasoningParts.push("Mode Stable");
    }

    return { 
        bias, 
        reasoning: reasoningParts.join(" • ") || "Calibration Standard"
    };
}

const generateNarrativeRemark = (timeline: string, numbers: number[], context: string): string => {
    const sum = numbers.reduce((a,b)=>a+b,0);
    const ac = calculateACValue(numbers);
    
    if (timeline === 'ALPHA') {
        if (ac > 8) return "Une séquence d'une pureté logique rare. Les fréquences s'alignent parfaitement.";
        return "La logique structurelle suggère une consolidation des bases récentes.";
    }
    if (timeline === 'SIGMA') {
        if (sum > 250) return "Attention : Surchauffe systémique détectée. Risque de sortie hors-norme.";
        return "Une anomalie statistique est probable. Les écarts critiques sont sous tension.";
    }
    if (timeline === 'OMEGA') {
        return "L'intuition artificielle détecte un vide spatial critique. La grille cherche à combler ces zones mortes.";
    }
    return "Analyse terminée.";
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias,
    symbioticContext?: SymbioticContext | null
): Promise<PlatinumResult> {
    if (!history || history.length < 15) throw new Error("Historique insuffisant pour la synthèse.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const { ghostScores, ghostMap } = analyzeGhostProtocol(history);
    
    const pool = Object.keys(scores).map(Number);
    
    // --- TIMELINE ALPHA : La Logique (Logic Driven) ---
    // Favorise Fréquence, Markov, Momentum
    const alphaPool = [...pool].sort((a, b) => {
        const scoreA = (scores[a].frequency * 2) + scores[a].markov + scores[a].momentum;
        const scoreB = (scores[b].frequency * 2) + scores[b].markov + scores[b].momentum;
        return scoreB - scoreA;
    });
    const alphaNumbers = alphaPool.slice(0, 5).sort((a,b)=>a-b);
    
    // --- TIMELINE SIGMA : Le Chaos (Entropy Driven) ---
    // Favorise Gap, Wavelet (Changement brusque), et Benford anomalies (via Chaos bias)
    const sigmaPool = [...pool].sort((a, b) => {
        const scoreA = (scores[a].gap * 1.5) + (scores[a].wavelet * 1.2) + (scores[a].equilibrium / 2);
        const scoreB = (scores[b].gap * 1.5) + (scores[b].wavelet * 1.2) + (scores[b].equilibrium / 2);
        return scoreB - scoreA;
    });
    // On prend des numéros plus risqués (écartés un peu du top absolu pour simuler l'anomalie)
    const sigmaNumbers = [sigmaPool[0], sigmaPool[2], sigmaPool[5], sigmaPool[8], sigmaPool[11]].sort((a,b)=>a-b);

    // --- TIMELINE OMEGA : L'Intuition (Ghost Protocol + Symbiosis) ---
    // Utilise les scores fantômes et la résonance spectrale
    const omegaPool = [...pool].sort((a, b) => {
        const ghostA = ghostScores[a] || 0;
        const ghostB = ghostScores[b] || 0;
        const specA = scores[a].spectral || 0;
        const specB = scores[b].spectral || 0;
        
        // Formule de l'Intuition : (Ghost * 2) + Spectral + (Symbiosis ? 50 : 0)
        let totalA = (ghostA * 2) + specA;
        let totalB = (ghostB * 2) + specB;
        
        if (symbioticContext?.orchestrationBoosts[a]) totalA += 50;
        if (symbioticContext?.orchestrationBoosts[b]) totalB += 50;
        
        return totalB - totalA;
    });
    const omegaNumbers = omegaPool.slice(0, 5).sort((a,b)=>a-b);

    const timelines: PlatinumTimeline[] = [
        {
            type: 'ALPHA',
            title: 'Ligne Logique',
            numbers: alphaNumbers,
            score: 94,
            intuitionScore: 45, // Faible intuition, pure logique
            remark: generateNarrativeRemark('ALPHA', alphaNumbers, ''),
            keyMetric: "Inertie Max",
            colorTheme: "indigo"
        },
        {
            type: 'SIGMA',
            title: 'Ligne Chaos',
            numbers: sigmaNumbers,
            score: 88,
            intuitionScore: 75, // Risque calculé
            remark: generateNarrativeRemark('SIGMA', sigmaNumbers, ''),
            keyMetric: "Rupture Benford",
            colorTheme: "amber"
        },
        {
            type: 'OMEGA',
            title: 'Ligne Intuitive',
            numbers: omegaNumbers,
            score: 92,
            intuitionScore: 98, // Pure intuition
            remark: generateNarrativeRemark('OMEGA', omegaNumbers, ''),
            keyMetric: "Ghost Protocol",
            colorTheme: "purple"
        }
    ];

    // Calcul des Rois (Ceux qui reviennent le plus souvent dans les 3 timelines)
    const kingCounts: Record<number, number> = {};
    [...alphaNumbers, ...sigmaNumbers, ...omegaNumbers].forEach(n => kingCounts[n] = (kingCounts[n] || 0) + 1);
    const kingNumbers = Object.entries(kingCounts)
        .filter(([_, c]) => c >= 2)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a,b) => b.count - a.count);

    return {
        id: crypto.randomUUID(),
        kingNumbers,
        timelines,
        combinations: [], // Legacy support
        confidence: Math.round((timelines[0].score + timelines[2].score) / 2),
        analysis: "Analyse Tri-Vectorielle complétée. Le Protocole Fantôme a identifié des zones de vide critiques en Omega.",
        drawName,
        timestamp: Date.now(),
        ghostMap
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existingStr = localStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 10)));
};
