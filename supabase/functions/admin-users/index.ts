
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- CONFIGURATION CRITIQUE ---
// Ajoutez ici votre email pour obtenir les droits Admin instantanément
const SUPER_ADMIN_EMAILS = [
    'admin@lotopro.com',
    'votre_email@gmail.com' // <--- REMPLACEZ CECI PAR VOTRE EMAIL DE CONNEXION
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Clé SUPABASE_SERVICE_ROLE_KEY manquante dans les secrets Supabase.");
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Token manquant.");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) throw new Error("Utilisateur introuvable.");

    const dbRole = user.app_metadata?.role || '';
    const isWhitelisted = user.email && SUPER_ADMIN_EMAILS.includes(user.email);

    if (dbRole !== 'admin' && !isWhitelisted) {
        return new Response(JSON.stringify({ 
            error: "Accès refusé: Vous n'êtes pas admin.",
            detail: "Ajoutez votre email à SUPER_ADMIN_EMAILS dans le code de la fonction."
        }), { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    const { action, userId, role } = await req.json();

    if (action === 'list') {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;

        const userIds = users.map(u => u.id);
        const { data: prefs } = await supabaseAdmin.from('user_preferences').select('user_id, subscription').in('user_id', userIds);

        const enriched = users.map(u => ({
            id: u.id,
            email: u.email,
            last_sign_in: u.last_sign_in_at,
            created_at: u.created_at,
            role: u.app_metadata?.role || 'user',
            subscription: prefs?.find(p => p.user_id === u.id)?.subscription || null
        }));

        return new Response(JSON.stringify({ users: enriched }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateRole') {
        if (!userId || !role) throw new Error("Paramètres manquants.");
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            app_metadata: { role },
            user_metadata: { role }
        });
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
        if (!userId) throw new Error("ID manquant.");
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        await supabaseAdmin.from('user_preferences').delete().eq('user_id', userId);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Action inconnue: ${action}`);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});