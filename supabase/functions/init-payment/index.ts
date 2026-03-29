
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
    const { userId, amount, provider } = await req.json();
    
    // 1. Configuration (Variables à mettre dans Supabase Secrets)
    const CINETPAY_API_KEY = Deno.env.get('CINETPAY_API_KEY');
    const CINETPAY_SITE_ID = Deno.env.get('CINETPAY_SITE_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CINETPAY_API_KEY || !CINETPAY_SITE_ID || !SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Configuration Serveur manquante (API Keys)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1.5 Validation de l'utilisateur (Sécurité)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        throw new Error("Token d'authentification manquant.");
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user || user.id !== userId) {
        return new Response(JSON.stringify({ error: "Utilisateur non authentifié ou ID invalide." }), { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // 2. Créer une transaction en base (PENDING)
    const transactionId = crypto.randomUUID();
    const { error: dbError } = await supabase.from('transactions').insert({
        transaction_id: transactionId,
        user_id: userId,
        amount,
        provider,
        status: 'PENDING'
    });

    if (dbError) throw dbError;

    // 3. Appel à CinetPay (Exemple d'intégration)
    const payload = {
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
        amount: amount,
        currency: "XOF",
        description: "Abonnement LotoPro Premium 30J",
        return_url: `${req.headers.get('origin') || 'https://lotopro-nexus.vercel.app'}/?payment=success`, 
        notify_url: `${SUPABASE_URL}/functions/v1/payment-webhook`,
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

    // 4. Renvoyer l'URL de paiement au frontend
    return new Response(JSON.stringify({ 
        payment_url: paymentData.data.payment_url 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("Init Payment Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }
});
