-- ==============================================================================
-- MIGRATION: UNIFIED IDEMPOTENT FORENSIC AUTOPSY & CLOSED-LOOP LEARNING
-- Version: v12.1-unified-cf
-- Date: 2026-11-18
-- ==============================================================================
-- Défensive et idempotente : garantit l'existence des tables et colonnes
-- même sur d'anciennes bases créées avant les migrations v12.0.

-- 0. S'assurer que public.prediction_snapshots et public.predictions ont les colonnes attendues
ALTER TABLE IF EXISTS public.prediction_snapshots
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS actual_numbers INTEGER[],
  ADD COLUMN IF NOT EXISTS near_misses JSONB,
  ADD COLUMN IF NOT EXISTS autopsy_report JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.predictions
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feedback JSONB;

-- 1. Garantir la table et les colonnes de public.post_mortem_reviews + unicité (snapshot_id, draw_result_id, model_version)
CREATE TABLE IF NOT EXISTS public.post_mortem_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.prediction_snapshots(id) ON DELETE CASCADE,
  draw_name TEXT NOT NULL,
  draw_date DATE NOT NULL,
  exact_hits INTEGER NOT NULL CHECK (exact_hits BETWEEN 0 AND 5),
  near_miss_count INTEGER NOT NULL DEFAULT 0,
  brier_score NUMERIC NOT NULL,
  sliding_window_yield NUMERIC,
  prudence_mode_triggered BOOLEAN DEFAULT FALSE,
  calibration_delta_slope NUMERIC NOT NULL DEFAULT 0.0,
  calibration_delta_intercept NUMERIC NOT NULL DEFAULT 0.0,
  entropy_dampener_value NUMERIC NOT NULL DEFAULT 1.0,
  weight_deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  counterfactual_analysis JSONB,
  ai_forensic_critique TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.post_mortem_reviews
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'v12.1-unified-cf',
  ADD COLUMN IF NOT EXISTS draw_name TEXT,
  ADD COLUMN IF NOT EXISTS draw_date DATE,
  ADD COLUMN IF NOT EXISTS exact_hits INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS near_miss_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brier_score NUMERIC,
  ADD COLUMN IF NOT EXISTS log_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS calibration_ece NUMERIC,
  ADD COLUMN IF NOT EXISTS brier_skill_vs_uniform NUMERIC,
  ADD COLUMN IF NOT EXISTS brier_skill_vs_historical NUMERIC,
  ADD COLUMN IF NOT EXISTS sliding_window_yield NUMERIC,
  ADD COLUMN IF NOT EXISTS prudence_mode_triggered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calibration_delta_slope NUMERIC NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS calibration_delta_intercept NUMERIC NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS entropy_dampener_value NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uncertainty_se NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS counterfactual_analysis JSONB,
  ADD COLUMN IF NOT EXISTS learning_audit JSONB,
  ADD COLUMN IF NOT EXISTS ai_forensic_critique TEXT;

ALTER TABLE public.post_mortem_reviews
  DROP CONSTRAINT IF EXISTS unique_snapshot_review;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mortem_unique_tuple
  ON public.post_mortem_reviews (snapshot_id, draw_result_id, model_version)
  WHERE draw_result_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mortem_legacy_snapshot
  ON public.post_mortem_reviews (snapshot_id, model_version)
  WHERE draw_result_id IS NULL;

-- 2. Garantir la table et les colonnes de public.model_performance_metrics + unicité (snapshot_id, draw_result_id, model_version)
CREATE TABLE IF NOT EXISTS public.model_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_name TEXT NOT NULL,
  date DATE,
  exact_matches INTEGER NOT NULL DEFAULT 0,
  partial_matches_2_5 BOOLEAN,
  partial_matches_3_5 BOOLEAN,
  partial_matches_4_5 BOOLEAN,
  brier_score NUMERIC,
  near_miss_count INTEGER,
  sliding_window_yield NUMERIC,
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.model_performance_metrics
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.prediction_snapshots(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS draw_name TEXT,
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS exact_matches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_matches_2_5 BOOLEAN,
  ADD COLUMN IF NOT EXISTS partial_matches_3_5 BOOLEAN,
  ADD COLUMN IF NOT EXISTS partial_matches_4_5 BOOLEAN,
  ADD COLUMN IF NOT EXISTS brier_score NUMERIC,
  ADD COLUMN IF NOT EXISTS near_miss_count INTEGER,
  ADD COLUMN IF NOT EXISTS sliding_window_yield NUMERIC,
  ADD COLUMN IF NOT EXISTS model_version TEXT,
  ADD COLUMN IF NOT EXISTS log_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS calibration_error NUMERIC,
  ADD COLUMN IF NOT EXISTS uniform_brier_baseline NUMERIC,
  ADD COLUMN IF NOT EXISTS uniform_log_loss_baseline NUMERIC,
  ADD COLUMN IF NOT EXISTS historical_brier_baseline NUMERIC,
  ADD COLUMN IF NOT EXISTS historical_log_loss_baseline NUMERIC,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uncertainty_se NUMERIC,
  ADD COLUMN IF NOT EXISTS learning_audit JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_metrics_snapshot_result_version
  ON public.model_performance_metrics (snapshot_id, draw_result_id, model_version)
  WHERE snapshot_id IS NOT NULL AND draw_result_id IS NOT NULL AND model_version IS NOT NULL;

-- 3. Garantir toutes les colonnes de public.forensic_reports (dont draw_result_id si ancienne table)
CREATE TABLE IF NOT EXISTS public.forensic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prediction_id UUID,
  draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
  draw_name TEXT,
  draw_date TEXT,
  report_data JSONB NOT NULL,
  ai_model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.forensic_reports
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS prediction_id UUID,
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS draw_name TEXT,
  ADD COLUMN IF NOT EXISTS draw_date TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'v12.1-unified-cf',
  ADD COLUMN IF NOT EXISTS report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_model_used TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forensic_reports_pred_result_version
  ON public.forensic_reports (prediction_id, draw_result_id, model_version)
  WHERE prediction_id IS NOT NULL AND draw_result_id IS NOT NULL AND model_version IS NOT NULL;

-- 4. Garantir la table et les colonnes de public.model_weights_config + index unique draw_name
CREATE TABLE IF NOT EXISTS public.model_weights_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_name TEXT NOT NULL,
  weights JSONB NOT NULL,
  sigmoid_slope NUMERIC DEFAULT 1.0,
  sigmoid_intercept NUMERIC DEFAULT 0.0,
  boosting_multiplier NUMERIC DEFAULT 1.0,
  prudence_mode_active BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_model_weights_config_draw UNIQUE (draw_name)
);

ALTER TABLE public.model_weights_config
  ADD COLUMN IF NOT EXISTS sigmoid_slope NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS sigmoid_intercept NUMERIC DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS boosting_multiplier NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS prudence_mode_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'v12.1-unified-cf',
  ADD COLUMN IF NOT EXISTS last_autopsy_key TEXT,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audit JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_weights_config_draw_name
  ON public.model_weights_config (draw_name);

-- 4b. Garantir l'activation RLS sans écraser les politiques existantes
ALTER TABLE public.post_mortem_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_weights_config ENABLE ROW LEVEL SECURITY;

-- 5. RPC transactionnelle atomique & idempotente pour l'autopsie post-mortem
CREATE OR REPLACE FUNCTION public.apply_forensic_autopsy_atomic(
  p_snapshot_id UUID,
  p_draw_result_id UUID,
  p_model_version TEXT,
  p_user_id UUID,
  p_draw_name TEXT,
  p_draw_date DATE,
  p_exact_hits INTEGER,
  p_near_miss_count INTEGER,
  p_brier_score NUMERIC,
  p_log_loss NUMERIC,
  p_calibration_ece NUMERIC,
  p_brier_skill_uniform NUMERIC,
  p_brier_skill_historical NUMERIC,
  p_uniform_brier NUMERIC,
  p_uniform_log_loss NUMERIC,
  p_historical_brier NUMERIC,
  p_historical_log_loss NUMERIC,
  p_sliding_window_yield NUMERIC,
  p_prudence_mode BOOLEAN,
  p_delta_slope NUMERIC,
  p_delta_intercept NUMERIC,
  p_entropy_dampener NUMERIC,
  p_sample_size INTEGER,
  p_uncertainty_se NUMERIC,
  p_weight_deltas JSONB,
  p_counterfactual_analysis JSONB,
  p_learning_audit JSONB,
  p_ai_forensic_critique TEXT,
  p_ai_model_used TEXT,
  p_final_report JSONB,
  p_actual_numbers INTEGER[],
  p_near_misses_details JSONB,
  p_updated_weights JSONB,
  p_sigmoid_slope NUMERIC,
  p_sigmoid_intercept NUMERIC,
  p_boosting_multiplier NUMERIC,
  p_predicted_numbers INTEGER[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_report JSONB;
  v_autopsy_key TEXT;
BEGIN
  v_autopsy_key := p_snapshot_id::TEXT || ':' || p_draw_result_id::TEXT || ':' || p_model_version;

  -- Verrou pessimiste sur le snapshot pour empêcher toute course parallèle
  SELECT autopsy_report
    INTO v_existing_report
    FROM public.prediction_snapshots
   WHERE id = p_snapshot_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot % introuvable', p_snapshot_id;
  END IF;

  -- Vérification d'idempotence stricte par (snapshot_id, draw_result_id, model_version)
  IF EXISTS (
    SELECT 1
      FROM public.post_mortem_reviews
     WHERE snapshot_id = p_snapshot_id
       AND draw_result_id = p_draw_result_id
       AND model_version = p_model_version
  ) THEN
    RETURN jsonb_build_object(
      'applied', FALSE,
      'idempotent_hit', TRUE,
      'autopsy_key', v_autopsy_key,
      'report', COALESCE(v_existing_report, p_final_report)
    );
  END IF;

  INSERT INTO public.post_mortem_reviews (
    snapshot_id,
    draw_result_id,
    model_version,
    draw_name,
    draw_date,
    exact_hits,
    near_miss_count,
    brier_score,
    log_loss,
    calibration_ece,
    brier_skill_vs_uniform,
    brier_skill_vs_historical,
    sliding_window_yield,
    prudence_mode_triggered,
    calibration_delta_slope,
    calibration_delta_intercept,
    entropy_dampener_value,
    sample_size,
    uncertainty_se,
    weight_deltas,
    counterfactual_analysis,
    learning_audit,
    ai_forensic_critique
  ) VALUES (
    p_snapshot_id,
    p_draw_result_id,
    p_model_version,
    p_draw_name,
    p_draw_date,
    p_exact_hits,
    p_near_miss_count,
    p_brier_score,
    p_log_loss,
    p_calibration_ece,
    p_brier_skill_uniform,
    p_brier_skill_historical,
    p_sliding_window_yield,
    p_prudence_mode,
    p_delta_slope,
    p_delta_intercept,
    p_entropy_dampener,
    p_sample_size,
    p_uncertainty_se,
    p_weight_deltas,
    p_counterfactual_analysis,
    p_learning_audit,
    p_ai_forensic_critique
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.model_performance_metrics (
    snapshot_id,
    draw_result_id,
    draw_name,
    date,
    exact_matches,
    partial_matches_2_5,
    partial_matches_3_5,
    partial_matches_4_5,
    brier_score,
    log_loss,
    calibration_error,
    uniform_brier_baseline,
    uniform_log_loss_baseline,
    historical_brier_baseline,
    historical_log_loss_baseline,
    near_miss_count,
    sliding_window_yield,
    model_version,
    sample_size,
    uncertainty_se,
    learning_audit
  ) VALUES (
    p_snapshot_id,
    p_draw_result_id,
    p_draw_name,
    p_draw_date,
    p_exact_hits,
    p_exact_hits >= 2,
    p_exact_hits >= 3,
    p_exact_hits >= 4,
    p_brier_score,
    p_log_loss,
    p_calibration_ece,
    p_uniform_brier,
    p_uniform_log_loss,
    p_historical_brier,
    p_historical_log_loss,
    p_near_miss_count,
    p_sliding_window_yield,
    p_model_version,
    p_sample_size,
    p_uncertainty_se,
    p_learning_audit
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.forensic_reports (
    user_id,
    prediction_id,
    draw_name,
    draw_date,
    draw_result_id,
    model_version,
    report_data,
    ai_model_used
  ) VALUES (
    p_user_id,
    p_snapshot_id,
    p_draw_name,
    p_draw_date::TEXT,
    p_draw_result_id,
    p_model_version,
    p_final_report,
    p_ai_model_used
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.model_weights_config (
    draw_name,
    weights,
    sigmoid_slope,
    sigmoid_intercept,
    boosting_multiplier,
    prudence_mode_active,
    model_version,
    last_autopsy_key,
    sample_size,
    last_audit,
    updated_at
  ) VALUES (
    p_draw_name,
    p_updated_weights,
    p_sigmoid_slope,
    p_sigmoid_intercept,
    p_boosting_multiplier,
    p_prudence_mode,
    p_model_version,
    v_autopsy_key,
    p_sample_size,
    p_learning_audit,
    NOW()
  )
  ON CONFLICT (draw_name) DO UPDATE SET
    weights = EXCLUDED.weights,
    sigmoid_slope = EXCLUDED.sigmoid_slope,
    sigmoid_intercept = EXCLUDED.sigmoid_intercept,
    boosting_multiplier = EXCLUDED.boosting_multiplier,
    prudence_mode_active = EXCLUDED.prudence_mode_active,
    model_version = EXCLUDED.model_version,
    last_autopsy_key = EXCLUDED.last_autopsy_key,
    sample_size = EXCLUDED.sample_size,
    last_audit = EXCLUDED.last_audit,
    updated_at = NOW();

  UPDATE public.prediction_snapshots
     SET status = 'COMPLETED',
         actual_numbers = p_actual_numbers,
         near_misses = p_near_misses_details,
         autopsy_report = p_final_report,
         updated_at = NOW()
   WHERE id = p_snapshot_id;

  IF p_user_id IS NOT NULL THEN
    UPDATE public.predictions
       SET draw_result_id = p_draw_result_id,
           feedback = jsonb_build_object(
             'matches', p_exact_hits,
             'nearMisses', p_near_miss_count,
             'autopsyId', p_snapshot_id,
             'modelVersion', p_model_version
           )
     WHERE id IN (
       SELECT id
         FROM public.predictions
        WHERE user_id = p_user_id
          AND draw_name = p_draw_name
          AND (prediction->'suggestedNumbers') = to_jsonb(p_predicted_numbers)
        ORDER BY timestamp DESC
        LIMIT 1
     );
  END IF;

  RETURN jsonb_build_object(
    'applied', TRUE,
    'idempotent_hit', FALSE,
    'autopsy_key', v_autopsy_key,
    'report', p_final_report
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[]
) TO service_role;
