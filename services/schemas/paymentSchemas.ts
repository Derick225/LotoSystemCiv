import { z } from 'zod';

/**
 * Schémas Zod & Interfaces Typées pour les Services de Paiement et d'Abonnement
 * Assure la validation à l'exécution et élimine toute régression liée aux types 'any'.
 */

export const PaymentProviderSchema = z.enum(['CINETPAY', 'STRIPE', 'WAVE']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const MobileMoneyProviderSchema = z.enum(['ORANGE', 'MTN', 'WAVE']);
export type MobileMoneyProvider = z.infer<typeof MobileMoneyProviderSchema>;

export const PaymentConfigSchema = z.object({
  provider: PaymentProviderSchema,
  apiKey: z.string().min(1, 'API Key requise'),
  siteId: z.string().optional(),
  secretKey: z.string().optional(),
});
export type PaymentConfig = z.infer<typeof PaymentConfigSchema>;

export const PaymentRequestSchema = z.object({
  amount: z.number().positive('Le montant doit être strictement positif'),
  currency: z.string().min(1, 'La devise est requise'),
  description: z.string().default('Abonnement LotoPro Nexus'),
  customerName: z.string().min(1, 'Nom du client requis'),
  customerEmail: z.string().email().or(z.string()),
  customerPhone: z.string().min(1, 'Numéro de téléphone requis'),
  transactionId: z.string().min(1, 'ID de transaction requis'),
  userId: z.string().min(1, 'ID utilisateur requis'),
});
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

export const CinetPayConfigSchema = z.object({
  apikey: z.string().min(1),
  site_id: z.string().optional(),
  notify_url: z.string().url(),
  mode: z.enum(['PRODUCTION', 'TEST']).default('PRODUCTION'),
});
export type CinetPayConfig = z.infer<typeof CinetPayConfigSchema>;

export const CinetPayCheckoutParamsSchema = z.object({
  transaction_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1),
  channels: z.string().default('ALL'),
  description: z.string(),
  customer_name: z.string(),
  customer_surname: z.string().default(''),
  customer_email: z.string(),
  customer_phone_number: z.string(),
  customer_address: z.string().default('ABIDJAN'),
  customer_city: z.string().default('ABIDJAN'),
  customer_country: z.string().default('CI'),
  customer_state: z.string().default('CI'),
  customer_zip_code: z.string().default('00225'),
  cpm_custom: z.string(),
});
export type CinetPayCheckoutParams = z.infer<typeof CinetPayCheckoutParamsSchema>;

export const CinetPayCallbackDataSchema = z
  .object({
    status: z.string(),
    message: z.string().optional(),
    operator_id: z.string().optional(),
    payment_method: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    transaction_id: z.string().optional(),
  })
  .passthrough();
export type CinetPayCallbackData = z.infer<typeof CinetPayCallbackDataSchema>;

export const PaymentResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  transactionId: z.string().optional(),
});
export type PaymentResult = z.infer<typeof PaymentResultSchema>;

export const SubscriptionStatusSchema = z.enum(['active', 'trial', 'expired', 'paid']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SubscriptionPlanSchema = z.enum(['premium', 'free']);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export const SubscriptionRowSchema = z.object({
  user_id: z.string(),
  status: z.string().default('trial'),
  plan: z.string().default('premium'),
  expires_at: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type SubscriptionRow = z.infer<typeof SubscriptionRowSchema>;

export const SubscriptionStateSchema = z.object({
  status: SubscriptionStatusSchema,
  daysLeft: z.number().int().nonnegative(),
  expiresAt: z.string(),
  plan: SubscriptionPlanSchema,
});
export type SubscriptionState = z.infer<typeof SubscriptionStateSchema>;

export const InitPaymentRequestSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  provider: MobileMoneyProviderSchema,
});
export type InitPaymentRequest = z.infer<typeof InitPaymentRequestSchema>;

export const InitPaymentResponseSchema = z.object({
  payment_url: z.string().url().optional(),
  transaction_id: z.string().optional(),
  message: z.string().optional(),
});
export type InitPaymentResponse = z.infer<typeof InitPaymentResponseSchema>;

export const TransactionVerificationRowSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']).or(z.string()),
});
export type TransactionVerificationRow = z.infer<typeof TransactionVerificationRowSchema>;
