import { z } from 'zod';

/**
 * Schémas Zod & Interfaces Typées pour le Service de Synchronisation Cloud <-> Local
 * Garantit la validation structurelle au runtime et l'isolation stricte des tirages (TIRAGE ISOLATION RULE).
 */

export const PredictionFeedbackSchema = z.object({
  keyLearning: z.string().default(''),
  userRating: z.enum(['Visionnaire', 'Standard', 'Incohérente']).or(z.string()),
  userComment: z.string().default(''),
});
export type PredictionFeedback = z.infer<typeof PredictionFeedbackSchema>;

export const ScoreBreakdownSchema = z.record(z.string(), z.number());
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const PredictionPayloadSchema = z.object({
  suggestedNumbers: z.array(z.number()),
  candidates: z.array(z.number()),
  confidence: z.number(),
  analysis: z.string().default(''),
  breakdown: z.record(z.union([z.number(), z.string()]), z.record(z.string(), z.number())).default({}),
  timestamp: z.number(),
  engineType: z.enum(['local', 'cloud']).optional(),
  isSimulation: z.boolean().optional(),
  isExploratory: z.boolean().optional(),
  simulationCategory: z.enum(['WHAT_IF', 'SCENARIO', 'EXPLORATORY', 'BACKTEST', 'BENCHMARK']).optional(),
  scenarioName: z.string().optional(),
  mathModelSummary: z.string().optional(),
  realityAlignment: z.number().optional(),
  adversarialApplied: z.boolean().optional(),
  challengedNumbers: z.array(z.number()).optional(),
  stabilityScore: z.number().optional(),
}).passthrough();
export type PredictionPayload = z.infer<typeof PredictionPayloadSchema>;

export const CloudPredictionMetaSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  draw_name: z.string(),
  draw_result_id: z.string().nullable().optional(),
  feedback: z.unknown().optional(),
});
export type CloudPredictionMeta = z.infer<typeof CloudPredictionMetaSchema>;

export const CloudPredictionRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  draw_name: z.string(),
  timestamp: z.number(),
  prediction: z.unknown(),
  draw_result_id: z.string().nullable().optional(),
  feedback: z.unknown().optional(),
  created_at: z.string().optional(),
});
export type CloudPredictionRow = z.infer<typeof CloudPredictionRowSchema>;

export const CloudForensicReportMetaSchema = z.object({
  id: z.string(),
  draw_date: z.string(),
  draw_name: z.string(),
  prediction_id: z.string().nullable().optional(),
});
export type CloudForensicReportMeta = z.infer<typeof CloudForensicReportMetaSchema>;

export const CloudForensicReportRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  prediction_id: z.string().nullable().optional(),
  draw_result_id: z.string().nullable().optional(),
  draw_name: z.string().nullable().optional(),
  draw_date: z.string().nullable().optional(),
  report_data: z.unknown(),
  ai_model_used: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type CloudForensicReportRow = z.infer<typeof CloudForensicReportRowSchema>;

export const CloudPredictionSnapshotSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable().optional(),
  draw_name: z.string(),
  target_date: z.string().nullable().optional(),
  predicted_numbers: z.array(z.number()),
  decision_dna: z.unknown().optional(),
  metrics_snapshot: z.unknown().optional(),
  status: z.string().default('PENDING'),
  actual_numbers: z.array(z.number()).nullable().optional(),
  near_misses: z.unknown().optional(),
  autopsy_report: z.unknown().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type CloudPredictionSnapshot = z.infer<typeof CloudPredictionSnapshotSchema>;

export const OfflineQueuePayloadTypeSchema = z.enum([
  'prediction_snapshot',
  'learning_log',
  'learning_session',
]);
export type OfflineQueuePayloadType = z.infer<typeof OfflineQueuePayloadTypeSchema>;

export const OfflineQueueItemSchema = z.object({
  id: z.string(),
  type: OfflineQueuePayloadTypeSchema,
  drawName: z.string(),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.number(),
  attempts: z.number().int().nonnegative().default(0),
});
export type OfflineQueueItem = z.infer<typeof OfflineQueueItemSchema>;

export const FusionConfigSchema = z.object({
  stability: z.number().min(0).max(1),
  chaos: z.number().min(0).max(1),
  harmony: z.number().min(0).max(1),
});
export type FusionConfig = z.infer<typeof FusionConfigSchema>;

export const UserSettingsSchema = z.object({
  sound: z.boolean().default(true),
  haptics: z.boolean().default(true),
  highPerf: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'system']).default('dark'),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserPreferencesSettingsSchema = z.object({
  sound: z.boolean().optional(),
  haptics: z.boolean().optional(),
  highPerf: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  fusion_config: FusionConfigSchema.optional(),
  bankroll: z.number().optional(),
  adaptive_rules: z.record(z.string(), z.unknown()).optional(),
  weights_history: z.record(z.string(), z.unknown()).optional(),
  custom_weights: z.record(z.string(), z.unknown()).optional(),
  custom_ui_states: z.record(z.string(), z.unknown()).optional(),
  sync_timestamp: z.string().optional(),
}).passthrough();
export type UserPreferencesSettings = z.infer<typeof UserPreferencesSettingsSchema>;

export const UserPreferencesRowSchema = z.object({
  user_id: z.string().uuid(),
  watchlist: z.array(z.number()).default([]),
  saved_tickets: z.array(z.unknown()).default([]),
  settings: UserPreferencesSettingsSchema.optional(),
  updated_at: z.string().optional(),
});
export type UserPreferencesRow = z.infer<typeof UserPreferencesRowSchema>;
