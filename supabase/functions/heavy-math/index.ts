
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DrawData { gagnants: number[]; }

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
    if (p > 0) entropy -= p * Math.log2(p);
  });
  
  const maxEntropy = Math.log2(90);
  return entropy / maxEntropy;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { task, history } = await req.json();

    if (task === 'full_audit') {
      const entropy = calculateShannonEntropy(history);
      const ac = calculateACValue(history[0].gagnants);
      
      return new Response(JSON.stringify({
        entropy,
        complexity: ac,
        timestamp: Date.now()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ status: 'Ready' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
