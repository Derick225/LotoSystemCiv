import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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
    
    // Sécurisation de l'endpoint
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
    const { predictionId, rating, drawName, actualHits, user_comment } = body

    if (!predictionId || !rating || !drawName) {
        throw new Error("Paramètres manquants (predictionId, rating, drawName)")
    }

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
    // Si l'utilisateur donne un avis positif, on renforce légèrement l'ADN actuel
    // Si négatif, on le pénalise
    const { data: algoData } = await supabase
        .from('algo_weights')
        .select('weights')
        .eq('draw_name', drawName)
        .single()

    if (algoData && algoData.weights) {
        const weights = { ...algoData.weights }
        const adjustment = rating === 'Visionnaire' ? 0.05 : (rating === 'Incohérente' ? -0.05 : 0)
        
        if (adjustment !== 0) {
            // On ajuste tous les poids proportionnellement
            let sum = 0
            for (const key in weights) {
                weights[key] = Math.max(0.01, Math.min(1.0, weights[key] + adjustment))
                sum += weights[key]
            }
            
            // Normalisation
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

  } catch (error: any) {
    console.error("RLHF Error:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
