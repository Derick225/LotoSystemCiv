import { createClient } from "supabase";
import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts";

const AdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), page: z.number().default(1), pageSize: z.number().default(50) }),
  z.object({ action: z.literal("updateRole"), userId: z.string().uuid(), role: z.string() }),
  z.object({ action: z.literal("delete"), userId: z.string().uuid() })
]);

export async function handleAdminUsers(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
        });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Check if user is admin
    if (user.app_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const body = reqBody || await req.json();
    const validation = AdminActionSchema.safeParse(body);

    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid Action payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const params = validation.data;

    if (params.action === 'list') {
      // Implementation with pagination
      const { data: users, error: listError } = await supabaseClient.auth.admin.listUsers({
        page: params.page,
        perPage: params.pageSize
      });
      if (listError) throw listError;

      const paginatedUsersList = users.users;

      const { data: subs, error: subsError } = await supabaseClient
        .from('subscriptions')
        .select('*');
      if (subsError) throw subsError;

      const subMap = new Map(subs.map(s => [s.user_id, s]));

      const combinedUsers = paginatedUsersList.map(u => {
        const sub = subMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          last_sign_in: u.last_sign_in_at,
          created_at: u.created_at,
          role: u.app_metadata?.role || 'user',
          subscription: sub || null
        };
      });

      return new Response(JSON.stringify({ 
        users: combinedUsers,
        total: users.total || 0,
        page: params.page,
        pageSize: params.pageSize
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (params.action === 'updateRole') {
      const { error: updateError } = await supabaseClient.auth.admin.updateUserById(params.userId, {
        app_metadata: { role: params.role }
      });
        
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (params.action === 'delete') {
      const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(params.userId);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    throw new Error('Invalid action');

  } catch (error: unknown) {
    console.error("[ADMIN ERROR]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
}
