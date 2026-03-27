
-- ==============================================================================
-- SCHEMA NEXUS PLATINUM v12.0 (OPTIMIZED & SECURE)
-- Optimisé pour PostgreSQL 15+ sur Supabase
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
  subscription JSONB DEFAULT '{"status": "trial", "plan": "premium", "daysLeft": 30}'::JSONB,
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

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_results_lookup ON public.draw_results(draw_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);

-- 5. SECURITÉ (RLS)
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;

-- Policies Publiques
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Public Read Logs" ON public.learning_logs FOR SELECT USING (true);

-- Policies User
CREATE POLICY "User Manage Own Prefs" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User Insert Feedback" ON public.prediction_feedback FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- Policies Service Role
CREATE POLICY "Service Full Access Results" ON public.draw_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Analytics" ON public.draw_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Weights" ON public.algo_weights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Logs" ON public.learning_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Tx" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. TRIGGERS
CREATE OR REPLACE TRIGGER handle_updated_at_draw_results BEFORE UPDATE ON public.draw_results FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_user_prefs BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_algo_weights BEFORE UPDATE ON public.algo_weights FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_transactions BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- 7. CRON JOBS (Automatisation des données historiques)
-- Exécute la fonction cron-sync toutes les heures pour récupérer les nouveaux résultats
-- Note: Pour que cela fonctionne sur Supabase, il faut configurer l'URL du projet.
-- Remplacer PROJECT_REF par l'ID de votre projet Supabase.
SELECT cron.schedule(
  'sync-draw-results-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
      url:='https://ais-pre-iexwhv27jnwut37iq2ksdr-108345727073.europe-west2.run.app/api/cron-sync',
      headers:='{"Content-Type": "application/json"}'::jsonb,
      body:='{"manualTrigger": false}'::jsonb
  );
  $$
);
