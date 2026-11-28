-- ==============================================================================
-- MIGRATION: HARDENED FORENSIC AUTOPSY, PER-DRAW LOCKED LEARNING & RLS FIXES
-- Date: 2026-11-27
-- Covers audit points: A.1-A.7, A.13, B.6, B.7, C.2
-- ==============================================================================

-- 1. Ledger d'apprentissage global par tirage distinct (1 seule mise à jour par draw_result_id)
CREATE TABLE IF NOT EXISTS public.global_draw_learning_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_name TEXT NOT NULL,
  draw_result_id UUID NOT NULL REFERENCES public.draw_results(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  snapshot_id UUID REFERENCES public.prediction_snapshots(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_global_draw_learning UNIQUE (draw_name, draw_result_id, model_version)
);

ALTER TABLE public.global_draw_learning_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Learning Ledger" ON public.global_draw_learning_ledger;
CREATE POLICY "Public Read Learning Ledger" ON public.global_draw_learning_ledger
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service Full Access Learning Ledger" ON public.global_draw_learning_ledger;
CREATE POLICY "Service Full Access Learning Ledger" ON public.global_draw_learning_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Versioning et traçabilité sur public.model_weights_config
ALTER TABLE public.model_weights_config
  ADD COLUMN IF NOT EXISTS weight_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_draw_date DATE;

-- 3. Correction RLS critique sur public.prediction_snapshots (TO service_role manquant)
--    + garde anti-pré-scellement côté client (C.2)
DROP POLICY IF EXISTS "Service role can update snapshots" ON public.prediction_snapshots;
CREATE POLICY "Service role can update snapshots" ON public.prediction_snapshots
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enforce_snapshot_client_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(NULLIF(current_setting('role', true), ''), auth.role());
  IF v_role = 'service_role' OR current_user = 'postgres' OR current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, 'PENDING') <> 'PENDING'
       OR NEW.actual_numbers IS NOT NULL
       OR NEW.near_misses IS NOT NULL
       OR NEW.autopsy_report IS NOT NULL THEN
      RAISE EXCEPTION 'Les clients ne peuvent pas créer un snapshot pré-scellé (status/autopsy réservés au serveur).';
    END IF;
    NEW.status := 'PENDING';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.actual_numbers IS DISTINCT FROM OLD.actual_numbers
       OR NEW.near_misses IS DISTINCT FROM OLD.near_misses
       OR NEW.autopsy_report IS DISTINCT FROM OLD.autopsy_report THEN
      RAISE EXCEPTION 'Modification client interdite sur status, actual_numbers, near_misses ou autopsy_report.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_snapshot_client_guard ON public.prediction_snapshots;
CREATE TRIGGER trg_enforce_snapshot_client_guard
  BEFORE INSERT OR UPDATE ON public.prediction_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_snapshot_client_guard();

-- 4. Typage DATE sur public.forensic_reports.draw_date (cohérent avec le reste du schéma)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'forensic_reports'
       AND column_name = 'draw_date'
       AND data_type <> 'date'
  ) THEN
    ALTER TABLE public.forensic_reports
      ALTER COLUMN draw_date TYPE DATE
      USING (
        CASE
          WHEN draw_date ~ '^\d{4}-\d{2}-\d{2}$' THEN draw_date::DATE
          WHEN draw_date ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(draw_date, 'DD/MM/YYYY')
          ELSE NULL
        END
      );
  END IF;
END $$;

-- 5. Remplacement atomique de la RPC apply_forensic_autopsy_atomic avec verrouillage poids + ledger + filtre date prédictions
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
  p_expected_weight_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_report JSONB;
  v_autopsy_key TEXT;
  v_current_weight_version INTEGER;
  v_ledger_inserted UUID;
  v_should_mutate_weights BOOLEAN := FALSE;
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
    GREATEST(0, LEAST(5, p_exact_hits)),
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
    GREATEST(0, LEAST(5, p_exact_hits)),
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
    p_draw_date,
    p_draw_result_id,
    p_model_version,
    p_final_report,
    p_ai_model_used
  )
  ON CONFLICT DO NOTHING;

  -- Mise à jour globale des poids UNIQUEMENT par acteur autorisé (système/admin),
  -- verrouillée FOR UPDATE sur model_weights_config, et AU PLUS UNE FOIS par (draw_name, draw_result_id, model_version)
  IF p_apply_global_learning THEN
    SELECT weight_version
      INTO v_current_weight_version
      FROM public.model_weights_config
     WHERE draw_name = p_draw_name
       FOR UPDATE;

    IF FOUND AND p_expected_weight_version IS NOT NULL AND v_current_weight_version <> p_expected_weight_version THEN
      RAISE EXCEPTION 'Conflit de version model_weights_config pour % (attendu %, actuel %)',
        p_draw_name, p_expected_weight_version, v_current_weight_version;
    END IF;

    INSERT INTO public.global_draw_learning_ledger (
      draw_name,
      draw_result_id,
      model_version,
      snapshot_id
    ) VALUES (
      p_draw_name,
      p_draw_result_id,
      p_model_version,
      p_snapshot_id
    )
    ON CONFLICT (draw_name, draw_result_id, model_version) DO NOTHING
    RETURNING id INTO v_ledger_inserted;

    IF v_ledger_inserted IS NOT NULL THEN
      v_should_mutate_weights := TRUE;
    END IF;
  END IF;

  IF v_should_mutate_weights THEN
    INSERT INTO public.model_weights_config (
      draw_name,
      weights,
      sigmoid_slope,
      sigmoid_intercept,
      boosting_multiplier,
      prudence_mode_active,
      model_version,
      last_autopsy_key,
      last_draw_result_id,
      last_draw_date,
      weight_version,
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
      p_draw_result_id,
      p_draw_date,
      1,
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
      last_draw_result_id = EXCLUDED.last_draw_result_id,
      last_draw_date = EXCLUDED.last_draw_date,
      weight_version = COALESCE(public.model_weights_config.weight_version, 1) + 1,
      sample_size = EXCLUDED.sample_size,
      last_audit = EXCLUDED.last_audit,
      updated_at = NOW();
  END IF;

  UPDATE public.prediction_snapshots
     SET status = 'COMPLETED',
         actual_numbers = p_actual_numbers,
         near_misses = p_near_misses_details,
         autopsy_report = p_final_report,
         updated_at = NOW()
   WHERE id = p_snapshot_id;

  -- Appariement précis du feedback sur public.predictions avec contrainte de tirage / date (A.13)
  IF p_user_id IS NOT NULL THEN
    UPDATE public.predictions
       SET draw_result_id = p_draw_result_id,
           feedback = jsonb_build_object(
             'matches', GREATEST(0, LEAST(5, p_exact_hits)),
             'nearMisses', p_near_miss_count,
             'autopsyId', p_snapshot_id,
             'modelVersion', p_model_version,
             'drawDate', p_draw_date
           )
     WHERE id IN (
       SELECT id
         FROM public.predictions
        WHERE user_id = p_user_id
          AND draw_name = p_draw_name
          AND (
            draw_result_id = p_draw_result_id
            OR (
              draw_result_id IS NULL
              AND (prediction->'suggestedNumbers') = to_jsonb(p_predicted_numbers)
              AND (to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC')::DATE <= p_draw_date
              AND (to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC')::DATE >= (p_draw_date - INTERVAL '14 days')::DATE
            )
          )
        ORDER BY timestamp DESC
        LIMIT 1
     );
  END IF;

  RETURN jsonb_build_object(
    'applied', TRUE,
    'idempotent_hit', FALSE,
    'global_weights_mutated', v_should_mutate_weights,
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
  BOOLEAN, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_forensic_autopsy_atomic(
  UUID, UUID, TEXT, UUID, TEXT, DATE, INTEGER, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  BOOLEAN, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB, JSONB, JSONB,
  TEXT, TEXT, JSONB, INTEGER[], JSONB, JSONB, NUMERIC, NUMERIC, NUMERIC, INTEGER[],
  BOOLEAN, INTEGER
) TO service_role;
