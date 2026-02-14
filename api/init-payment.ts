
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
    const { userId, amount, provider } = await req.json();
    
    const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
    const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID || !SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Configuration Serveur manquante (API Keys)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const transactionId = crypto.randomUUID();
    const { error: dbError } = await supabase.from('transactions').insert({
        transaction_id: transactionId,
        user_id: userId,
        amount,
        provider,
        status: 'PENDING'
    });

    if (dbError) throw dbError;

    const payload = {
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
        amount: amount,
        currency: "XOF",
        description: "Abonnement LotoPro Premium 30J",
        return_url: `${req.headers.get('origin') || 'https://lotopro.vercel.app'}/?payment=success`, 
        notify_url: `https://${req.headers.get('host')}/api/payment-webhook`,
        channels: "ALL",
        metadata: JSON.stringify({ userId, plan: 'premium' })
    };

    const response = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const paymentData = await response.json();

    if (paymentData.code !== "201") {
        throw new Error(paymentData.message || paymentData.description || "Erreur init paiement");
    }

    return new Response(JSON.stringify({ 
        payment_url: paymentData.data.payment_url 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
}