import { z } from "zod";
import { createClient } from 'supabase';
import { corsHeaders } from "../../_shared/cors.ts";

// --- STRUCTURES & SCHÉMAS STRICTS DE SÉCURITÉ ---
const DrawResultSchema = z.object({
  date: z.string().optional().nullable(),
  gagnants: z.array(z.number().int().min(1).max(90)).length(5),
  machine: z.union([z.array(z.number().int().min(1).max(90)), z.string()]).optional().nullable(),
});

const PredictionRequestSchema = z.object({
  drawName: z.string(),
  history: z.array(DrawResultSchema).min(12, "Dataset de moins de 12 tirages insuffisant pour une inférence robuste."),
  weights: z.record(z.number()).optional(),
  symbioticContext: z.object({
    spatialHotZones: z.array(z.number()).optional()
  }).optional(),
  metrics: z.object({
    fractal: z.record(z.number()).optional()
  }).optional()
});

interface ThermoState {
  cryo: number;
  stable: number;
  volatile: number;
  chaotic: number;
}

interface FeatureVector {
  repeatShort: number;
  machineTransfer: number;
  neighbor: number;
  mirror: number;
  markov: number;
  trend: number;
  seasonal: number;
  structuralCoherence: number;
}

// --- UTILITAIRES MATHÉMATIQUES & STATISTIQUES ---

const parseMachineWinners = (machineVal: any): number[] => {
  if (!machineVal) return [];
  if (Array.isArray(machineVal)) {
    return machineVal.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 90);
  }
  if (typeof machineVal === 'string') {
    return machineVal.split(/[\s,;-]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 90);
  }
  return [];
};

const getGridPos = (val: number) => {
  const row = Math.floor((val - 1) / 10);
  const col = (val - 1) % 10;
  return { row, col };
};

const calculateDistance = (a: number, b: number): number => {
  const posA = getGridPos(a);
  const posB = getGridPos(b);
  return Math.sqrt(Math.pow(posA.row - posB.row, 2) + Math.pow(posA.col - posB.col, 2));
};

const calculateACValue = (numbers: number[]): number => {
  if (numbers.length < 2) return 0;
  const diffs = new Set<number>();
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      diffs.add(Math.abs(numbers[i] - numbers[j]));
    }
  }
  return diffs.size - (numbers.length - 1);
};

const calculateCoherence = (numbers: number[]): number => {
  if (numbers.length < 2) return 0;
  const meanAC = 9.66;
  const stdAC = 0.64;
  const meanAmplitude = 58.9;
  const stdAmplitude = 13.5;

  const sorted = [...numbers].sort((a, b) => a - b);
  const ac = calculateACValue(sorted);
  const amplitude = sorted[sorted.length - 1] - sorted[0];

  const acZ = (ac - meanAC) / Math.max(Number.EPSILON, stdAC);
  const acScore = 100 * Math.exp(-0.5 * Math.pow(acZ, 2));

  const ampZ = (amplitude - meanAmplitude) / Math.max(Number.EPSILON, stdAmplitude);
  const ampScore = 100 * Math.exp(-0.5 * Math.pow(ampZ, 2));

  return Math.round((acScore * 0.5) + (ampScore * 0.5));
};

const calculateFastHurst = (signal: number[]): number => {
  const N = signal.length;
  if (N < 20) return 0.5;

  const meanVal = signal.reduce((a, b) => a + b, 0) / N;
  const y = signal.map(s => s - meanVal);

  let currentSum = 0;
  let maxCum = -Infinity;
  let minCum = Infinity;
  
  for (let i = 0; i < N; i++) {
    currentSum += y[i];
    if (currentSum > maxCum) maxCum = currentSum;
    if (currentSum < minCum) minCum = currentSum;
  }
  
  const R = maxCum - minCum;
  const variance = signal.reduce((sum, s) => sum + Math.pow(s - meanVal, 2), 0) / N;
  const S = Math.sqrt(variance);
  
  if (R === 0 || S === 0) return 0.5;
  const hurst = Math.log(R / S) / Math.log(N / 2);
  return Math.max(0.01, Math.min(0.99, hurst));
};

const calculateFractalIndex = (history: any[]): number => {
  const limit = Math.min(history.length, 100);
  const sums = [];
  for (let i = 0; i < limit; i++) {
    let s = 0;
    const w = history[i].gagnants;
    for (let j = 0; j < w.length; j++) s += w[j];
    sums.push(s);
  }
  return calculateFastHurst(sums);
};

const calculateShannonEntropy = (history: any[]): { normalized: number } => {
  if (history.length === 0) return { normalized: 0 };
  
  const freq = new Float32Array(91);
  let total = 0;
  
  for (const d of history) {
    for (const n of d.gagnants) {
      if (n >= 1 && n <= 90) {
        freq[n]++;
        total++;
      }
    }
  }
  
  if (total === 0) return { normalized: 0 };
  
  let entropy = 0;
  for (let i = 1; i <= 90; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / total;
      entropy -= p * Math.log2(p);
    }
  }
  
  const maxEntropy = Math.log2(90); 
  return { normalized: entropy / maxEntropy };
};

const detectThermoStatisticalRegime = (history: any[]): ThermoState => {
  const defaultState = { cryo: 0.25, stable: 0.25, volatile: 0.25, chaotic: 0.25 };
  if (history.length < 5) return defaultState;
  
  const limit = Math.min(history.length, 50);
  const h = calculateFractalIndex(history);
  const e = calculateShannonEntropy(history.slice(0, limit)).normalized;
  
  const sums = history.slice(0, limit).map(d => d.gagnants.reduce((a: number, b: number) => a + b, 0));
  const meanSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const stdSum = Math.sqrt(sums.reduce((a, b) => a + Math.pow(b - meanSum, 2), 0) / sums.length) || 1;
  
  const expectedVar = 5 * (90 * 90 - 1) / 12 * (90 - 5) / (90 - 1);
  const expectedStdSum = Math.sqrt(expectedVar);
  
  const temp = 1.0 / (1.0 + Math.exp(-(1.0 / expectedStdSum) * (stdSum - expectedStdSum))); 

  const eVcryo = Math.exp((1.0 - temp) + (1.0 - e) + h); 
  const eVstable = Math.exp((1.0 - 2.0 * Math.abs(temp - 0.5)) + (1.0 - 2.0 * Math.abs(e - 0.5)));
  const eVvolatile = Math.exp(temp + h); 
  const eVchaotic = Math.exp(temp + e + (1.0 - h));
  
  const partitionFunction = eVcryo + eVstable + eVvolatile + eVchaotic;
  
  return {
    cryo: eVcryo / partitionFunction,
    stable: eVstable / partitionFunction,
    volatile: eVvolatile / partitionFunction,
    chaotic: eVchaotic / partitionFunction
  };
};

const calculateAdaptiveHalfLife = (history: any[], thermoState: ThermoState): number => {
  if (history.length < 10) return 15.0;
  
  const allGaps: number[] = [];
  const lastSeen = new Map<number, number>();
  for (let i = 0; i < Math.min(50, history.length); i++) {
    for (const n of history[i].gagnants) {
      if (lastSeen.has(n)) {
        allGaps.push(i - (lastSeen.get(n) as number));
      }
      lastSeen.set(n, i);
    }
  }
  
  const sortedGaps = allGaps.sort((a, b) => a - b);
  const medianGap = sortedGaps.length > 0 
    ? sortedGaps[Math.floor(sortedGaps.length / 2)] 
    : 15.0;

  const regimeMultiplier = 1.0 + (thermoState.cryo * 1.5) + (thermoState.stable * 0.5) - (thermoState.chaotic * 0.8);
  return Math.max(2.0, medianGap * regimeMultiplier);
};

// Parsing de date déterministe
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// Recherche du tirage jumeau pour la récurrence mensuelle
const findTwinDraw = (history: any[], currentDate: Date, yearsAgo: number): any | null => {
  const targetMonth = currentDate.getMonth();
  const targetDay = currentDate.getDate();
  const targetYear = currentDate.getFullYear() - yearsAgo;
  const toleranceDays = 3;
  
  for (let i = 1; i < history.length; i++) {
    const draw = history[i];
    const drawDate = parseDate(draw.date);
    if (!drawDate) continue;
    
    if (drawDate.getFullYear() === targetYear && drawDate.getMonth() === targetMonth) {
      if (Math.abs(drawDate.getDate() - targetDay) <= toleranceDays) {
        return draw;
      }
    }
  }
  return null;
};

// --- BASE DE DONNÉES / MÉMOIRE DE PERFORMANCE COGNITIVE (REQ B) ---

const getPerformanceMemoryByRegime = async (supabase: any, drawName: string) => {
  const stats = {
    stable: { hits: 0, count: 0 },
    volatile: { hits: 0, count: 0 },
    chaotic: { hits: 0, count: 0 },
    cryo: { hits: 0, count: 0 }
  };

  try {
    const { data, error } = await supabase
      .from('predictions')
      .select(`
        prediction,
        draw_results (
          gagnants
        )
      `)
      .eq('draw_name', drawName)
      .not('draw_result_id', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error || !data) {
      console.log("[PERF MEMORY] Pas d'historique de performances, initialisation par défaut.");
      return stats;
    }

    data.forEach((row: any) => {
      const pred = row.prediction;
      const winners = row.draw_results?.gagnants;
      if (!pred || !winners || !Array.isArray(winners) || !Array.isArray(pred.suggestedNumbers)) return;

      const regime = pred.regime || "stable";
      const hits = pred.suggestedNumbers.filter((n: number) => winners.includes(n)).length;

      if (stats[regime as keyof typeof stats]) {
        stats[regime as keyof typeof stats].hits += hits;
        stats[regime as keyof typeof stats].count += 1;
      }
    });

    console.log("[PERF MEMORY] Performances empiriques chargées :", stats);
  } catch (err) {
    console.error("[PERF MEMORY] Erreur de chargement des performances :", err);
  }

  return stats;
};

// --- SENSING ENGINE (SÉPARATION SIGNAL / HEURISTIQUE) ---

const extractSignals = (history: any[], adaptiveHalfLife: number, lookBack: number, timeDecay: number): Record<number, FeatureVector> => {
  const rawFeatures: Record<number, FeatureVector> = {};
  const totalDraws = history.length;
  
  const lastSeen = new Map<number, number>();
  const appearances = new Map<number, number>();
  const shortAppearances = new Map<number, number>();

  history.forEach((draw, idx) => {
    draw.gagnants.forEach((num: number) => {
      if (!lastSeen.has(num)) lastSeen.set(num, idx);
      appearances.set(num, (appearances.get(num) || 0) + 1);
      if (idx < 10) {
        shortAppearances.set(num, (shortAppearances.get(num) || 0) + 1);
      }
    });
  });

  const averageCycles = new Map<number, number>();
  for (let num = 1; num <= 90; num++) {
    const indices: number[] = [];
    history.forEach((draw, idx) => {
      if (draw.gagnants.includes(num)) indices.push(idx);
    });
    if (indices.length > 1) {
      let sumGaps = 0;
      for (let j = 0; j < indices.length - 1; j++) {
        sumGaps += (indices[j + 1] - indices[j]);
      }
      averageCycles.set(num, sumGaps / (indices.length - 1));
    } else {
      averageCycles.set(num, 18.0);
    }
  }

  const lastDrawWinners = history[0].gagnants;
  const pastResults = history.slice(1);
  const markovTransitions = new Map<number, Map<number, number>>();
  
  pastResults.forEach((draw, idx) => {
    const nextDraw = idx > 0 ? pastResults[idx - 1] : history[0];
    const decay = Math.pow(timeDecay, idx + 1);
    
    draw.gagnants.forEach((leader: number) => {
      if (lastDrawWinners.includes(leader)) {
        if (!markovTransitions.has(leader)) {
          markovTransitions.set(leader, new Map());
        }
        const followers = markovTransitions.get(leader)!;
        nextDraw.gagnants.forEach((follower: number) => {
          followers.set(follower, (followers.get(follower) || 0) + decay);
        });
      }
    });
  });

  // --- CALCUL DE LA RÉCURRENCE MENSUELLE (Saisonnalité Optionnelle) ---
  const resonanceScores: Record<number, number> = {};
  for (let i = 1; i <= 90; i++) resonanceScores[i] = 0;
  
  let monthlyResonanceSignificant = false;
  const currentDraw = history[0];
  const currentDate = parseDate(currentDraw.date);
  if (currentDate && history.length >= 30) {
    let twinDraw = findTwinDraw(history, currentDate, 1);
    if (!twinDraw) twinDraw = findTwinDraw(history, currentDate, 2);
    
    if (twinDraw) {
      const twinIndex = history.indexOf(twinDraw);
      const twinNumbers = new Set<number>([...(twinDraw.gagnants || []), ...parseMachineWinners(twinDraw.machine)]);
      const maxResonanceLookback = Math.min(100, history.length - twinIndex - 1);
      let resonanceMatches = 0;

      for (let k = 1; k <= maxResonanceLookback; k++) {
        const pastDraw = history[twinIndex + k];
        if (!pastDraw) continue;
        const pastDrawNumbers = [...(pastDraw.gagnants || []), ...parseMachineWinners(pastDraw.machine)];
        const overlap = pastDrawNumbers.filter(n => twinNumbers.has(n)).length;

        if (overlap >= 2) {
          const correspondingCurrentDraw = history[k];
          if (correspondingCurrentDraw) {
            resonanceMatches++;
            const periodWeight = Math.pow(overlap, 2) * Math.exp(-0.04 * k);
            correspondingCurrentDraw.gagnants.forEach((num: number) => {
              if (num >= 1 && num <= 90) resonanceScores[num] += periodWeight;
            });
          }
        }
      }
      if (resonanceMatches >= 2) {
        monthlyResonanceSignificant = true;
      }
    }
  }

  for (let num = 1; num <= 90; num++) {
    // 1. repeatShort
    let repeatRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      if (history[t].gagnants.includes(num)) {
        repeatRaw += Math.pow(timeDecay, t);
      }
    }

    // 2. machineTransfer
    let machineRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      const mach = parseMachineWinners(history[t].machine);
      if (mach.includes(num)) {
        machineRaw += Math.pow(timeDecay, t);
      }
    }

    // 3. neighbor
    let neighborRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      const winners = history[t].gagnants;
      const decay = Math.pow(timeDecay, t);
      winners.forEach((w: number) => {
        const nLeft = w > 1 ? w - 1 : 90;
        const nRight = w < 90 ? w + 1 : 1;
        if (num === nLeft || num === nRight) {
          neighborRaw += decay;
        }
      });
    }

    // 4. mirror
    let mirrorRaw = 0;
    for (let t = 0; t < lookBack; t++) {
      if (history[t].gagnants.includes(91 - num)) {
        mirrorRaw += Math.pow(timeDecay, t);
      }
    }

    // 5. markov
    let markovRaw = 0;
    lastDrawWinners.forEach((leader: number) => {
      const followers = markovTransitions.get(leader);
      if (followers && followers.has(num)) {
        markovRaw += followers.get(num)!;
      }
    });

    // 6. trend
    const currentGap = lastSeen.get(num) ?? totalDraws;
    const avgGap = averageCycles.get(num) || 18.0;
    const gapRaw = 1.0 - Math.exp(-currentGap / avgGap);

    const fShort = (shortAppearances.get(num) || 0) / 10.0;
    const fLong = (appearances.get(num) || 0) / totalDraws;
    const freqRaw = fShort / (fLong + Number.EPSILON);
    const trendRaw = (gapRaw + freqRaw) / 2.0;

    // 7. seasonal (inclut l'option de récurrence mensuelle)
    const cycle = averageCycles.get(num) || 18.0;
    const cyclePos = currentGap / cycle;
    const seasonalRaw = Math.cos(2 * Math.PI * cyclePos) * 0.5 + 0.5;
    
    let finalSeasonal = seasonalRaw;
    if (monthlyResonanceSignificant) {
      // Poids plafonné à 0.08 conformément aux instructions (maxSecondaryWeight = 0.08)
      const resonanceVal = resonanceScores[num] || 0;
      finalSeasonal = 0.92 * seasonalRaw + 0.08 * (1.0 / (1.0 + Math.exp(-resonanceVal)));
    }

    // 8. structuralCoherence
    const testSetForCoherence = [...lastDrawWinners.slice(0, 4), num];
    const structuralCoherenceRaw = calculateCoherence(testSetForCoherence) / 100.0;

    rawFeatures[num] = {
      repeatShort: repeatRaw,
      machineTransfer: machineRaw,
      neighbor: neighborRaw,
      mirror: mirrorRaw,
      markov: markovRaw,
      trend: trendRaw,
      seasonal: finalSeasonal,
      structuralCoherence: structuralCoherenceRaw
    };
  }

  return rawFeatures;
};

const normalizeSignals = (rawFeatures: Record<number, FeatureVector>): Record<number, FeatureVector> => {
  const normalizedFeatures: Record<number, FeatureVector> = {};
  const featureKeys: Array<keyof FeatureVector> = [
    'repeatShort',
    'machineTransfer',
    'neighbor',
    'mirror',
    'markov',
    'trend',
    'seasonal',
    'structuralCoherence'
  ];

  for (let num = 1; num <= 90; num++) {
    normalizedFeatures[num] = {} as FeatureVector;
  }

  featureKeys.forEach(key => {
    const values: number[] = [];
    for (let num = 1; num <= 90; num++) {
      values.push(rawFeatures[num][key]);
    }

    const sortedVals = [...values].sort((a, b) => a - b);
    const median = sortedVals[45];
    const mean = values.reduce((a, b) => a + b, 0) / 90;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 90) || 1.0;

    for (let num = 1; num <= 90; num++) {
      const val = rawFeatures[num][key];
      const z = (val - median) / (stdDev + Number.EPSILON);
      normalizedFeatures[num][key] = 1.0 / (1.0 + Math.exp(-z));
    }
  });

  return normalizedFeatures;
};

// --- EXECUTE SERVEUR ---

export async function handlePredictElite(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = reqBody || await req.json();
    const validation = PredictionRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: "Invalid Request payload", details: validation.error.format() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const { history, weights, drawName, symbioticContext } = validation.data;

    // --- ÉTAPE 1 : ENTREE & NETTOYAGE ---
    let cleanedHistory = history.filter(d => d && d.gagnants && d.gagnants.length === 5);
    cleanedHistory = cleanedHistory.map(d => {
      const uniqGagnants = Array.from(new Set(d.gagnants)).sort((a, b) => a - b);
      return {
        ...d,
        gagnants: uniqGagnants
      };
    }).filter(d => d.gagnants.length === 5);

    const seenDraws = new Set<string>();
    cleanedHistory = cleanedHistory.filter(d => {
      const key = d.gagnants.join(',');
      if (seenDraws.has(key)) return false;
      seenDraws.add(key);
      return true;
    });

    if (cleanedHistory.length < 12) {
      return new Response(JSON.stringify({ error: "Dataset insuffisant après nettoyage des doublons (minimum 12 tirages valides requis)." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    console.log(`[EDGE INFERENCE] Inférence LotoPro Platinum pour ${drawName} sur ${cleanedHistory.length} tirages.`);

    // --- ÉTAPE 2 : PRE-ANALYSE ---
    const thermoState = detectThermoStatisticalRegime(cleanedHistory);
    const maxProb = Math.max(thermoState.stable, thermoState.volatile, thermoState.chaotic, thermoState.cryo);
    let regime: "stable" | "volatile" | "chaotic" | "cryo" = "stable";
    if (maxProb === thermoState.cryo) regime = "cryo";
    else if (maxProb === thermoState.volatile) regime = "volatile";
    else if (maxProb === thermoState.chaotic) regime = "chaotic";

    const adaptiveHalfLife = calculateAdaptiveHalfLife(cleanedHistory, thermoState);
    const timeDecay = Math.pow(0.5, 1.0 / adaptiveHalfLife);
    const lookBack = Math.min(Math.floor(adaptiveHalfLife), cleanedHistory.length);

    // Évaluation de la couverture machine
    const drawsWithMachine = cleanedHistory.filter(d => parseMachineWinners(d.machine).length > 0).length;
    const machineCoverage = drawsWithMachine / cleanedHistory.length;

    // --- BASE DE DONNÉES / FEEDBACK COGNITIF ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    let perfStats = null;
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        perfStats = await getPerformanceMemoryByRegime(supabase, drawName);
      } catch (err) {
        console.warn("[EDGE] Échec d'accès à la table de performance, continuation en mode autonome:", err);
      }
    }

    // --- ÉTAPE 3 : SCORING ENGINE ---
    const rawSignals = extractSignals(cleanedHistory, adaptiveHalfLife, lookBack, timeDecay);
    const normalizedSignals = normalizeSignals(rawSignals);

    // Pondérations initiales adaptées
    const baseW = 1.0;
    const rawW_repeat = baseW * (1.0 + (weights?.temporal || 0.0));
    const rawW_machine = baseW * (machineCoverage > 0.5 ? 1.2 : 0.8);
    const rawW_neighbor = baseW;
    const rawW_mirror = baseW;
    const rawW_markov = baseW + (weights?.markov || 0.0);
    const rawW_trend = baseW + (((weights?.gap || 0.0) + (weights?.frequency || 0.0)) / 2.0);
    const rawW_seasonal = baseW + (weights?.temporal || 0.0);
    const rawW_structuralCoherence = baseW + (weights?.derived_neighbor || 0.0);

    // Modulation selon le régime détecté
    const cryoMod = thermoState.cryo;
    const volatileMod = thermoState.volatile;
    const chaoticMod = thermoState.chaotic;

    let modW_repeat = rawW_repeat * (1.0 + 0.5 * cryoMod - 0.5 * volatileMod);
    let modW_machine = rawW_machine * (1.0 - 0.4 * cryoMod);
    let modW_neighbor = rawW_neighbor * (1.0 - 0.4 * cryoMod + 0.5 * volatileMod);
    let modW_mirror = rawW_mirror * (1.0 + 0.4 * volatileMod);
    let modW_markov = rawW_markov * (1.0 + 0.4 * cryoMod);
    let modW_trend = rawW_trend * (1.0 + 0.4 * cryoMod);
    let modW_seasonal = rawW_seasonal;
    let modW_structuralCoherence = rawW_structuralCoherence * (1.0 - 0.3 * volatileMod);

    // Harmonisation en cas de chaos
    if (chaoticMod > 0.01) {
      const avgW = (modW_repeat + modW_machine + modW_neighbor + modW_mirror + modW_markov + modW_trend + modW_seasonal + modW_structuralCoherence) / 8.0;
      modW_repeat = modW_repeat * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_machine = modW_machine * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_neighbor = modW_neighbor * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_mirror = modW_mirror * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_markov = modW_markov * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_trend = modW_trend * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_seasonal = modW_seasonal * (1.0 - chaoticMod) + avgW * chaoticMod;
      modW_structuralCoherence = modW_structuralCoherence * (1.0 - chaoticMod) + avgW * chaoticMod;
    }

    // Intégration de la mémoire de performance
    if (perfStats && perfStats[regime] && perfStats[regime].count >= 2) {
      const avgHits = perfStats[regime].hits / perfStats[regime].count;
      if (avgHits > 0.4) {
        // Boost des signaux principaux de ce régime
        if (regime === "cryo" || regime === "stable") {
          modW_trend *= 1.15;
          modW_repeat *= 1.15;
        } else {
          modW_neighbor *= 1.15;
          modW_mirror *= 1.15;
        }
      } else if (avgHits < 0.2) {
        // Amortissement de confiance dû à une dérive
        modW_trend *= 0.85;
        modW_repeat *= 0.85;
      }
    }

    const sumW = modW_repeat + modW_machine + modW_neighbor + modW_mirror + modW_markov + modW_trend + modW_seasonal + modW_structuralCoherence;

    const w = {
      repeatShort: modW_repeat / sumW,
      machineTransfer: modW_machine / sumW,
      neighbor: modW_neighbor / sumW,
      mirror: modW_mirror / sumW,
      markov: modW_markov / sumW,
      trend: modW_trend / sumW,
      seasonal: modW_seasonal / sumW,
      structuralCoherence: modW_structuralCoherence / sumW
    };

    const weightedScores: Record<number, number> = {};
    let totalScoreSum = 0;
    let t1ScoreSum = 0;
    const t1Winners = cleanedHistory[0].gagnants;

    for (let num = 1; num <= 90; num++) {
      const f = normalizedSignals[num];
      
      const act_inertia = (f.repeatShort + f.trend) / 2.0;
      const act_structure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
      const act_transition = (f.markov + f.machineTransfer) / 2.0;
      const act_seasonal = f.seasonal;

      const families = [act_inertia, act_structure, act_transition, act_seasonal];
      const activeFamiliesCount = families.filter(v => v > 0.4).length;

      const hasInertiaRedundancy = Math.max(0, Math.min(f.repeatShort, f.trend) - 0.4);
      const hasStructureRedundancy = Math.max(0, Math.min(f.mirror, f.neighbor) - 0.4) + 
                                     Math.max(0, Math.min(f.neighbor, f.structuralCoherence) - 0.4) +
                                     Math.max(0, Math.min(f.mirror, f.structuralCoherence) - 0.4);
      const hasTransitionRedundancy = Math.max(0, Math.min(f.markov, f.machineTransfer) - 0.4);

      const correlatedSignalsCount = (hasInertiaRedundancy ? 1 : 0) + 
                                     (hasStructureRedundancy > 0.2 ? 1 : 0) + 
                                     (hasTransitionRedundancy ? 1 : 0);

      const overlapPenalty = Math.min(0.25, correlatedSignalsCount * 0.08);
      const diversityBonus = 0.85 + 0.15 * (activeFamiliesCount / 4.0);

      const baseLinearScore =
        w.repeatShort * f.repeatShort +
        w.machineTransfer * f.machineTransfer +
        w.neighbor * f.neighbor +
        w.mirror * f.mirror +
        w.markov * f.markov +
        w.trend * f.trend +
        w.seasonal * f.seasonal +
        w.structuralCoherence * f.structuralCoherence;

      const score = baseLinearScore * (1.0 - overlapPenalty) * diversityBonus;
      weightedScores[num] = score;
      totalScoreSum += score;

      if (t1Winners.includes(num)) {
        t1ScoreSum += score;
      }
    }

    // --- GARDE-FOU ANTI-SUR-REACTION AU DERNIER TIRAGE (T-1 OVERFIT PENALTY) ---
    const recentDominanceRatio = t1ScoreSum / (totalScoreSum || 1.0);
    const warnings: string[] = [];
    if (recentDominanceRatio > 0.45) {
      warnings.push("Avertissement : Forte dépendance détectée par rapport au tirage T-1. Application d'une pénalité de sur-ajustement.");
      t1Winners.forEach((num: number) => {
        weightedScores[num] *= 0.65; // Réduction sélective pour forcer la diversité hors T-1
      });
    }

    // SymbioticContext boost
    if (symbioticContext?.spatialHotZones && Array.isArray(symbioticContext.spatialHotZones)) {
      symbioticContext.spatialHotZones.forEach((num: number) => {
        if (weightedScores[num] !== undefined) {
          weightedScores[num] *= 1.15;
        }
      });
    }

    // --- SHRINKAGE & CALIBRATION STAGE ---
    const allWeightedScores = Object.values(weightedScores).sort((a, b) => b - a);
    const top20Scores = allWeightedScores.slice(0, 20);
    const top20Mean = top20Scores.reduce((a, b) => a + b, 0) / 20;
    const top20Variance = top20Scores.reduce((sum, s) => sum + Math.pow(s - top20Mean, 2), 0) / 20;
    const scoreStd = Math.sqrt(top20Variance) || 0.001;
    const top1 = top20Scores[0];
    const top10ScoreVal = top20Scores[9];
    const scoreGap = top1 - top10ScoreVal;
    const sumTop5 = top20Scores.slice(0, 5).reduce((a, b) => a + b, 0);
    const sumTop20 = top20Scores.reduce((a, b) => a + b, 0) || 1.0;
    const concentration = sumTop5 / sumTop20;

    const concentrationPenalty = Math.max(0, concentration - 0.28) * 1.5;
    const instabilityPenalty = Math.max(0, scoreStd - 0.12) * 1.0 + Math.max(0, scoreGap - 0.15) * 1.0;

    // Calcul de contradiction des signaux
    const top5NumsForContradiction = Object.entries(weightedScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => Number(e[0]));

    let totalTop5FeatureVariance = 0;
    top5NumsForContradiction.forEach(num => {
      const f = normalizedSignals[num];
      const fVals = [f.repeatShort, f.machineTransfer, f.neighbor, f.mirror, f.markov, f.trend, f.seasonal, f.structuralCoherence];
      const fMean = fVals.reduce((a, b) => a + b, 0) / 8;
      const fVar = fVals.reduce((sum, val) => sum + Math.pow(val - fMean, 2), 0) / 8;
      totalTop5FeatureVariance += fVar;
    });
    const contradictionPenalty = (totalTop5FeatureVariance / 5.0) * 1.5;

    const clamp = (min: number, max: number, val: number) => Math.max(min, Math.min(max, val));
    const shrinkage = 1.0 - clamp(0.0, 0.35, concentrationPenalty + instabilityPenalty + contradictionPenalty);

    const calibratedScores: Record<number, number> = {};
    const globalMean = Object.values(weightedScores).reduce((a, b) => a + b, 0) / 90;
    const alpha = 1.0 + 3.0 * thermoState.chaotic;

    for (let num = 1; num <= 90; num++) {
      const f = normalizedSignals[num];
      const fVals = [f.repeatShort, f.machineTransfer, f.neighbor, f.mirror, f.markov, f.trend, f.seasonal, f.structuralCoherence];
      const numMean = fVals.reduce((a, b) => a + b, 0) / 8;
      const numVariance = fVals.reduce((sum, val) => sum + Math.pow(val - numMean, 2), 0) / 8;

      const signalVarianceMultiplier = Math.exp(-alpha * numVariance);
      const weightedScore = weightedScores[num];
      const rawCalibrated = globalMean + signalVarianceMultiplier * (weightedScore - globalMean);
      
      calibratedScores[num] = rawCalibrated * shrinkage;
    }

    // --- ÉTAPE 5 : SÉLECTION DIVERSIFIÉE (CONSTRAINTS GATES) ---
    const selected: number[] = [];
    const familyCounts: Record<string, number> = {
      inertia: 0,
      structure: 0,
      transition: 0,
      seasonal: 0
    };

    for (let step = 0; step < 5; step++) {
      let bestNum = 1;
      let bestSelectionScore = -Infinity;

      const t1Count = selected.filter(sel => t1Winners.includes(sel)).length;
      const neighborsCount = selected.filter(sel => 
        selected.some(other => other !== sel && Math.abs(sel - other) === 1)
      ).length / 2;

      for (let num = 1; num <= 90; num++) {
        if (selected.includes(num)) continue;

        const score = calibratedScores[num];

        // Détermination continue de la famille dominante du candidat
        const f = normalizedSignals[num];
        const famInertia = (f.repeatShort + f.trend) / 2.0;
        const famStructure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
        const famTransition = (f.markov + f.machineTransfer) / 2.0;
        const famSeasonal = f.seasonal;

        const famVals = [famInertia, famStructure, famTransition, famSeasonal];
        const maxIdx = famVals.indexOf(Math.max(...famVals));
        const dominantFamily = ["inertia", "structure", "transition", "seasonal"][maxIdx];

        let familyPenalty = 1.0;
        if (familyCounts[dominantFamily] >= 2) {
          familyPenalty = 0.35; // Éviter la concentration excessive dans une seule famille
        }

        // Pénalités spatiales et géométriques
        let decadePenalty = 1.0;
        let lastDigitPenalty = 1.0;
        let consecutivePenalty = 1.0;
        let mirrorPenalty = 1.0;

        const numDecade = Math.floor((num - 1) / 10);
        const numLastDigit = num % 10;

        selected.forEach(sel => {
          const selDecade = Math.floor((sel - 1) / 10);
          const selLastDigit = sel % 10;

          if (numDecade === selDecade) {
            decadePenalty -= 0.25;
          }
          if (numLastDigit === selLastDigit) {
            lastDigitPenalty -= 0.15;
          }
          if (Math.abs(num - sel) === 1) {
            consecutivePenalty *= (neighborsCount > 0 ? 0.2 : 0.4);
          }
          if (num === 91 - sel) {
            mirrorPenalty *= 0.6;
          }
        });

        decadePenalty = Math.max(0.2, decadePenalty);
        lastDigitPenalty = Math.max(0.2, lastDigitPenalty);

        let t1Penalty = 1.0;
        if (t1Winners.includes(num)) {
          if (t1Count >= 2) {
            t1Penalty = 0.4; // Éviter la construction du ticket entièrement sur T-1
          }
        }

        const totalPenalty = familyPenalty * decadePenalty * lastDigitPenalty * consecutivePenalty * mirrorPenalty * t1Penalty;
        const selectionScore = score * totalPenalty;

        if (selectionScore > bestSelectionScore) {
          bestSelectionScore = selectionScore;
          bestNum = num;
        }
      }

      selected.push(bestNum);

      // Mettre à jour les comptes des familles dominantes
      const f = normalizedSignals[bestNum];
      const famInertia = (f.repeatShort + f.trend) / 2.0;
      const famStructure = (f.mirror + f.neighbor + f.structuralCoherence) / 3.0;
      const famTransition = (f.markov + f.machineTransfer) / 2.0;
      const famSeasonal = f.seasonal;
      const famVals = [famInertia, famStructure, famTransition, famSeasonal];
      const maxIdx = famVals.indexOf(Math.max(...famVals));
      const dominantFamily = ["inertia", "structure", "transition", "seasonal"][maxIdx];
      familyCounts[dominantFamily] = (familyCounts[dominantFamily] || 0) + 1;
    }

    selected.sort((a, b) => a - b);

    // Sélection des 10 candidats complémentaires de réserve
    const candidatesList = Object.entries(calibratedScores)
      .map(e => ({ num: Number(e[0]), score: e[1] }))
      .filter(item => !selected.includes(item.num))
      .sort((a, b) => b.score - a.score)
      .map(item => item.num);

    const candidates = candidatesList.slice(0, 10);

    // --- CALIBRATION DE CONFIANCE (Robustesse de l'Inférence Continue) ---
    const allScoresList = Object.values(calibratedScores);
    const globalMeanScore = allScoresList.reduce((a, b) => a + b, 0) / (allScoresList.length || 1);
    const globalVar = allScoresList.reduce((sum, s) => sum + Math.pow(s - globalMeanScore, 2), 0) / (allScoresList.length || 1);
    const globalStd = Math.sqrt(globalVar) || 1e-6;

    const topScoresList = selected.map(num => calibratedScores[num] || 0);
    const topMeanScore = topScoresList.reduce((a, b) => a + b, 0) / (topScoresList.length || 1);

    // Signal-to-Noise Ratio (SNR) continu
    const snrVal = (topMeanScore - globalMeanScore) / globalStd;
    const snrStability = 1.0 / (1.0 + Math.exp(-snrVal));

    // Atténuation par le facteur de contradiction
    const contradictionFactor = 1.0 / (1.0 + Math.exp(contradictionPenalty));

    const stabilityScore = Math.max(0.1, Math.min(1.0, snrStability * contradictionFactor));

    // Détermination de la tranche de confiance
    // expected value de hits de random = 0.27. Si stabilityScore est élevé, la prédiction est structurée/élevée.
    const confidenceScore = Math.round(stabilityScore * 100);
    let confidenceBand: "faible" | "moderee" | "structuree" | "elevee" = "moderee";
    if (confidenceScore >= 80) confidenceBand = "elevee";
    else if (confidenceScore >= 60) confidenceBand = "structuree";
    else if (confidenceScore >= 40) confidenceBand = "moderee";
    else confidenceBand = "faible";

    // Élaboration de l'explication et de la description narrative structurée
    const dominantFamilies = Object.entries(familyCounts)
      .filter(e => e[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);

    const activeRegimeProb = Math.round(maxProb * 100);
    const analysisMessage = `Prédiction calculée via l'architecture Deno Edge predict-elite-v2. Régime détecté : ${regime.toUpperCase()} (${activeRegimeProb}% de confiance). Cohérence structurelle optimisée avec diversification par familles : ${dominantFamilies.join(', ')}.`;

    // Transformation du breakdown pour l'affichage UI
    const finalBreakdown: Record<number, Record<string, number>> = {};
    for (let num = 1; num <= 90; num++) {
      const f = normalizedSignals[num];
      finalBreakdown[num] = {
        repeatShort: Math.round(f.repeatShort * 100),
        machineTransfer: Math.round(f.machineTransfer * 100),
        neighbor: Math.round(f.neighbor * 100),
        mirror: Math.round(f.mirror * 100),
        markov: Math.round(f.markov * 100),
        trend: Math.round(f.trend * 100),
        seasonal: Math.round(f.seasonal * 100),
        structuralCoherence: Math.round(f.structuralCoherence * 100),
        score: Math.round(calibratedScores[num] * 100)
      };
    }

    const predictionResponse = {
      suggestedNumbers: selected,
      candidates: candidates,
      confidenceBand,
      stabilityScore: parseFloat(stabilityScore.toFixed(3)),
      regime,
      dominantFamilies,
      warnings,
      breakdown: finalBreakdown,
      engineVersion: "predict-elite-v2" as const,
      analysis: analysisMessage,
      timestamp: Date.now(),
      confidence: confidenceScore,
      realityAlignment: 82,
      realityAlignmentNote: "Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain."
    };

    return new Response(JSON.stringify(predictionResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const err = error as Error;
    console.error("[EDGE ERROR]", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown Error" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
}
