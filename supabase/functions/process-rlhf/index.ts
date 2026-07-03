import { createClient } from 'supabase'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts"

const RLHFRequestSchema = z.object({
    predictionId: z.string().uuid(),
    rating: z.enum(['Visionnaire', 'Performante', 'Incohérente', 'Échec total']),
    drawName: z.string(),
    actualHits: z.number().optional(),
    user_comment: z.string().optional()
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Configuration Supabase manquante.")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Non autorisé." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
    }

    const body = await req.json()
    const validation = RLHFRequestSchema.safeParse(body);

    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid RLHF payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { predictionId, rating, drawName, actualHits, user_comment } = validation.data;

    // 1. Enregistrer le feedback dans la table predictions
    const { error: updateError } = await supabase
        .from('predictions')
        .update({
            feedback: {
                userRating: rating,
                userComment: user_comment,
                actualHits: actualHits,
                processedAt: new Date().toISOString()
            }
        })
        .eq('id', predictionId)
        .eq('user_id', user.id)

    if (updateError) {
        console.error("Erreur lors de la mise à jour de la prédiction:", updateError)
    }

    // 2. Ajuster les poids (RLHF)
    const { data: algoData } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single()

    if (algoData && algoData.weights) {
        const weights = { ...algoData.weights }
        const ratingWeights: Record<string, number> = {
            'Visionnaire': Math.exp(-3.0),
            'Performante': Math.exp(-4.0),
            'Incohérente': -Math.exp(-3.0),
            'Échec total': -Math.exp(-2.0)
        };
        const adjustment = ratingWeights[rating] || 0.0;
        
        if (Math.abs(adjustment) > 0) {
            let sum = 0
            for (const key in weights) {
                weights[key] = Math.max(Math.exp(-4.0), Math.min(1.0, weights[key] * Math.exp(adjustment)))
                sum += weights[key]
            }
            
            if (sum > 0) {
                for (const key in weights) {
                    weights[key] = weights[key] / sum
                }
            }

            await supabase
                .from('algo_weights')
                .update({ weights, updated_at: new Date().toISOString() })
                .eq('draw_name', drawName)
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        message: "Feedback RLHF traité avec succès."
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: unknown) {
    console.error("RLHF Error:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
