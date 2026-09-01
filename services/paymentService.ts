
import { supabase, SUPABASE_URL } from './supabaseClient';
import {
    PaymentConfig,
    PaymentRequest,
    PaymentResult,
    CinetPayConfig,
    CinetPayCheckoutParams,
    CinetPayCallbackData,
    PaymentConfigSchema,
    PaymentRequestSchema,
    CinetPayCallbackDataSchema,
    TransactionVerificationRowSchema,
} from './schemas/paymentSchemas';

export type { PaymentConfig, PaymentRequest, PaymentResult, CinetPayConfig, CinetPayCheckoutParams, CinetPayCallbackData };

interface CinetPayGlobal {
    setConfig: (config: CinetPayConfig) => void;
    getCheckout: (params: CinetPayCheckoutParams) => void;
    waitResponse: (callback: (data: CinetPayCallbackData) => void) => void;
    onError: (callback: (data: CinetPayCallbackData) => void) => void;
}

declare global {
    interface Window {
        CinetPay?: CinetPayGlobal;
    }
}

// CinetPay SDK Loader
const loadCinetPay = (): Promise<CinetPayGlobal> => {
    return new Promise<CinetPayGlobal>((resolve, reject) => {
        if (typeof window !== 'undefined' && window.CinetPay) {
            resolve(window.CinetPay);
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdn.cinetpay.com/seamless/main.js";
        script.async = true;
        script.onload = () => {
            if (window.CinetPay) {
                resolve(window.CinetPay);
            } else {
                reject(new Error("CinetPay SDK non disponible après chargement."));
            }
        };
        script.onerror = () => reject(new Error("Failed to load CinetPay SDK"));
        document.body.appendChild(script);
    });
};

export const initiateRealPayment = async (config: PaymentConfig, request: PaymentRequest): Promise<PaymentResult> => {
    const parsedConfig = PaymentConfigSchema.safeParse(config);
    if (!parsedConfig.success) {
        console.error("Configuration de paiement invalide :", parsedConfig.error.format());
        return { success: false, message: "Configuration de paiement invalide." };
    }

    const parsedRequest = PaymentRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
        console.error("Requête de paiement invalide :", parsedRequest.error.format());
        return { success: false, message: "Paramètres de paiement invalides." };
    }

    const validatedConfig = parsedConfig.data;
    const validatedRequest = parsedRequest.data;

    if (validatedConfig.provider === 'CINETPAY') {
        try {
            const cinetPay = await loadCinetPay();
            
            return new Promise((resolve) => {
                cinetPay.setConfig({
                    apikey: validatedConfig.apiKey,
                    site_id: validatedConfig.siteId,
                    notify_url: `${SUPABASE_URL}/functions/v1/nexus-api?action=payment-webhook`,
                    mode: 'PRODUCTION'
                });

                cinetPay.getCheckout({
                    transaction_id: validatedRequest.transactionId,
                    amount: validatedRequest.amount,
                    currency: validatedRequest.currency,
                    channels: 'ALL',
                    description: validatedRequest.description,
                    customer_name: validatedRequest.customerName,
                    customer_surname: "",
                    customer_email: validatedRequest.customerEmail,
                    customer_phone_number: validatedRequest.customerPhone,
                    customer_address: "ABIDJAN",
                    customer_city: "ABIDJAN",
                    customer_country: "CI",
                    customer_state: "CI",
                    customer_zip_code: "00225",
                    cpm_custom: validatedRequest.userId
                });

                cinetPay.waitResponse((rawData) => {
                    const parsedCallback = CinetPayCallbackDataSchema.safeParse(rawData);
                    const callbackData = parsedCallback.success ? parsedCallback.data : (rawData as CinetPayCallbackData);
                    if (callbackData.status === "ACCEPTED") {
                        resolve({ success: true, message: "Paiement réussi", transactionId: validatedRequest.transactionId });
                    } else {
                        resolve({ success: false, message: "Paiement échoué: " + (callbackData.message || "Statut non accepté") });
                    }
                });

                cinetPay.onError((rawData) => {
                    const parsedError = CinetPayCallbackDataSchema.safeParse(rawData);
                    const errorData = parsedError.success ? parsedError.data : (rawData as CinetPayCallbackData);
                    resolve({ success: false, message: "Erreur CinetPay: " + (errorData.message || "Erreur inconnue") });
                });
            });

        } catch (e: unknown) {
            console.error("CinetPay Error", e);
            return { success: false, message: "Erreur chargement CinetPay" };
        }
    }
    
    // Fallback / Simulation for other providers or if config missing
    console.error("Provider not implemented or config missing.");
    return { success: false, message: "Configuration de paiement manquante ou fournisseur non supporté." };
};

export const verifyTransaction = async (transactionId: string): Promise<boolean> => {
    const { data, error } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transactionId)
        .single();
        
    if (error || !data) {
        console.error("Erreur lors de la vérification de la transaction:", error);
        return false;
    }

    const parsed = TransactionVerificationRowSchema.safeParse(data);
    if (!parsed.success) {
        console.warn("Format de statut de transaction inattendu:", parsed.error);
        return false;
    }

    return parsed.data.status === 'COMPLETED';
};
