import { createClient } from 'supabase'
import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts"

const CinetPayWebhookSchema = z.object({
    cpm_trans_id: z.string(),
    cpm_amount: z.string(),
    cpm_currency: z.string(),
    cpm_custom: z.string().uuid().nullable().optional(),
    cpm_error_message: z.string().optional()
}).passthrough();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // CinetPay sends data via POST as FormData
    const formData = await req.formData()
    const rawData: Record<string, any> = {};
    formData.forEach((value, key) => {
        rawData[key] = value;
    });

    const validation = CinetPayWebhookSchema.safeParse(rawData);
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid webhook payload" }), { status: 400, headers: corsHeaders });
    }

    const data = validation.data;
    const { cpm_trans_id, cpm_amount, cpm_currency, cpm_custom } = data;

    // Verify the transaction with CinetPay API
    const apikey = Deno.env.get('CINETPAY_API_KEY')
    const site_id = Deno.env.get('CINETPAY_SITE_ID')

    if (!apikey || !site_id) {
        throw new Error("Missing CinetPay config")
    }

    const verifyResponse = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            apikey,
            site_id,
            transaction_id: cpm_trans_id
        })
    })

    const verifyData = await verifyResponse.json()

    if (verifyData.code === '00' && verifyData.data.status === 'ACCEPTED') {
        const userId = cpm_custom

        if (userId) {
            const now = new Date();
            const expiry = new Date(now);
            expiry.setDate(expiry.getDate() + 30);
            
            await supabaseClient.from('subscriptions').upsert({
                user_id: userId,
                status: 'paid',
                plan: 'premium',
                start_date: now.toISOString(),
                expires_at: expiry.toISOString(),
                updated_at: now.toISOString()
            });

            await supabaseClient.from('transactions').upsert({
                id: cpm_trans_id,
                user_id: userId,
                amount: cpm_amount,
                currency: cpm_currency,
                status: 'COMPLETED',
                provider: 'CINETPAY',
                created_at: now.toISOString()
            });
        }
    } else {
        const userId = cpm_custom
        if (userId) {
             await supabaseClient.from('transactions').upsert({
                id: cpm_trans_id,
                user_id: userId,
                amount: cpm_amount,
                currency: cpm_currency,
                status: 'FAILED',
                provider: 'CINETPAY',
                created_at: new Date().toISOString()
            });
        }
    }

    return new Response(
      JSON.stringify({ message: 'Webhook processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: unknown) {
    console.error("[PAYMENT ERROR]", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
