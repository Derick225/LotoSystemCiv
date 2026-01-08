
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// LISTE DES SUPER ADMINS (Emails qui ont toujours accès, même sans le rôle DB)
// Ajoutez votre email de production ici
const SUPER_ADMINS = [
    'admin@lotopro.com',
    'admin@nexus.com',
    'votre_email_perso@gmail.com' // REMPLACEZ CECI PAR VOTRE EMAIL
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Configuration Serveur critique manquante (SERVICE_ROLE_KEY).");
    }
    
    // Client Admin (Service Role) pour gérer auth.users
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Vérification de l'utilisateur appelant
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Token d'autorisation manquant.");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) throw new Error("Utilisateur non authentifié ou token invalide.");

    // VÉRIFICATION DES DROITS (Rôle DB OU Email Whitelist)
    const hasAdminRole = user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin';
    const isSuperAdmin = user.email && SUPER_ADMINS.includes(user.email);

    if (!hasAdminRole && !isSuperAdmin) {
        console.error(`[Access Denied] User ${user.email} tried to access admin-users.`);
        return new Response(JSON.stringify({ error: "Accès refusé. Privilèges Admin requis." }), { status: 403, headers: corsHeaders });
    }

    const { action, userId, role } = await req.json();

    if (action === 'list') {
        // Récupération de la liste des utilisateurs
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });
        
        if (error) throw error;

        // On récupère aussi les infos de profil public/préférences pour enrichir
        const userIds = users.map(u => u.id);
        
        // Note: user_preferences peut ne pas contenir tous les users, on gère le cas
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
        if (!userId || !role) throw new Error("Paramètres manquants pour updateRole");
        
        // Mise à jour des metadata Auth
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            app_metadata: { role: role },
            user_metadata: { role: role } // On met à jour les deux pour la compatibilité
        });
        
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
        if (!userId) throw new Error("ID utilisateur manquant");
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Action inconnue: ${action}`);

  } catch (error: any) {
    console.error("[Admin Function Error]", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
