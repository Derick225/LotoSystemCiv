import { corsHeaders } from "../../_shared/cors.ts";
import {
  computeCanonicalExactHitsAndNearMisses,
  computeCanonicalTopologicalLoss,
} from "../../_shared/forensic-learning-engine.ts";

// generate-forensic-report: Generates the extensive XAP explainability JSON report
// aligned strictly with canonical circular near-miss & topological loss definitions.
export async function handleGenerateForensicReport(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = reqBody || await req.json().catch(() => ({}));
    const { prediction, actualDraw, drawName } = body;

    if (!prediction || !actualDraw || !drawName) {
      return new Response(JSON.stringify({ error: "Missing required parameters: prediction, actualDraw, drawName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchSummary = computeCanonicalExactHitsAndNearMisses(
      prediction.suggestedNumbers || prediction.candidates || [],
      Array.isArray(actualDraw) ? actualDraw : []
    );
    const predicted = matchSummary.predictedTop5;
    const actual = matchSummary.actualUnique;

    if (predicted.length === 0 || actual.length === 0) {
      return new Response(JSON.stringify({ error: "No valid predicted or actual numbers found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Canonical Exact Hits, Near Misses (Z/90Z circular ±1 deduplicated), and Misses
    const hits = matchSummary.exactHits;
    const misses = predicted.length - hits;
    const nearMisses = matchSummary.nearMissCount;
    const nearMissesDetails = matchSummary.nearMissDetails.map((d) => ({
      predicted: d.predicted,
      actual: d.actual,
      diff: d.type === "-1" ? -1 : 1,
    }));

    // 2. Canonical continuous grid/circular topological loss
    const continuousTopologicalLoss = computeCanonicalTopologicalLoss(predicted, actual);

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

    let totalScoreSum = 0;
    const keySums: Record<string, number> = {};
    keys.forEach(k => { keySums[k] = 0; });

    predicted.forEach((p: number) => {
      const pBreakdown = breakdown[p] || {};
      keys.forEach(k => {
        const val = Number(pBreakdown[k] ?? pBreakdown[k === "gap" ? "gaps" : k] ?? 0);
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

    // 4. Regime change detection
    const confidence = Number.isFinite(Number(prediction.confidence)) ? Number(prediction.confidence) : 50;
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
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
