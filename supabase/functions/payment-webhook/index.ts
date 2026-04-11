import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // CinetPay sends data via POST
    const formData = await req.formData()
    const cpm_trans_id = formData.get('cpm_trans_id')
    const cpm_site_id = formData.get('cpm_site_id')
    const cpm_trans_date = formData.get('cpm_trans_date')
    const cpm_amount = formData.get('cpm_amount')
    const cpm_currency = formData.get('cpm_currency')
    const signature = formData.get('signature')
    const payment_method = formData.get('payment_method')
    const cel_phone_num = formData.get('cel_phone_num')
    const cpm_phone_prefixe = formData.get('cpm_phone_prefixe')
    const cpm_language = formData.get('cpm_language')
    const cpm_version = formData.get('cpm_version')
    const cpm_payment_config = formData.get('cpm_payment_config')
    const cpm_page_action = formData.get('cpm_page_action')
    const cpm_custom = formData.get('cpm_custom')
    const cpm_designation = formData.get('cpm_designation')
    const cpm_error_message = formData.get('cpm_error_message')

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
        // Payment is valid
        // Update user subscription in database
        // We need the user_id, which we can pass in cpm_custom
        const userId = cpm_custom

        if (userId) {
            const now = new Date();
            const expiry = new Date(now);
            expiry.setDate(expiry.getDate() + 30);
            
            await supabaseClient.from('user_preferences').upsert({
                user_id: userId,
                subscription: {
                    status: 'paid',
                    start_date: now.toISOString(),
                    expires_at: expiry.toISOString(),
                    plan: 'premium',
                    last_transaction_id: cpm_trans_id
                },
                updated_at: now.toISOString()
            });

            // Also log the transaction
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
        // Payment failed or invalid
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
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
