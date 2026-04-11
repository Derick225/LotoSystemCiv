
import { supabase, SUPABASE_URL } from './supabaseClient';

export interface PaymentConfig {
    provider: 'CINETPAY' | 'STRIPE' | 'WAVE';
    apiKey: string;
    siteId?: string; // For CinetPay
    secretKey?: string; // For Stripe (Backend only usually, but for client-side Stripe.js)
}

export interface PaymentRequest {
    amount: number;
    currency: string;
    description: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    transactionId: string;
    userId: string;
}

// CinetPay SDK Loader
const loadCinetPay = () => {
    return new Promise<void>((resolve, reject) => {
        if ((window as any).CinetPay) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdn.cinetpay.com/seamless/main.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load CinetPay SDK"));
        document.body.appendChild(script);
    });
};

export const initiateRealPayment = async (config: PaymentConfig, request: PaymentRequest): Promise<{ success: boolean; message: string; transactionId?: string }> => {
    
    if (config.provider === 'CINETPAY') {
        try {
            await loadCinetPay();
            
            return new Promise((resolve) => {
                // @ts-ignore
                CinetPay.setConfig({
                    apikey: config.apiKey,
                    site_id: config.siteId,
                    notify_url: `${SUPABASE_URL}/functions/v1/payment-webhook`,
                    mode: 'PRODUCTION'
                });

                // @ts-ignore
                CinetPay.getCheckout({
                    transaction_id: request.transactionId,
                    amount: request.amount,
                    currency: request.currency,
                    channels: 'ALL',
                    description: request.description,
                    customer_name: request.customerName,
                    customer_surname: "",
                    customer_email: request.customerEmail,
                    customer_phone_number: request.customerPhone,
                    customer_address: "ABIDJAN",
                    customer_city: "ABIDJAN",
                    customer_country: "CI",
                    customer_state: "CI",
                    customer_zip_code: "00225",
                    cpm_custom: request.userId
                });

                // @ts-ignore
                CinetPay.waitResponse((data) => {
                    if (data.status === "ACCEPTED") {
                        resolve({ success: true, message: "Paiement réussi", transactionId: request.transactionId });
                    } else {
                        resolve({ success: false, message: "Paiement échoué: " + data.message });
                    }
                });

                // @ts-ignore
                CinetPay.onError((data) => {
                    resolve({ success: false, message: "Erreur CinetPay: " + data.message });
                });
            });

        } catch (e) {
            console.error("CinetPay Error", e);
            return { success: false, message: "Erreur chargement CinetPay" };
        }
    }
    
    // Fallback / Simulation for other providers or if config missing
    console.error("Provider not implemented or config missing.");
    return { success: false, message: "Configuration de paiement manquante ou fournisseur non supporté." };
};

export const verifyTransaction = async (transactionId: string): Promise<boolean> => {
    // In a real app, this would call your backend to verify the transaction status with the provider
    const { data, error } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transactionId)
        .single();
        
    if (error) {
        console.error("Erreur lors de la vérification de la transaction:", error);
        return false;
    }
    return data?.status === 'COMPLETED';
};
