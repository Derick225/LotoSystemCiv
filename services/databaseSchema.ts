
export const NEXUS_DATABASE_SCHEMA = `-- SCHEMA SQL NEXUS PLATINUM v11.0 (RECOVERY MODE)
-- Copiez ce bloc ENTIER dans l'éditeur SQL de votre nouveau projet Supabase et cliquez sur "Run".

-- ==============================================================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime"; -- Nécessaire pour l'auto-update des dates

-- ==============================================================================
-- 2. TABLES PRINCIPALES
-- ==============================================================================

-- A. RÉSULTATS DES TIRAGES (Données Publiques)
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  gagnants INTEGER[] NOT NULL CHECK (array_length(gagnants, 1) = 5),
  machine INTEGER[] CHECK (array_length(machine, 1) = 5),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_draw_date UNIQUE (draw_name, date)
);

-- B. ANALYTIQUES HPC (Données Calculées)
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

-- C. POIDS ALGORITHMIQUES (Configuration IA)
CREATE TABLE IF NOT EXISTS public.algo_weights (
  draw_name TEXT PRIMARY KEY,
  weights JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. PRÉFÉRENCES UTILISATEURS (Données Privées)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist INTEGER[],
  saved_tickets JSONB,
  settings JSONB,
  subscription JSONB DEFAULT '{"status": "trial", "plan": "premium"}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- E. FEEDBACK (Données Collaboratives)
CREATE TABLE IF NOT EXISTS public.prediction_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  rating TEXT NOT NULL,
  actual_hits INTEGER,
  user_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- F. TRANSACTIONS (Paiements)
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
-- 3. TRIGGERS (Mise à jour automatique des dates)
-- ==============================================================================

CREATE TRIGGER handle_updated_at_draw_results
BEFORE UPDATE ON public.draw_results
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_user_prefs
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

-- ==============================================================================
-- 4. SÉCURITÉ (RLS - Row Level Security)
-- ==============================================================================

-- Activation de la sécurité sur toutes les tables
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 1. draw_results : Lecture pour tous, Écriture pour les connectés (Admin simplifié)
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Auth Write Results" ON public.draw_results FOR ALL USING (auth.role() = 'authenticated');

-- 2. draw_analytics : Lecture pour tous, Écriture pour les connectés
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Auth Write Analytics" ON public.draw_analytics FOR ALL USING (auth.role() = 'authenticated');

-- 3. algo_weights : Lecture pour tous, Écriture pour les connectés
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Auth Write Weights" ON public.algo_weights FOR ALL USING (auth.role() = 'authenticated');

-- 4. user_preferences : Accès strictement personnel
CREATE POLICY "User Own Data" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- 5. prediction_feedback : Insertion publique (pour les stats), lecture personnelle ou admin
CREATE POLICY "Public Insert Feedback" ON public.prediction_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Read Feedback" ON public.prediction_feedback FOR SELECT USING (true);

-- 6. transactions : Accès personnel
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- ==============================================================================
-- 5. INDEXES (Optimisation Performances)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_results_draw_date ON public.draw_results(draw_name, date);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date);

-- FIN DU SCRIPT
`;