import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// optimize-weights: Edge Function for continuous RLHF learning and Genetic Optimization
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { history, currentWeights, rlSignal, drawName } = await req.json();

    if (!history || !currentWeights || !drawName) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Heavy coordinate descent / genetic algorithm offloaded to Edge Worker
    // Mock implementation for demonstration:

    const newWeights = { ...currentWeights };
    const baseLearningRate = 0.05;
    const lr = baseLearningRate * (Math.abs(rlSignal || 0) + 0.1);

    // Deterministic LCG based on drawName
    let lcgSeed = 9999;
    for (let charIdx = 0; charIdx < drawName.length; charIdx++) {
      lcgSeed = (lcgSeed * 31 + drawName.charCodeAt(charIdx)) >>> 0;
    }
    lcgSeed = lcgSeed || 9999;

    const deterministicRandom = () => {
      lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
      return lcgSeed / 4294967296;
    };

    // Apply continuous differential update
    for (const key of Object.keys(newWeights)) {
      // Add random jitter or gradient step based on signal
      const step = (deterministicRandom() - 0.5) * lr;
      newWeights[key] = Math.max(0.01, Math.min(1.0, Number(newWeights[key]) + step));
    }

    // Normalize
    const total = Object.values(newWeights).reduce((a: any, b: any) => a + Number(b), 0) as number;
    for (const key of Object.keys(newWeights)) {
      newWeights[key] = (newWeights[key] as number) / total;
    }

    return new Response(
      JSON.stringify({
        status: "success",
        optimizedWeights: newWeights,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
