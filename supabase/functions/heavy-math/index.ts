import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DrawData { gagnants: number[]; machine?: number[]; }

const calculateACValue = (numbers: number[]): number => {
  const diffs = new Set();
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      diffs.add(Math.abs(sorted[j] - sorted[i]));
    }
  }
  return diffs.size - (numbers.length - 1);
};

const calculateShannonEntropy = (history: DrawData[]): number => {
  const freq: Record<number, number> = {};
  let total = 0;
  history.forEach(d => d.gagnants.forEach(n => {
    freq[n] = (freq[n] || 0) + 1;
    total++;
  }));
  
  let entropy = 0;
  Object.values(freq).forEach(count => {
    const p = count / total;
    entropy -= p * Math.log2(p);
  });
  
  const maxEntropy = Math.log2(90);
  return entropy / maxEntropy;
};

const extractFeatures = (num: number, history: DrawData[]) => {
  if (history.length < 5) return {};
  
  const lastWinners = history[0].gagnants;
  const lastMachine = history[0].machine || [];
  
  // 1. Calcul du gap actuel
  let currentGap = 0;
  for (; currentGap < history.length; currentGap++) {
    if (history[currentGap].gagnants.includes(num)) break;
  }

  // 2. Analyse des décades (Densité locale)
  const decade = Math.floor((num - 1) / 10);
  const decadeStats = history.slice(0, 15).map(d => 
    d.gagnants.filter(n => Math.floor((n - 1) / 10) === decade).length
  );
  const avgDecadeDensity = decadeStats.reduce((a, b) => a + b, 0) / 15;

  // 3. Calcul de la vitesse de gap (Accélération)
  const gaps: number[] = [];
  let lastIdx = -1;
  for (let i = 0; i < Math.min(history.length, 100); i++) {
    if (history[i].gagnants.includes(num)) {
      if (lastIdx !== -1) gaps.push(i - lastIdx);
      lastIdx = i;
    }
  }
  const gapVelocity = gaps.length >= 2 ? (gaps[0] - gaps[1]) : 0;

  return {
    isCriticalGap: currentGap >= 8 && currentGap <= 18,
    isHot: avgDecadeDensity > 1.4,
    hasNeighborYesterday: lastWinners.includes(num - 1) || lastWinners.includes(num + 1),
    isMachineLeak: lastMachine.includes(num),
    isMirrorYesterday: lastWinners.includes(91 - num),
    isRecentRepeat: history.slice(0, 4).some(d => d.gagnants.includes(num)),
    gapVelocity,
    avgDecadeDensity
  };
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, data, history } = await req.json();

    if (task === 'platinum_heuristic') {
      const candidates = data.map((num: number) => ({
        num,
        features: extractFeatures(num, history),
        acScore: calculateACValue(history[0].gagnants)
      }));
      return new Response(JSON.stringify({
        candidates,
        globalEntropy: calculateShannonEntropy(history.slice(0, 50))
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (task === 'full_audit') {
      return new Response(JSON.stringify({
        entropy: calculateShannonEntropy(history),
        complexity: calculateACValue(history[0].gagnants),
        timestamp: Date.now()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ status: 'Heavy Math Engine v3.5 Active' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});