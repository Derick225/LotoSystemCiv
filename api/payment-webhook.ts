
import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let transaction_id;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
        const body = await req.json();
        transaction_id = body.cpm_trans_id;
    } else {
        const formData = await req.formData();
        transaction_id = formData.get('cpm_trans_id');
    }
    
    if (!transaction_id) throw new Error("Transaction ID manquant");

    const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
    const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Config Supabase manquante");

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const verifyResp = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            apikey: CINETPAY_API_KEY,
            site_id: CINETPAY_SITE_ID,
            transaction_id: transaction_id
        })
    });
    
    const verifyData = await verifyResp.json();
    
    if (verifyData.code === '00') { 
        const { metadata } = verifyData.data;
        const metaObj = JSON.parse(metadata || '{}');
        const userId = metaObj.userId;

        await supabase.from('transactions')
            .update({ 
                status: 'ACCEPTED', 
                payment_token: verifyData.data.payment_token 
            })
            .eq('transaction_id', transaction_id);

        if (userId) {
            const now = new Date();
            const expiresAt = new Date();
            expiresAt.setDate(now.getDate() + 30);
            
            await supabase.from('user_preferences').upsert({
                user_id: userId,
                subscription: {
                    status: 'active',
                    plan: 'premium',
                    start_date: now.toISOString(),
                    expires_at: expiresAt.toISOString()
                },
                updated_at: now.toISOString()
            });
        }
        
        return new Response("OK", { status: 200 });
    } else {
         await supabase.from('transactions')
            .update({ status: 'FAILED' })
            .eq('transaction_id', transaction_id);
            
         return new Response("Payment Failed or Pending", { status: 200 });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
}