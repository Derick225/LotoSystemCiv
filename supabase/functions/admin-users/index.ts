
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- CONFIGURATION CRITIQUE ---
// Ajoutez ici votre email de connexion pour contourner la vérification de rôle
// Cela vous permet de devenir Admin même si la BDD dit "user"
const SUPER_ADMIN_EMAILS = [
    'admin@lotopro.com',
    'votre_email@gmail.com' // <--- REMPLACEZ CECI PAR VOTRE EMAIL DE CONNEXION
];

serve(async (req: Request) => {
  // Gestion Preflight CORS (Indispensable pour le navigateur)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Initialisation Admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseKey) {
        throw new Error("Secret SUPABASE_SERVICE_ROLE_KEY introuvable dans les paramètres de la fonction.");
    }
    
    // Client avec droits suprêmes (Service Role)
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    // 2. Vérification de l'appelant (Qui êtes-vous ?)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Token d'autorisation manquant (Non connecté).");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        console.error("Auth Error:", authError);
        throw new Error("Token invalide ou utilisateur introuvable.");
    }

    // 3. Vérification des Privilèges (Rôle DB OU Whitelist Email)
    const hasAdminRole = user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin';
    const isWhitelisted = user.email && SUPER_ADMIN_EMAILS.includes(user.email);

    if (!hasAdminRole && !isWhitelisted) {
        console.error(`[Security Alert] Accès refusé pour : ${user.email}`);
        return new Response(JSON.stringify({ 
            error: "Accès refusé. Vous n'êtes pas administrateur.",
            detail: "Ajoutez votre email à la constante SUPER_ADMIN_EMAILS dans le code de la fonction."
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Traitement de la demande
    const { action, userId, role } = await req.json();

    if (action === 'list') {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });
        
        if (error) throw error;

        // Enrichissement avec les données publiques
        const userIds = users.map(u => u.id);
        const { data: prefs } = await supabaseAdmin
            .from('user_preferences')
            .select('user_id, subscription')
            .in('user_id', userIds);

        const enrichedUsers = users.map(u => {
            const pref = prefs?.find(p => p.user_id === u.id);
            return {
                id: u.id,
                email: u.email,
                last_sign_in: u.last_sign_in_at,
                created_at: u.created_at,
                role: u.app_metadata?.role || 'user',
                subscription: pref?.subscription || null
            };
        });

        return new Response(JSON.stringify({ users: enrichedUsers }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'updateRole') {
        if (!userId || !role) throw new Error("ID ou Rôle manquant.");
        
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            app_metadata: { role: role },
            user_metadata: { role: role }
        });
        
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
        if (!userId) throw new Error("ID utilisateur manquant.");
        
        // Suppression Auth (Cascade automatique si FK configurées, sinon nettoyage manuel recommandé)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        
        // Nettoyage manuel de sécurité pour user_preferences
        await supabaseAdmin.from('user_preferences').delete().eq('user_id', userId);

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Action inconnue: ${action}`);

  } catch (error: any) {
    console.error("[Admin Function Error]", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
