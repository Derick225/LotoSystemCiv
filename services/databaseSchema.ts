
export const NEXUS_DATABASE_SCHEMA = `-- ==============================================================================
-- SCHEMA NEXUS PLATINUM v11.1 (SECURE & PRODUCTION READY)
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- ==============================================================================
-- 2. TABLES
-- ==============================================================================

-- Fonction utilitaire : vérifie si un tableau d'entiers est valide pour le loto
CREATE OR REPLACE FUNCTION is_valid_loto_numbers(nums INTEGER[])
RETURNS BOOLEAN AS $$
BEGIN
  -- Vérifie la longueur, les doublons, et la plage [1, 90]
  RETURN (
    array_length(nums, 1) = 5
    AND array_length(nums, 1) = array_length(ARRAY(SELECT DISTINCT UNNEST(nums)), 1)
    AND nums <@ ARRAY(
      SELECT generate_series(1, 90)::INTEGER
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- A. RÉSULTATS DES TIRAGES
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  gagnants INTEGER[] NOT NULL,
  machine INTEGER[],
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_draw_date UNIQUE (draw_name, date),
  CONSTRAINT valid_gagnants CHECK (is_valid_loto_numbers(gagnants)),
  CONSTRAINT valid_machine CHECK (machine IS NULL OR is_valid_loto_numbers(machine))
);

-- B. ANALYTIQUES HPC
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

-- C. POIDS ALGORITHMIQUES
CREATE TABLE IF NOT EXISTS public.algo_weights (
  draw_name TEXT PRIMARY KEY,
  weights JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. PRÉFÉRENCES UTILISATEURS
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist INTEGER[],
  saved_tickets JSONB,
  settings JSONB,
  subscription JSONB DEFAULT '{"status": "trial", "plan": "premium"}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- E. FEEDBACK
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

-- ==============================================================================
-- 3. TRIGGERS
-- ==============================================================================
DROP TRIGGER IF EXISTS handle_updated_at_draw_results ON public.draw_results;
CREATE TRIGGER handle_updated_at_draw_results
BEFORE UPDATE ON public.draw_results
FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

DROP TRIGGER IF EXISTS handle_updated_at_user_prefs ON public.user_preferences;
CREATE TRIGGER handle_updated_at_user_prefs
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

DROP TRIGGER IF EXISTS handle_updated_at_transactions ON public.transactions;
CREATE TRIGGER handle_updated_at_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- ==============================================================================
-- 4. SÉCURITÉ (RLS) — CORRIGÉ
-- ==============================================================================

-- Activer RLS partout
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 🔒 draw_results : Lecture publique, ÉCRITURE SEULEMENT PAR SERVICE_ROLE
DROP POLICY IF EXISTS "Public Read Results" ON public.draw_results;
DROP POLICY IF EXISTS "Service Write Results" ON public.draw_results;
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Service Write Results" ON public.draw_results FOR ALL USING (auth.role() = 'service_role');

-- 🔒 draw_analytics : Même règle
DROP POLICY IF EXISTS "Public Read Analytics" ON public.draw_analytics;
DROP POLICY IF EXISTS "Service Write Analytics" ON public.draw_analytics;
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Service Write Analytics" ON public.draw_analytics FOR ALL USING (auth.role() = 'service_role');

-- 🔒 algo_weights : Même règle
DROP POLICY IF EXISTS "Public Read Weights" ON public.algo_weights;
DROP POLICY IF EXISTS "Service Write Weights" ON public.algo_weights;
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Service Write Weights" ON public.algo_weights FOR ALL USING (auth.role() = 'service_role');

-- 👤 user_preferences : personnel
DROP POLICY IF EXISTS "User Own Data" ON public.user_preferences;
CREATE POLICY "User Own Data" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- 📝 prediction_feedback : insertion publique, lecture publique
DROP POLICY IF EXISTS "Public Insert Feedback" ON public.prediction_feedback;
CREATE POLICY "Public Insert Feedback" ON public.prediction_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Read Feedback" ON public.prediction_feedback FOR SELECT USING (true);

-- 💳 transactions : personnel
DROP POLICY IF EXISTS "User View Own Tx" ON public.transactions;
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- ==============================================================================
-- 5. INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_results_draw_date ON public.draw_results(draw_name, date);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date);

-- ==============================================================================
-- FIN DU SCRIPT
-- ==============================================================================
`;