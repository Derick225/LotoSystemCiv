-- ==============================================================================
-- MIGRATION: HARDENING FORENSIC AUTOPSY ATOMICITY, VERSIONING & ANTI-POISONING
-- Version: v12.2-hardened-cf
-- Date: 2026-11-27
-- ==============================================================================
-- Corrige A.1, A.2, A.3, A.6, A.13 :
-- 1. Verrou pessimiste + versioning optimiste (`weight_version`) sur `model_weights_config`.
-- 2. Journal `global_learning_draw_log` avec unicité `(draw_result_id, model_version)`
--    garantissant au maximum 1 mise à jour globale des poids par tirage réel.
-- 3. Contrôle de cohérence SQL `prediction_snapshots` <-> `draw_results` (nom, date, temporalité).
-- 4. Ciblage strict de `public.predictions.feedback` borné à la date du tirage (`timestamp <= draw_date + 1 day`).

-- 1. Extensions de colonnes sur model_weights_config & post_mortem_reviews
ALTER TABLE IF EXISTS public.model_weights_config
  ADD COLUMN IF NOT EXISTS weight_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_learned_draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.post_mortem_reviews
  ADD COLUMN IF NOT EXISTS is_global_learning_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gene_scores_source TEXT NOT NULL DEFAULT 'server_reconstructed',
  ADD COLUMN IF NOT EXISTS telemetry_gaps JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Normalisation ISO non destructive pour forensic_reports.draw_date si la table existe déjà
ALTER TABLE IF EXISTS public.forensic_reports
  ADD COLUMN IF NOT EXISTS draw_date_iso DATE;

UPDATE public.forensic_reports
   SET draw_date_iso = draw_date::DATE
 WHERE draw_date_iso IS NULL
   AND draw_date ~ '^\d{4}-\d{2}-\d{2}$';

-- 2. Journal d'apprentissage global par tirage (anti-pseudo-réplication)
CREATE TABLE IF NOT EXISTS public.global_learning_draw_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_result_id UUID NOT NULL REFERENCES public.draw_results(id) ON DELETE CASCADE,
  draw_name TEXT NOT NULL,
  draw_date DATE NOT NULL,
  model_version TEXT NOT NULL,
  snapshot_id UUID REFERENCES public.prediction_snapshots(id) ON DELETE SET NULL,
  applied_weight_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_global_learning_per_draw_version UNIQUE (draw_result_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_global_learning_draw_name_date
  ON public.global_learning_draw_log (draw_name, draw_date DESC);

ALTER TABLE public.global_learning_draw_log ENABLE ROW LEVEL SECURITY;

-- 3. Remplacement sécurisé de la RPC atomique avec signature étendue
DROP FUNCTION IF EXISTS public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[]
);

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
  p_predicted_numbers INTEGER[],
  p_apply_global_learning BOOLEAN DEFAULT FALSE,
  p_expected_weight_version BIGINT DEFAULT NULL,
  p_gene_scores_source TEXT DEFAULT 'server_reconstructed',
  p_telemetry_gaps JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_report JSONB;
  v_snap_draw_name TEXT;
  v_snap_target_date DATE;
  v_snap_created_at TIMESTAMPTZ;
  v_result_draw_name TEXT;
  v_result_date DATE;
  v_autopsy_key TEXT;
  v_current_weight_version BIGINT;
  v_new_weight_version BIGINT;
  v_global_learning_executed BOOLEAN := FALSE;
BEGIN
  v_autopsy_key := p_snapshot_id::TEXT || ':' || p_draw_result_id::TEXT || ':' || p_model_version;

  -- A.6 : Verrou pessimiste sur le snapshot
  SELECT autopsy_report, draw_name, target_date, created_at
    INTO v_existing_report, v_snap_draw_name, v_snap_target_date, v_snap_created_at
    FROM public.prediction_snapshots
   WHERE id = p_snapshot_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot % introuvable', p_snapshot_id;
  END IF;

  -- A.1 : Vérification stricte côté SQL entre snapshot et tirage réel
  SELECT draw_name, date
    INTO v_result_draw_name, v_result_date
    FROM public.draw_results
   WHERE id = p_draw_result_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draw result % introuvable', p_draw_result_id;
  END IF;

  IF LOWER(TRIM(COALESCE(v_snap_draw_name, ''))) <> LOWER(TRIM(COALESCE(v_result_draw_name, ''))) THEN
    RAISE EXCEPTION 'Incohérence nom de tirage : snapshot(%) <> draw_result(%)', v_snap_draw_name, v_result_draw_name;
  END IF;

  IF v_snap_target_date IS NOT NULL AND v_snap_target_date <> v_result_date THEN
    RAISE EXCEPTION 'Incohérence date cible : snapshot(%) <> draw_result(%)', v_snap_target_date, v_result_date;
  END IF;

  IF v_snap_created_at IS NOT NULL AND v_snap_created_at > (v_result_date::TIMESTAMPTZ + INTERVAL '1 day') THEN
    RAISE EXCEPTION 'Violation causale : snapshot créé après le tirage (% > %)', v_snap_created_at, v_result_date;
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
      'global_learning_applied', FALSE,
      'autopsy_key', v_autopsy_key,
      'report', COALESCE(v_existing_report, p_final_report)
    );
  END IF;

  -- A.2 & A.6 : Apprentissage global strictement verrouillé, versionné et unique par (draw_result_id, model_version)
  IF p_apply_global_learning IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.global_learning_draw_log
       WHERE draw_result_id = p_draw_result_id
         AND model_version = p_model_version
    ) THEN
      SELECT weight_version
        INTO v_current_weight_version
        FROM public.model_weights_config
       WHERE draw_name = p_draw_name
         FOR UPDATE;

      IF FOUND THEN
        IF p_expected_weight_version IS NOT NULL AND v_current_weight_version <> p_expected_weight_version THEN
          RAISE EXCEPTION 'Conflit optimiste weight_version sur % : attendu %, trouvé %',
            p_draw_name, p_expected_weight_version, v_current_weight_version;
        END IF;

        v_new_weight_version := v_current_weight_version + 1;

        UPDATE public.model_weights_config
           SET weights = p_updated_weights,
               sigmoid_slope = p_sigmoid_slope,
               sigmoid_intercept = p_sigmoid_intercept,
               boosting_multiplier = p_boosting_multiplier,
               prudence_mode_active = p_prudence_mode,
               model_version = p_model_version,
               last_autopsy_key = v_autopsy_key,
               last_learned_draw_result_id = p_draw_result_id,
               sample_size = p_sample_size,
               last_audit = p_learning_audit,
               weight_version = v_new_weight_version,
               updated_at = NOW()
         WHERE draw_name = p_draw_name;
      ELSE
        v_new_weight_version := 1;

        INSERT INTO public.model_weights_config (
          draw_name,
          weights,
          sigmoid_slope,
          sigmoid_intercept,
          boosting_multiplier,
          prudence_mode_active,
          model_version,
          last_autopsy_key,
          last_learned_draw_result_id,
          sample_size,
          last_audit,
          weight_version,
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
          p_draw_result_id,
          p_sample_size,
          p_learning_audit,
          v_new_weight_version,
          NOW()
        );
      END IF;

      INSERT INTO public.global_learning_draw_log (
        draw_result_id,
        draw_name,
        draw_date,
        model_version,
        snapshot_id,
        applied_weight_version
      ) VALUES (
        p_draw_result_id,
        p_draw_name,
        p_draw_date,
        p_model_version,
        p_snapshot_id,
        v_new_weight_version
      );

      v_global_learning_executed := TRUE;
    END IF;
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
    ai_forensic_critique,
    is_global_learning_applied,
    gene_scores_source,
    telemetry_gaps
  ) VALUES (
    p_snapshot_id,
    p_draw_result_id,
    p_model_version,
    p_draw_name,
    p_draw_date,
    LEAST(5, GREATEST(0, p_exact_hits)),
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
    p_ai_forensic_critique,
    v_global_learning_executed,
    COALESCE(p_gene_scores_source, 'server_reconstructed'),
    COALESCE(p_telemetry_gaps, '[]'::jsonb)
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
    LEAST(5, GREATEST(0, p_exact_hits)),
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
    draw_date_iso,
    draw_result_id,
    model_version,
    report_data,
    ai_model_used
  ) VALUES (
    p_user_id,
    p_snapshot_id,
    p_draw_name,
    p_draw_date::TEXT,
    p_draw_date,
    p_draw_result_id,
    p_model_version,
    p_final_report,
    p_ai_model_used
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.prediction_snapshots
     SET status = 'COMPLETED',
         actual_numbers = p_actual_numbers,
         near_misses = p_near_misses_details,
         autopsy_report = p_final_report,
         updated_at = NOW()
   WHERE id = p_snapshot_id;

  -- A.13 : Cibler uniquement les prédictions non encore scellées (ou déjà liées à ce tirage)
  -- créées AVANT la clôture du tirage cible
  IF p_user_id IS NOT NULL THEN
    UPDATE public.predictions
       SET draw_result_id = p_draw_result_id,
           feedback = jsonb_build_object(
             'matches', LEAST(5, GREATEST(0, p_exact_hits)),
             'nearMisses', p_near_miss_count,
             'autopsyId', p_snapshot_id,
             'drawDate', p_draw_date::TEXT,
             'modelVersion', p_model_version
           )
     WHERE id IN (
       SELECT id
         FROM public.predictions
        WHERE user_id = p_user_id
          AND draw_name = p_draw_name
          AND (draw_result_id IS NULL OR draw_result_id = p_draw_result_id)
          AND timestamp <= (p_draw_date::TIMESTAMPTZ + INTERVAL '1 day')
          AND (prediction->'suggestedNumbers') = to_jsonb(p_predicted_numbers)
        ORDER BY timestamp DESC
        LIMIT 1
     );
  END IF;

  RETURN jsonb_build_object(
    'applied', TRUE,
    'idempotent_hit', FALSE,
    'global_learning_applied', v_global_learning_executed,
    'weight_version', v_new_weight_version,
    'autopsy_key', v_autopsy_key,
    'report', p_final_report
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[],
  BOOLEAN, BIGINT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[],
  BOOLEAN, BIGINT, TEXT, JSONB
) TO service_role;
