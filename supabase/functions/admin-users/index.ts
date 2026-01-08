
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Client Admin (Service Role) pour gérer auth.users
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Vérification de l'utilisateur appelant (doit être Admin)
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) throw new Error("Non authentifié.");

    // Vérification simple du rôle (via metadata ou whitelist email hardcodée pour sécurité ultime)
    const isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin';
    if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Accès refusé. Privilèges Admin requis." }), { status: 403, headers: corsHeaders });
    }

    const { action, userId, role } = await req.json();

    if (action === 'list') {
        // Récupération de la liste des utilisateurs (Pagination simplifiée pour l'exemple)
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000
        });
        if (error) throw error;

        // On récupère aussi les infos de profil public/préférences pour enrichir
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
        if (!userId || !role) throw new Error("Paramètres manquants");
        
        // Mise à jour des metadata Auth
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            app_metadata: { role: role }
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

    throw new Error("Action inconnue");

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
