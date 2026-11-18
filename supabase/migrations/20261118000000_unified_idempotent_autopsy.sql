-- ==============================================================================
-- MIGRATION: UNIFIED IDEMPOTENT FORENSIC AUTOPSY & CLOSED-LOOP LEARNING
-- Version: v12.1-unified-cf
-- Date: 2026-11-18
-- ==============================================================================

-- 1. Enrichir public.post_mortem_reviews avec unicité (snapshot_id, draw_result_id, model_version)
ALTER TABLE public.post_mortem_reviews
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'v12.1-unified-cf',
  ADD COLUMN IF NOT EXISTS log_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS calibration_ece NUMERIC,
  ADD COLUMN IF NOT EXISTS brier_skill_vs_uniform NUMERIC,
  ADD COLUMN IF NOT EXISTS brier_skill_vs_historical NUMERIC,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uncertainty_se NUMERIC,
  ADD COLUMN IF NOT EXISTS learning_audit JSONB;

ALTER TABLE public.post_mortem_reviews
  DROP CONSTRAINT IF EXISTS unique_snapshot_review;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mortem_unique_tuple
  ON public.post_mortem_reviews (snapshot_id, draw_result_id, model_version)
  WHERE draw_result_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_mortem_legacy_snapshot
  ON public.post_mortem_reviews (snapshot_id, model_version)
  WHERE draw_result_id IS NULL;

-- 2. Enrichir public.model_performance_metrics avec unicité (snapshot_id, draw_result_id, model_version)
ALTER TABLE public.model_performance_metrics
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.prediction_snapshots(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE CASCADE,
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

-- 3. Enrichir public.forensic_reports avec model_version & index d'unicité
ALTER TABLE public.forensic_reports
  ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'v12.1-unified-cf';

CREATE UNIQUE INDEX IF NOT EXISTS idx_forensic_reports_pred_result_version
  ON public.forensic_reports (prediction_id, draw_result_id, model_version)
  WHERE prediction_id IS NOT NULL AND draw_result_id IS NOT NULL AND model_version IS NOT NULL;

-- 4. Enrichir public.model_weights_config pour audit & traçabilité
ALTER TABLE public.model_weights_config
  ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'v12.1-unified-cf',
  ADD COLUMN IF NOT EXISTS last_autopsy_key TEXT,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_audit JSONB;

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
