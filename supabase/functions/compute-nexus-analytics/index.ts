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
    const { drawName } = body

    if (!drawName) {
        throw new Error("Paramètre manquant: drawName")
    }

    // 1. Fetch recent results
    const { data: results, error: fetchError } = await supabase
        .from('draw_results')
        .select('gagnants, date')
        .eq('draw_name', drawName)
        .order('date', { ascending: false })
        .limit(100)

    if (fetchError) throw fetchError

    if (!results || results.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "Pas de données pour l'analyse." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Compute basic analytics (frequencies, hot/cold numbers)
    const frequencies: Record<number, number> = {}
    results.forEach(r => {
        r.gagnants.forEach((n: number) => {
            frequencies[n] = (frequencies[n] || 0) + 1
        })
    })

    const sortedFrequencies = Object.entries(frequencies)
        .map(([num, count]) => ({ number: parseInt(num), count }))
        .sort((a, b) => b.count - a.count)

    const hotNumbers = sortedFrequencies.slice(0, 5).map(x => x.number)
    const coldNumbers = sortedFrequencies.slice(-5).map(x => x.number).reverse()

    // 3. Store analytics in a table or just return them
    // For now, we just return them as we might not have a specific table for it
    // Or we could store it in a generic settings/cache table if it existed.
    
    return new Response(JSON.stringify({ 
        success: true, 
        analytics: {
            drawName,
            analyzedDraws: results.length,
            hotNumbers,
            coldNumbers,
            lastUpdate: new Date().toISOString()
        }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error("Analytics Error:", error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
