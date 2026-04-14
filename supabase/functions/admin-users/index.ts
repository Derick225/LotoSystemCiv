import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin access
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Check if user is admin
    const { data: adminCheck } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!adminCheck || adminCheck.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { action, userId, role } = await req.json();

    if (action === 'list') {
      const { data: users, error: listError } = await supabaseClient.auth.admin.listUsers();
      if (listError) throw listError;

      const { data: profiles, error: profilesError } = await supabaseClient
        .from('users')
        .select('id, role, subscription');
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles.map(p => [p.id, p]));

      const combinedUsers = users.users.map(u => {
        const profile = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          last_sign_in: u.last_sign_in_at,
          created_at: u.created_at,
          role: profile?.role || 'user',
          subscription: profile?.subscription || null
        };
      });

      return new Response(JSON.stringify({ users: combinedUsers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'updateRole') {
      if (!userId || !role) throw new Error('Missing userId or role');
      
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ role })
        .eq('id', userId);
        
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'delete') {
      if (!userId) throw new Error('Missing userId');
      
      const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    throw new Error('Invalid action');

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
