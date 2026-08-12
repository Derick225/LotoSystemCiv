import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../../_shared/cors.ts";

// generate-forensic-report: Generates the extensive XAP explainability JSON report.
export async function handleGenerateForensicReport(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prediction, actualDraw, drawName } = await req.json();

    if (!prediction || !actualDraw || !drawName) {
      return new Response(JSON.stringify({ error: "Missing required parameters: prediction, actualDraw, drawName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse numbers safely
    const actual = actualDraw.map((n: any) => Number(n));
    const predicted = (prediction.suggestedNumbers || prediction.candidates || []).slice(0, 5).map((n: any) => Number(n));

    if (predicted.length === 0) {
      return new Response(JSON.stringify({ error: "No predicted numbers found in prediction object" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Calculate Exact Hits, Near Misses, and Misses
    const hitsList = predicted.filter((p: number) => actual.includes(p));
    const hits = hitsList.length;
    const misses = predicted.length - hits;

    let nearMisses = 0;
    const nearMissesDetails: Array<{ predicted: number, actual: number, diff: number }> = [];

    predicted.forEach((p: number) => {
      if (!actual.includes(p)) {
        if (actual.includes(p - 1)) {
          nearMisses++;
          nearMissesDetails.push({ predicted: p, actual: p - 1, diff: -1 });
        } else if (actual.includes(p + 1)) {
          nearMisses++;
          nearMissesDetails.push({ predicted: p, actual: p + 1, diff: 1 });
        }
      }
    });

    // 2. Calculate continuous grid topological loss (René Thom geometry)
    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

    let totalContinLoss = 0;
    actual.forEach((w: number) => {
      let maxSimForWinner = 1e-9;
      predicted.forEach((p: number) => {
        let sim = 0.0;
        if (p === w) {
          sim = 1.0;
        } else {
          const linSim = Math.exp(-0.25 * Math.abs(p - w));
          const posP = getGridPos(p);
          const posW = getGridPos(w);
          const gridDist = Math.sqrt(Math.pow(posP.row - posW.row, 2) + Math.pow(posP.col - posW.col, 2));
          const gridSim = Math.exp(-0.35 * gridDist);

          let mirrorSim = 0.0;
          if (p + w === 91) mirrorSim = 0.45;
          const strP = p.toString();
          const revP = parseInt(strP.split("").reverse().join(""), 10);
          if (revP >= 1 && revP <= 90 && revP === w) mirrorSim = Math.max(mirrorSim, 0.40);

          let harmonicSim = 0.0;
          if (p % 10 === w % 10) harmonicSim = 0.35;

          let decadeSim = 0.0;
          if (Math.floor((p - 1) / 10) === Math.floor((w - 1) / 10)) decadeSim = 0.25;

          sim = Math.max(linSim, gridSim, mirrorSim, harmonicSim, decadeSim);
        }
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });
      totalContinLoss += (1.0 - maxSimForWinner);
    });
    const continuousTopologicalLoss = totalContinLoss / (actual.length || 5);

    // 3. Exact SHAP distribution based on score breakdowns
    const shapDistribution: Record<string, number> = {
      frequency: 0.1,
      gap: 0.1,
      spectral: 0.1,
      markov: 0.1,
      bayes: 0.1,
      momentum: 0.1,
      affinity: 0.1,
      spatial: 0.1,
      temporal: 0.1,
      fractal: 0.1
    };

    const breakdown = prediction.breakdown || {};
    const keys = Object.keys(shapDistribution);

    // Accumulate scores for predicted numbers
    let totalScoreSum = 0;
    const keySums: Record<string, number> = {};
    keys.forEach(k => { keySums[k] = 0; });

    predicted.forEach((p: number) => {
      const pBreakdown = breakdown[p] || {};
      keys.forEach(k => {
        // Map common key aliases if any
        const val = Number(pBreakdown[k] ?? pBreakdown[k === 'gap' ? 'gaps' : k] ?? 0);
        keySums[k] += Math.max(0, val);
      });
    });

    keys.forEach(k => {
      totalScoreSum += keySums[k];
    });

    if (totalScoreSum > 0) {
      keys.forEach(k => {
        shapDistribution[k] = parseFloat((keySums[k] / totalScoreSum).toFixed(4));
      });
    }

    // 4. Regime change and Black Swan risk detection
    // High confidence prediction but zero/very low hits suggests sudden chaotic regime rupture
    const confidence = prediction.confidence || 50;
    const regimeChangeDetected = (confidence > 75 && hits === 0) || (continuousTopologicalLoss > 0.8);

    const report = {
      drawName,
      autopsy: {
        accuracy: parseFloat((hits / 5.0).toFixed(4)),
        hits,
        misses,
        nearMisses,
        nearMissesDetails,
        continuousTopologicalLoss: parseFloat(continuousTopologicalLoss.toFixed(4)),
        shapDistribution,
        regimeChangeDetected
      },
      timestamp: Date.now()
    };

    return new Response(
      JSON.stringify({
        status: "success",
        report,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
