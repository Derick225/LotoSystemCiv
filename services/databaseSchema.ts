
export const NEXUS_DATABASE_SCHEMA = `-- SCHEMA SQL NEXUS PLATINUM v11.0 (PRODUCTION READY)
-- Copiez ce bloc entier dans l'éditeur SQL de votre Dashboard Supabase pour initialiser l'infrastructure.

-- ==============================================================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ==============================================================================
-- 2. TABLES PRINCIPALES
-- ==============================================================================

-- A. RÉSULTATS DES TIRAGES (Flux Principal)
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  gagnants INTEGER[] NOT NULL CHECK (array_length(gagnants, 1) = 5),
  machine INTEGER[] CHECK (array_length(machine, 1) = 5),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_draw_date UNIQUE (draw_name, date)
);

-- B. ANALYTIQUES HPC (Cache serveur des calculs lourds)
CREATE TABLE IF NOT EXISTS public.draw_analytics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  spectral JSONB, -- Données FFT
  fractal JSONB,  -- Données Hurst
  volatility JSONB,
  audit JSONB,
  correlations JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_analytics_draw_date UNIQUE (draw_name, date)
);

-- C. POIDS ALGORITHMIQUES (Mémoire Génétique IA)
CREATE TABLE IF NOT EXISTS public.algo_weights (
  draw_name TEXT PRIMARY KEY,
  weights JSONB NOT NULL, -- Poids des neurones (frequency, gap, spectral, etc.)
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. PRÉFÉRENCES UTILISATEURS (Sync Wallet & Watchlist)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist INTEGER[],
  saved_tickets JSONB,
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- E. FEEDBACK RLHF (Apprentissage par Renforcement Humain)
CREATE TABLE IF NOT EXISTS public.prediction_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  rating TEXT NOT NULL, -- 'Visionnaire', 'Standard', 'Incohérente'
  actual_hits INTEGER,
  user_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 3. SÉCURITÉ (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- Activation RLS
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;

-- Politiques DRAW_RESULTS
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Service Write Results" ON public.draw_results FOR ALL USING (
  auth.role() = 'service_role' OR auth.role() = 'authenticated'
);

-- Politiques DRAW_ANALYTICS
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Service Write Analytics" ON public.draw_analytics FOR ALL USING (
  auth.role() = 'service_role' OR auth.role() = 'authenticated'
);

-- Politiques ALGO_WEIGHTS
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Admin Write Weights" ON public.algo_weights FOR ALL USING (
  auth.role() = 'service_role' OR auth.role() = 'authenticated'
);

-- Politiques USER_PREFERENCES (Données privées)
CREATE POLICY "User Own Data" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- Politiques FEEDBACK
CREATE POLICY "Public Feedback Insert" ON public.prediction_feedback FOR INSERT WITH CHECK (true);

-- ==============================================================================
-- 4. INDEXES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_results_draw_date ON public.draw_results(draw_name, date);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date);
`;
