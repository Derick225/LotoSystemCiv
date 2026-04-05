import { generateMasterPredictionCore } from '../services/predictionEngine';
import { generatePlatinumPredictionCore } from '../services/metaAnalystService';
import { getFullOrchestrationAnalysisCore } from '../services/orchestrationService';

export const config = {
  maxDuration: 60,
  runtime: 'nodejs',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, drawName, history, weightsToUse, metrics, symbioticContext, riskProfile, basePrediction } = body;

    if (!drawName || !history) {
      throw new Error("Paramètres 'drawName' et 'history' requis");
    }

    if (type === 'platinum') {
      const result = await generatePlatinumPredictionCore(
        drawName,
        history,
        metrics,
        undefined,
        symbioticContext,
        basePrediction
      );
      return new Response(JSON.stringify({ success: true, result }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } else if (type === 'orchestration') {
      const result = await getFullOrchestrationAnalysisCore(
        drawName,
        history,
        weightsToUse
      );
      return new Response(JSON.stringify({ success: true, result }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } else {
      const result = await generateMasterPredictionCore(
        drawName,
        history,
        weightsToUse,
        metrics,
        symbioticContext,
        riskProfile
      );
      return new Response(JSON.stringify({ success: true, result }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

  } catch (err: any) {
    console.error("API generate-prediction error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
