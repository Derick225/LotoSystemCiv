
export const NEXUS_DATABASE_SCHEMA = `-- SCHEMA SQL NEXUS PLATINUM v11.0 (FINAL PRODUCTION)
-- Copiez ce bloc entier dans l'éditeur SQL de votre Dashboard Supabase.

-- ==============================================================================
-- 1. EXTENSIONS & CONFIGURATION SYSTÈME
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "moddatetime"; -- Pour la mise à jour auto de updated_at

-- ==============================================================================
-- 2. TABLES PRINCIPALES (INFRASTRUCTURE)
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
  updated_at TIMESTAMPTZ DEFAULT now(), -- Ajouté pour le trigger
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
  weights JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. PRÉFÉRENCES UTILISATEURS (Sync Wallet & Watchlist)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist INTEGER[],
  saved_tickets JSONB,
  settings JSONB,
  subscription JSONB DEFAULT '{"status": "trial", "plan": "free"}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- E. FEEDBACK RLHF (Apprentissage par Renforcement Humain)
CREATE TABLE IF NOT EXISTS public.prediction_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  rating TEXT NOT NULL,
  actual_hits INTEGER,
  user_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- F. TRANSACTIONS FINANCIÈRES (Mobile Money)
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
-- 3. AUTOMATISATION & TRIGGERS (AUTONOMIE)
-- ==============================================================================

-- Trigger pour mettre à jour automatiquement 'updated_at' lors d'une modification
CREATE TRIGGER handle_updated_at_draw_results
BEFORE UPDATE ON public.draw_results
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_user_prefs
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_transactions
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

-- JOB CRON : Synchronisation Automatique (Toutes les 30 minutes)
-- Note: Nécessite l'extension pg_cron active sur le projet Supabase
SELECT cron.schedule(
  'nexus-auto-sync', -- Nom du job
  '*/30 * * * *',    -- Cron expression (toutes les 30 min)
  $$
  SELECT
    net.http_post(
        url:='https://project-ref.supabase.co/functions/v1/cron-sync', -- REMPLACER 'project-ref' par votre ID projet réel
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- ==============================================================================
-- 4. PUBLICATION REALTIME (INTERFACE LIVE)
-- ==============================================================================

-- Active le Realtime pour que le Frontend se mette à jour sans recharger
ALTER PUBLICATION supabase_realtime ADD TABLE public.draw_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.algo_weights;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ==============================================================================
-- 5. SÉCURITÉ (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- Activation RLS
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- NETTOYAGE PRÉVENTIF
DROP POLICY IF EXISTS "Public Read Results" ON public.draw_results;
DROP POLICY IF EXISTS "Service Write Results" ON public.draw_results;
DROP POLICY IF EXISTS "Public Read Analytics" ON public.draw_analytics;
DROP POLICY IF EXISTS "Service Write Analytics" ON public.draw_analytics;
DROP POLICY IF EXISTS "Public Read Weights" ON public.algo_weights;
DROP POLICY IF EXISTS "Admin Write Weights" ON public.algo_weights;
DROP POLICY IF EXISTS "User Own Data" ON public.user_preferences;
DROP POLICY IF EXISTS "Public Feedback Insert" ON public.prediction_feedback;
DROP POLICY IF EXISTS "User View Own Tx" ON public.transactions;

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

-- Politiques TRANSACTIONS
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- ==============================================================================
-- 6. INDEXES DE PERFORMANCE (HPC)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_results_draw_date ON public.draw_results(draw_name, date);
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date);
`;