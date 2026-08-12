-- ==============================================================================
-- SUPABASE MIGRATION: FORENSIC POST-MORTEM & ENHANCED PREDICTION SNAPSHOTS
-- Version: v12.0 - LotoPro Platinum Elite
-- Date: 2026-07-18
-- ==============================================================================

-- 1. UPGRADE EXISTING public.prediction_snapshots TABLE (NON-DESTRUCTIVE)
-- We add explicit typed mathematical columns to extract features from metrics_snapshot JSONB
-- to enable rapid SQL querying, reporting, and indexation of structural engine state.

ALTER TABLE public.prediction_snapshots 
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS shannon_entropy NUMERIC,
  ADD COLUMN IF NOT EXISTS hurst_exponent NUMERIC,
  ADD COLUMN IF NOT EXISTS fft_spectral_metrics JSONB,
  ADD COLUMN IF NOT EXISTS engine_hyperparameters JSONB,
  ADD COLUMN IF NOT EXISTS app_version TEXT DEFAULT 'v12.0';

-- Add comments for documentation and database auditing
COMMENT ON COLUMN public.prediction_snapshots.shannon_entropy IS 'Shannon Entropy of the historical draw sequence at time T. Measures the state of disorder / predictability (0 = highly ordered, 1 = maximum entropy).';
COMMENT ON COLUMN public.prediction_snapshots.hurst_exponent IS 'Hurst Exponent calculated at time T. Measures long-term memory of the time series (H > 0.5: persistent, H < 0.5: anti-persistent, H = 0.5: random walk).';
COMMENT ON COLUMN public.prediction_snapshots.fft_spectral_metrics IS 'JSON snapshot of Fast Fourier Transform (FFT) analysis at time T, including major frequency spikes, phase angles, and energy spectral densities.';
COMMENT ON COLUMN public.prediction_snapshots.engine_hyperparameters IS 'JSON snapshot of active engine parameters at time T (e.g., Platt calibration sigmoid_slope, sigmoid_intercept, boosting_multiplier, and prudence_mode_active).';
COMMENT ON COLUMN public.prediction_snapshots.decision_dna IS 'Active normalized algorithmic weights (DNA) used to compute final combined scores at time T.';


-- 2. CREATE public.post_mortem_reviews TABLE
-- This table stores a deep retrospective audit of a prediction after a real draw occurs.
-- It acts as the primary data warehouse for the Edge Functions continuous-learning and reinforcement engine.

CREATE TABLE IF NOT EXISTS public.post_mortem_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.prediction_snapshots(id) ON DELETE CASCADE,
  draw_name TEXT NOT NULL,
  draw_date DATE NOT NULL,
  
  -- Performance Metrics
  exact_hits INTEGER NOT NULL CHECK (exact_hits BETWEEN 0 AND 5),
  near_miss_count INTEGER NOT NULL DEFAULT 0,
  brier_score NUMERIC NOT NULL,
  sliding_window_yield NUMERIC,
  
  -- Model Drift & State Changes
  prudence_mode_triggered BOOLEAN DEFAULT FALSE,
  calibration_delta_slope NUMERIC NOT NULL DEFAULT 0.0,
  calibration_delta_intercept NUMERIC NOT NULL DEFAULT 0.0,
  entropy_dampener_value NUMERIC NOT NULL,
  
  -- Advanced Learning Snapshots (DNA & Counterfactuals)
  weight_deltas JSONB NOT NULL,
  counterfactual_analysis JSONB,
  ai_forensic_critique TEXT,
  
  -- Audit Columns
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate reviews for the same prediction snapshot
  CONSTRAINT unique_snapshot_review UNIQUE (snapshot_id)
);

-- Add comprehensive database comments on post_mortem_reviews
COMMENT ON TABLE public.post_mortem_reviews IS 'Forensic post-mortem evaluation reports containing retrospective analysis, Brier score calibration, weight delta corrections, and LLM critical insights.';
COMMENT ON COLUMN public.post_mortem_reviews.snapshot_id IS 'Reference to the original prediction snapshot recorded prior to the draw.';
COMMENT ON COLUMN public.post_mortem_reviews.exact_hits IS 'Number of exact matches (0 to 5) obtained in the predicted ticket vs actual draw.';
COMMENT ON COLUMN public.post_mortem_reviews.near_miss_count IS 'Number of predicted digits that missed actual winning numbers by a distance of +/- 1 or +/- 2.';
COMMENT ON COLUMN public.post_mortem_reviews.brier_score IS 'Brier score (mean squared error of predicted probabilities vs binary draw outcomes) measuring model calibration.';
COMMENT ON COLUMN public.post_mortem_reviews.sliding_window_yield IS 'Moving performance yield over a sliding window (e.g. 10 or 30 draws) used to monitor model drift.';
COMMENT ON COLUMN public.post_mortem_reviews.prudence_mode_triggered IS 'True if sliding window yield fell below threshold or a standard deviation anomaly triggered defensive prudence mode.';
COMMENT ON COLUMN public.post_mortem_reviews.calibration_delta_slope IS 'Platt scaling sigmoid slope delta computed by post-mortem learning (adapted via Platt calibration scaling).';
COMMENT ON COLUMN public.post_mortem_reviews.calibration_delta_intercept IS 'Platt scaling sigmoid intercept delta computed by post-mortem learning.';
COMMENT ON COLUMN public.post_mortem_reviews.entropy_dampener_value IS 'Continuous exponential multiplier (e^-entropy) used to dämpfe the weight delta adjustments based on signal noise.';
COMMENT ON COLUMN public.post_mortem_reviews.weight_deltas IS 'JSON map showing the exact delta added/subtracted from each algorithm weight based on performance feedback (e.g., {"gapCadence": 0.05, "spectral": -0.02}).';
COMMENT ON COLUMN public.post_mortem_reviews.counterfactual_analysis IS 'JSON object simulating hypothetical yields under alternative weight/hyperparameter configurations.';
COMMENT ON COLUMN public.post_mortem_reviews.ai_forensic_critique IS 'Gemini-generated text review detailing why the model succeeded or failed, pointing to chaotic noise, resonance drift, or symbiotic gaps.';


-- 3. INDEXING FOR HIGH-PERFORMANCE ANALYTICS
-- Speed up queries for drift analysis, performance charts, and self-learning loops.

CREATE INDEX IF NOT EXISTS idx_post_mortem_reviews_snapshot ON public.post_mortem_reviews(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_post_mortem_reviews_draw_date ON public.post_mortem_reviews(draw_name, draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_post_mortem_reviews_hits ON public.post_mortem_reviews(exact_hits);
CREATE INDEX IF NOT EXISTS idx_post_mortem_reviews_brier ON public.post_mortem_reviews(brier_score);
CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_entropy_hurst ON public.prediction_snapshots(draw_name, shannon_entropy, hurst_exponent);


-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- Secure user data from cross-tenant snooping while granting server/service role full access.

ALTER TABLE public.post_mortem_reviews ENABLE ROW LEVEL SECURITY;

-- Select/Read Policies
CREATE POLICY "Users can view reviews of their own snapshots" 
  ON public.post_mortem_reviews 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.prediction_snapshots s 
      WHERE s.id = public.post_mortem_reviews.snapshot_id 
      AND s.user_id = auth.uid()
    )
  );

-- Write/Modify Policies (Only through service role or user creator validation)
CREATE POLICY "Users can insert reviews for their own snapshots" 
  ON public.post_mortem_reviews 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prediction_snapshots s 
      WHERE s.id = public.post_mortem_reviews.snapshot_id 
      AND s.user_id = auth.uid()
    )
  );

-- Service Role Bypass Policies (Gives edge functions and automated workers unrestricted access)
CREATE POLICY "Service role full access on post_mortem_reviews" 
  ON public.post_mortem_reviews 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);


-- 5. REALTIME REPLICATION SETUP
-- Ensure new reviews and updated snapshots stream in real-time to active UI clients.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_mortem_reviews;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
