import { z } from "zod";
import { corsHeaders } from "../../_shared/cors.ts"

const PaymentInitSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().positive(),
    provider: z.enum(['ORANGE', 'MTN', 'WAVE', 'CINETPAY']).optional()
});

export async function handleInitPayment(req: Request, reqBody?: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = reqBody || await req.json();
    const validation = PaymentInitSchema.safeParse(body);
    
    if (!validation.success) {
        return new Response(JSON.stringify({ error: "Invalid payload", details: validation.error.format() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { userId, amount } = validation.data;

    const apikey = Deno.env.get('CINETPAY_API_KEY');
    const site_id = Deno.env.get('CINETPAY_SITE_ID');
    const return_url = Deno.env.get('CINETPAY_RETURN_URL');
    const notify_url = Deno.env.get('CINETPAY_NOTIFY_URL');

    if (!apikey || !site_id || !return_url || !notify_url) {
        throw new Error("Missing CinetPay configuration (API_KEY, SITE_ID, RETURN_URL, NOTIFY_URL) in environment variables.");
    }

    const transaction_id = `TX-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    const payload = {
        apikey,
        site_id,
        transaction_id,
        amount,
        currency: "XOF",
        description: "Abonnement Premium Nexus Platinum",
        customer_id: userId,
        customer_name: "Utilisateur",
        customer_surname: "Premium",
        customer_email: "user@example.com",
        customer_phone_number: "00000000",
        customer_address: "Abidjan",
        customer_city: "Abidjan",
        customer_country: "CI",
        customer_state: "CI",
        customer_zip_code: "225",
        notify_url,
        return_url,
        channels: "ALL",
        custom: userId // We pass userId into custom field to retrieve it in webhook
    };

    const response = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.code === '201') {
        return new Response(JSON.stringify({ success: true, payment_url: data.data.payment_url }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });
    } else {
        throw new Error(`CinetPay Error: ${data.message} - ${data.description}`);
    }

  } catch (error: any) {
    console.error("Init Payment Error:", error)
    return new Response(JSON.stringify({ success: false, error: error?.message || "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
