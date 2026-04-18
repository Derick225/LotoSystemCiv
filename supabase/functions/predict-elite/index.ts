import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// CONSTANTES MATHÉMATIQUES (CORS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- MOTEUR DE CALCUL LOURD (EDGE COMPUTE) ---

// 1. Math Tools
const factorial = (n: number): number => {
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
};

// P(k; λ) = (e^(-λ) * λ^k) / k!
const calculatePoisson = (k: number, lambda: number): number => {
    if (k > 20) return 0; // Prevent Infinity
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
};

// 2. Extracteur de Caractéristiques (Feature Extraction)
const extractFeatures = (history: any[], maxNum: number = 50) => {
    const freq = new Map<number, number>();
    const lastSeen = new Map<number, number>();
    const markovMatrix = new Map<number, Map<number, number>>();

    history.forEach((draw, drawIndex) => {
        const nums = draw.gagnants || [];
        nums.forEach((n: number) => {
            if (n > maxNum) maxNum = Math.max(maxNum, n); // Auto-scale max numbers
            
            // Frequencies
            freq.set(n, (freq.get(n) || 0) + 1);
            
            // Last Seen (Gap)
            if (!lastSeen.has(n)) lastSeen.set(n, drawIndex);

            // Markov Transitions
            if (!markovMatrix.has(n)) markovMatrix.set(n, new Map());
            const transitions = markovMatrix.get(n)!;
            nums.forEach((nextN: number) => {
                if (n !== nextN) {
                    transitions.set(nextN, (transitions.get(nextN) || 0) + 1);
                }
            });
        });
    });

    return { freq, lastSeen, markovMatrix, maxNum };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { history, weights, riskProfile, drawName, symbioticContext, metrics } = await req.json();

    if (!history || history.length < 5) {
      throw new Error("Dataset insuffisant pour convergence dans le Cloud.");
    }

    console.log(`[EDGE COMPUTE] Inférence LotoPro Platinum pour ${drawName}`);
    console.log(`[EDGE COMPUTE] Poids injectés:`, Object.keys(weights || {}).length);
    
    // 1. Analyse profonde de l'historique
    const totalDraws = history.length;
    const { freq, lastSeen, markovMatrix, maxNum } = extractFeatures(history, drawName.includes('EuroMillions') ? 50 : 49);

    // 2. Moteur de Scoring Vectoriel
    const masterScores: any[] = [];
    
    // Tuning des paramètres selon Profil
    const noiseMultiplier = riskProfile === 'CHAOS' ? 1.5 : riskProfile === 'PRUDENT' ? 0.05 : 0.5;

    for (let num = 1; num <= maxNum; num++) {
        const breakdown: Record<string, number> = {};
        
        // --- ALGO 1: POISSON ---
        const expectedLambda = (freq.get(num) || 0) / totalDraws; 
        const currentGap = lastSeen.get(num) || totalDraws;
        const poissonProb = 1 - calculatePoisson(0, expectedLambda * currentGap); // Prob that it should have appeared
        breakdown['poisson'] = poissonProb * 100;

        // --- ALGO 2: MARKOV (Attracteurs locaux) ---
        let markovScore = 0;
        if (history[0] && history[0].gagnants) {
            history[0].gagnants.forEach((lastWinner: number) => {
                const transitions = markovMatrix.get(lastWinner);
                if (transitions && transitions.has(num)) {
                    markovScore += (transitions.get(num) || 0);
                }
            });
        }
        breakdown['markov'] = Math.min(100, markovScore * 5); // Normalisation arbitraire

        // --- ALGO 3: GAP VELOCITY (Momentum) ---
        const fGet = freq.get(num);
        const avgGap = fGet && fGet > 0 ? (totalDraws / fGet) : totalDraws;
        const gapVelocity = currentGap / avgGap; 
        breakdown['gap_velocity'] = Math.min(100, gapVelocity * 20);

        // --- ALGO 4: RÉSONANCE CLOUD (Bruit & Fractal simulé) ---
        breakdown['fractal'] = (metrics?.fractal?.[num] || 0) + (Math.random() * 10 * noiseMultiplier);
        
        // --- SYNTHÈSE (Application des Poids) ---
        let finalScore = 0;
        const wPoisson = weights?.poisson || 0.2;
        const wMarkov = weights?.markov || 0.2;
        const wGap = weights?.gap_velocity || 0.2;
        const wFractal = weights?.fractal || 0.2;

        finalScore = (breakdown['poisson'] * wPoisson) + 
                     (breakdown['markov'] * wMarkov) + 
                     (breakdown['gap_velocity'] * wGap) + 
                     (breakdown['fractal'] * wFractal) + 
                     breakdown['fractal']; // Addition to ensure variance
        
        // Boost spatial (Symbiose)
        if (symbioticContext?.spatialHotZones?.includes(num)) {
            finalScore *= 1.15; // 15% boost
        }

        masterScores.push({ num, score: finalScore, breakdown });
    }

    // 3. Tri et Combinaison (avec anti-ex-aequo)
    const sortedScores = masterScores.sort((a, b) => b.score - a.score || Math.random() - 0.5);
    const outsiderCount = riskProfile === 'CHAOS' ? 4 : riskProfile === 'AUDACIOUS' ? 3 : riskProfile === 'PRUDENT' ? 0 : 2;
    
    // Sélection (Favoris + Outsiders en fonction du profil)
    const suggestedNumbers = [
        ...sortedScores.slice(0, 5 - outsiderCount).map(s => s.num),
        ...sortedScores.slice(10, 10 + outsiderCount).map(s => s.num) // Piquer dans le ventre mou pour les outsiders
    ].sort((a,b)=>a-b);

    const candidates = sortedScores.slice(5, 15).map(s => s.num);
    const confidence = Math.min(99, Math.round(sortedScores.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5));

    const prediction = {
        suggestedNumbers,
        candidates,
        confidence,
        analysis: `Généré en [EDGE CLOUD COMPUTING]. Poisson, Markov et Gap intégrés. Profil: ${riskProfile}.`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment: 0
    };

    return new Response(JSON.stringify(prediction), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[EDGE ERROR]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
