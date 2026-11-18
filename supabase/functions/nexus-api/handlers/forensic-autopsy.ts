import { createClient } from 'supabase';
import { GoogleGenAI, Type } from 'genai';
import { z } from 'zod';
import { corsHeaders } from '../../_shared/cors.ts';
import {
  runForensicAutopsyCore,
  type ForensicAutopsyDeps,
} from '../../_shared/forensic-autopsy-core.ts';

export async function handleForensicAutopsy(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = reqBody || (await req.json());

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Config Supabase manquante');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('API_KEY');

    const deps: ForensicAutopsyDeps = {
      async getSnapshot(snapshotId) {
        const { data, error } = await supabase
          .from('prediction_snapshots')
          .select('*')
          .eq('id', snapshotId)
          .single();
        return error || !data ? null : data;
      },

      async getDrawResult(drawResultId) {
        const { data, error } = await supabase
          .from('draw_results')
          .select('*')
          .eq('id', drawResultId)
          .single();
        return error || !data ? null : data;
      },

      async findExistingReview(snapshotId, drawResultId, modelVersion) {
        const { data } = await supabase
          .from('post_mortem_reviews')
          .select('id, snapshot_id')
          .eq('snapshot_id', snapshotId)
          .eq('draw_result_id', drawResultId)
          .eq('model_version', modelVersion)
          .maybeSingle();
        if (!data) return null;
        const { data: snap } = await supabase
          .from('prediction_snapshots')
          .select('autopsy_report')
          .eq('id', snapshotId)
          .maybeSingle();
        return { id: data.id, report: snap?.autopsy_report ?? null };
      },

      async getPriorDrawResults(drawName, beforeDateIso, limit) {
        const { data } = await supabase
          .from('draw_results')
          .select('id, draw_name, date, gagnants, machine')
          .eq('draw_name', drawName)
          .lt('date', beforeDateIso)
          .order('date', { ascending: false })
          .limit(limit);
        return data || [];
      },

      async getPriorPostMortemReviews(drawName, beforeDateIso, modelVersion, limit) {
        const { data } = await supabase
          .from('post_mortem_reviews')
          .select('draw_date, exact_hits, brier_score, log_loss, calibration_ece, counterfactual_analysis')
          .eq('draw_name', drawName)
          .eq('model_version', modelVersion)
          .lt('draw_date', beforeDateIso)
          .order('draw_date', { ascending: false })
          .limit(limit);
        return data || [];
      },

      async getCurrentWeightsConfig(drawName) {
        const { data } = await supabase
          .from('model_weights_config')
          .select('draw_name, weights, sigmoid_slope, sigmoid_intercept')
          .eq('draw_name', drawName)
          .maybeSingle();
        return data || null;
      },

      async applyAtomicPersistence(params) {
        const { data, error } = await supabase.rpc('apply_forensic_autopsy_atomic', params);
        if (error) throw new Error(`Échec transaction atomique autopsie: ${error.message}`);
        return data as { applied: boolean; idempotent_hit: boolean; report?: Record<string, any> };
      },

      generateNarrative: geminiKey
        ? async (ctx) => {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const modelUsed = 'gemini-3.5-flash';
            const prompt = `Agis comme un analyste data science rigoureux. Rédige UNIQUEMENT un résumé technique lisible (2 à 3 phrases en français) expliquant ces résultats déjà mesurés de manière déterministe. Ne propose aucun poids chiffré ni modification de paramètres.
Tirage: ${ctx.drawName} (${ctx.drawDate})
Prédiction: ${ctx.predicted.join(', ')}
Résultat réel: ${ctx.actual.join(', ')}
Hits exacts: ${ctx.exactHits}/5 (baseline uniforme: 0.278)
Near-misses (±1, diagnostic uniquement): ${ctx.nearMissesCount}
Brier: ${ctx.brierScore.toFixed(5)} | Log-Loss: ${ctx.logLoss.toFixed(5)} | BSS vs Uniforme: ${(ctx.brierSkillVsUniform * 100).toFixed(2)}%
Échantillon cumulé N=${ctx.sampleSize} | Mode prudence: ${ctx.prudenceModeActive ? 'ACTIF' : 'STANDARD'}
Gènes favorables (ablation): ${ctx.topBeneficialGenes.join(', ') || 'Aucun'}
Gènes défavorables (ablation): ${ctx.harmfulGenes.join(', ') || 'Aucun'}`;

            const response = await ai.models.generateContent({
              model: modelUsed,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    analysis: {
                      type: Type.STRING,
                      description: 'Résumé lisible (2-3 phrases) des métriques déjà mesurées',
                    },
                  },
                  required: ['analysis'],
                },
              },
            });

            if (!response.text) throw new Error('Réponse Gemini vide');
            const NarrativeSchema = z.object({ analysis: z.string().min(1) });
            const parsed = NarrativeSchema.parse(JSON.parse(response.text));
            return { analysis: parsed.analysis, modelUsed };
          }
        : undefined,
    };

    const result = await runForensicAutopsyCore(deps, body);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Forensic Autopsy Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Unknown error' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
