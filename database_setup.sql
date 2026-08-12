
-- ==============================================================================
-- SCHEMA NEXUS PLATINUM v12.0 (OPTIMIZED & SECURE)
-- Unified Schema
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- 2. FONCTIONS UTILITAIRES
CREATE OR REPLACE FUNCTION is_valid_loto_numbers(nums INTEGER[])
RETURNS BOOLEAN AS $$
BEGIN
  IF nums IS NULL OR array_length(nums, 1) IS NULL THEN RETURN FALSE; END IF;
  RETURN (
    array_length(nums, 1) = 5
    AND array_length(nums, 1) = array_length(ARRAY(SELECT DISTINCT UNNEST(nums)), 1)
    AND nums <@ ARRAY(SELECT generate_series(1, 90)::INTEGER)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. TABLES

-- A. RÉSULTATS
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  gagnants INTEGER[] NOT NULL CHECK (is_valid_loto_numbers(gagnants)),
  machine INTEGER[] CHECK (machine IS NULL OR is_valid_loto_numbers(machine)),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_draw_date UNIQUE (draw_name, date)
);

-- B. ANALYTIQUES
CREATE TABLE IF NOT EXISTS public.draw_analytics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  spectral JSONB,
  fractal JSONB,
  volatility JSONB,
  audit JSONB,
  correlations JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_analytics_draw_date UNIQUE (draw_name, date)
);

-- C. POIDS IA
CREATE TABLE IF NOT EXISTS public.algo_weights (
  draw_name TEXT PRIMARY KEY,
  weights JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. UTILISATEURS
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist INTEGER[],
  saved_tickets JSONB,
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D2. ABONNEMENTS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'trial',
  plan TEXT DEFAULT 'premium',
  expires_at TIMESTAMPTZ,
  start_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- E. FEEDBACK RLHF
CREATE TABLE IF NOT EXISTS public.prediction_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  rating TEXT NOT NULL,
  actual_hits INTEGER,
  user_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- F. TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  payment_token TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- G. LOGS APPRENTISSAGE
CREATE TABLE IF NOT EXISTS public.learning_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  previous_fitness NUMERIC,
  new_fitness NUMERIC,
  improvement_delta TEXT,
  applied_weights JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- H. PREDICTIONS (Sync History)
CREATE TABLE IF NOT EXISTS public.predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    draw_name TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    prediction JSONB NOT NULL,
    draw_result_id UUID REFERENCES public.draw_results(id) ON DELETE SET NULL,
    feedback JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- I. PREDICTION SNAPSHOTS (Forensic)
CREATE TABLE IF NOT EXISTS public.prediction_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    draw_name TEXT NOT NULL,
    target_date DATE,
    predicted_numbers INTEGER[] NOT NULL,
    decision_dna JSONB,
    shannon_entropy NUMERIC,
    hurst_exponent NUMERIC,
    fft_spectral_metrics JSONB,
    engine_hyperparameters JSONB,
    app_version TEXT DEFAULT 'v12.0',
    metrics_snapshot JSONB,
    status TEXT DEFAULT 'PENDING',
    actual_numbers INTEGER[],
    near_misses JSONB,
    autopsy_report JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- I2. POST MORTEM REVIEWS
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
    entropy_dampener_value NUMERIC NOT NULL,
    weight_deltas JSONB NOT NULL,
    counterfactual_analysis JSONB,
    ai_forensic_critique TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_snapshot_review UNIQUE (snapshot_id)
);

-- J. FORENSIC REPORTS
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

-- K. LEARNING SESSIONS
CREATE TABLE IF NOT EXISTS public.learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    draw_name TEXT NOT NULL,
    session_data JSONB NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- L. DRAW REGIMES
CREATE TABLE IF NOT EXISTS public.draw_regimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_name TEXT NOT NULL,
    regime_type TEXT NOT NULL,
    confidence NUMERIC,
    metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_draw_regime UNIQUE (draw_name)
);

-- M. MODEL PERFORMANCE METRICS (Forensic Continuous Learning)
CREATE TABLE IF NOT EXISTS public.model_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_name TEXT NOT NULL,
    date DATE,
    exact_matches INTEGER NOT NULL,
    partial_matches_2_5 BOOLEAN,
    partial_matches_3_5 BOOLEAN,
    partial_matches_4_5 BOOLEAN,
    brier_score NUMERIC,
    near_miss_count INTEGER,
    sliding_window_yield NUMERIC,
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- N. MODEL WEIGHTS CONFIG (Adaptive Dynamic Learning and Platt Calibration Sigmoids)
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

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_results_lookup ON public.draw_results(draw_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_draw ON public.predictions(user_id, draw_name);
CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON public.predictions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_forensic_user_draw ON public.forensic_reports(user_id, draw_name);
CREATE INDEX IF NOT EXISTS idx_learning_user_draw ON public.learning_sessions(user_id, draw_name);
CREATE INDEX IF NOT EXISTS idx_feedback_draw ON public.prediction_feedback(draw_name);
CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_target_date ON public.prediction_snapshots(target_date);
CREATE INDEX IF NOT EXISTS idx_draw_regimes_lookup ON public.draw_regimes(draw_name);

-- 5. SECURITÉ (RLS)
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forensic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_weights_config ENABLE ROW LEVEL SECURITY;

-- Policies Publiques
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Public Read Logs" ON public.learning_logs FOR SELECT USING (true);
CREATE POLICY "Public Read Regimes" ON public.draw_regimes FOR SELECT USING (true);
CREATE POLICY "Public Read Performance Metrics" ON public.model_performance_metrics FOR SELECT USING (true);
CREATE POLICY "Public Read Weights Config" ON public.model_weights_config FOR SELECT USING (true);

-- Policies User
CREATE POLICY "User Manage Own Prefs" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User Insert Feedback" ON public.prediction_feedback FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User View Own Subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own predictions" ON public.predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own predictions" ON public.predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own predictions" ON public.predictions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own predictions" ON public.predictions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own snapshots" ON public.prediction_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own snapshots" ON public.prediction_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own snapshots" ON public.prediction_snapshots FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own forensic reports" ON public.forensic_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own forensic reports" ON public.forensic_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own forensic reports" ON public.forensic_reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own forensic reports" ON public.forensic_reports FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own learning sessions" ON public.learning_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own learning sessions" ON public.learning_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own learning sessions" ON public.learning_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Policies Service Role
CREATE POLICY "Service Full Access Results" ON public.draw_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Analytics" ON public.draw_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Weights" ON public.algo_weights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Logs" ON public.learning_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Tx" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Subscriptions" ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can update snapshots" ON public.prediction_snapshots FOR UPDATE USING (true);
CREATE POLICY "Service Full Access Performance Metrics" ON public.model_performance_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Weights Config" ON public.model_weights_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. REALTIME
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_snapshots;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.draw_results;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ==========================================
-- 7. TRIGGERS & FUNCTIONS
-- ==========================================
CREATE OR REPLACE TRIGGER handle_updated_at_draw_results BEFORE UPDATE ON public.draw_results FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_user_prefs BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_algo_weights BEFORE UPDATE ON public.algo_weights FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_transactions BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_subscriptions BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_prediction_snapshots BEFORE UPDATE ON public.prediction_snapshots FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_model_weights_config BEFORE UPDATE ON public.model_weights_config FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- Fonction pour assigner automatiquement le rôle admin au premier utilisateur ou à un email spécifique
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, settings)
  VALUES (NEW.id, '{"theme": "dark", "sound": true}'::jsonb);
  
  INSERT INTO public.subscriptions (user_id, status, plan, start_date, expires_at)
  VALUES (NEW.id, 'trial', 'premium', now(), now() + interval '30 days');
  
  -- Remplacer par votre email pour vous donner les droits admin automatiquement à l'inscription
  IF NEW.email = 'dieudonnekeric@gmail.com' THEN
    UPDATE auth.users SET app_metadata = jsonb_set(app_metadata, '{role}', '"admin"') WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour exécuter la fonction à chaque nouvel utilisateur
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. CRON JOBS (Automatisation des données historiques)
-- On supprime l'ancien job s'il existe
SELECT cron.unschedule('sync-draw-results-hourly');

-- On recrée le job avec l'en-tête d'autorisation (Sécurité)
-- Le Cron appelle désormais la Supabase Edge Function 'cron-sync'
-- REMPLACEZ 'VOTRE_PROJECT_REF' par la référence de votre projet Supabase (ex: iexwhv27jnwut37iq2ksdr)
-- REMPLACEZ 'VOTRE_ANON_KEY' par votre clé publique (anon key)
SELECT cron.schedule(
  'sync-draw-results-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
      url:='https://VOTRE_PROJECT_REF.supabase.co/functions/v1/cron-sync',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_ANON_KEY"}'::jsonb,
      body:='{"manualTrigger": false}'::jsonb
  );
  $$
);
