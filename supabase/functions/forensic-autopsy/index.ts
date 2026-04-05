import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { GoogleGenAI, Type } from "npm:@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateWithFallback(genAI: any, primaryModel: string, params: any) {
    const fallbackModel = "gemini-3.1-flash-preview";
    const config = { ...params.config };

    try {
        console.log(`Executing task with model: ${primaryModel}`);
        return await genAI.models.generateContent({ ...params, model: primaryModel, config });
    } catch (e: any) {
        console.error(`Error with ${primaryModel}:`, e.message);
        
        if (primaryModel !== fallbackModel) {
            console.warn(`Falling back to ${fallbackModel}...`);
            try {
                return await genAI.models.generateContent({ ...params, model: fallbackModel, config });
            } catch (e2: any) {
                console.error(`Error with ${fallbackModel}:`, e2.message);
                throw e2;
            }
        } else {
            throw e;
        }
    }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { snapshotId, drawResultId } = await req.json();

    if (!snapshotId || !drawResultId) {
      throw new Error("Missing snapshotId or drawResultId");
    }

    // 1. Fetch Snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('prediction_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (snapshotError || !snapshot) {
      throw new Error(`Snapshot not found: ${snapshotError?.message}`);
    }

    // 2. Fetch Draw Result
    const { data: drawResult, error: drawError } = await supabase
      .from('draw_results')
      .select('*')
      .eq('id', drawResultId)
      .single();

    if (drawError || !drawResult) {
      throw new Error(`Draw result not found: ${drawError?.message}`);
    }

    // 3. Calculate Near Misses
    const predicted = snapshot.predicted_numbers;
    const actual = drawResult.numbers;
    
    const nearMisses = [];
    let exactMatches = 0;

    for (const p of predicted) {
      if (actual.includes(p)) {
        exactMatches++;
      } else {
        // Check for +/- 1 near miss
        if (actual.includes(p - 1) || actual.includes(p + 1)) {
          nearMisses.push(p);
        }
      }
    }

    // 3.5 CACHE CHECK: Did we already analyze this exact prediction for this draw?
    const { data: cachedReports } = await supabase
      .from('forensic_reports')
      .select('report_data, prediction_snapshots!inner(predicted_numbers)')
      .eq('draw_result_id', drawResultId);

    let reportContent = null;
    let usedCache = false;

    if (cachedReports && cachedReports.length > 0) {
      const match = cachedReports.find((r: any) => 
        JSON.stringify(r.prediction_snapshots.predicted_numbers) === JSON.stringify(predicted)
      );
      if (match) {
        console.log("Cache HIT: Reusing identical prediction report.");
        reportContent = match.report_data;
        usedCache = true;
      }
    }

    // 4. Generate Report via Gemini (Only if no cache)
    if (!reportContent) {
      const apiKey = Deno.env.get('API_KEY');
      if (!apiKey) {
        throw new Error("Missing API_KEY for Gemini");
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
      En tant qu'expert en analyse de données de loterie et en algorithmes prédictifs, réalise une autopsie de cette prédiction.

      Prédiction : ${predicted.join(', ')}
      Résultat réel : ${actual.join(', ')}
      Correspondances exactes : ${exactMatches}
      Near Misses (+/- 1) : ${nearMisses.join(', ') || 'Aucun'}

      ADN de la décision (Poids des algorithmes, incluant potentiellement le transfert machine) :
      ${JSON.stringify(snapshot.decision_dna, null, 2)}

      Génère un rapport post-mortem structuré en JSON avec les clés suivantes :
      - "analysis": Une analyse textuelle de ce qui a fonctionné ou échoué.
      - "recommendations": Des recommandations pour ajuster les poids algorithmiques.
      - "score": Une note sur 100 évaluant la qualité de la prédiction (même si elle n'a pas gagné, la structure était-elle bonne ?).
      - "bias_detected": Un biais potentiel détecté dans l'ADN de la décision (ex: "Trop de poids sur la fréquence").
      `;

      const response = await generateWithFallback(ai, "gemini-3.1-pro-preview", {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              recommendations: { type: Type.STRING },
              score: { type: Type.NUMBER },
              bias_detected: { type: Type.STRING }
            },
            required: ["analysis", "recommendations", "score", "bias_detected"]
          }
        }
      });

      reportContent = JSON.parse(response.text || "{}");
    }

    // 5. Save Report
    const { data: report, error: reportError } = await supabase
      .from('forensic_reports')
      .insert({
        prediction_id: snapshot.id,
        draw_result_id: drawResult.id,
        user_id: snapshot.user_id,
        report_data: reportContent,
        ai_model_used: usedCache ? 'cache-hit' : 'gemini-3.1-pro-preview'
      })
      .select()
      .single();

    if (reportError) {
      throw new Error(`Failed to save report: ${reportError.message}`);
    }

    // 6. Update Snapshot Status
    await supabase
      .from('prediction_snapshots')
      .update({ 
        status: 'ANALYZED',
        actual_numbers: actual,
        near_misses: nearMisses,
        autopsy_report: report.id
      })
      .eq('id', snapshot.id);

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
