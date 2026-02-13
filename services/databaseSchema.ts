
export const NEXUS_DATABASE_SCHEMA = `-- ==============================================================================
-- SCHEMA NEXUS PLATINUM v12.0 (OPTIMIZED & SECURE)
-- Optimisé pour PostgreSQL 15+ sur Supabase
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==============================================================================
-- Nécessaire pour la génération d'ID uniques
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Nécessaire pour l'audit automatique des dates de mise à jour
CREATE EXTENSION IF NOT EXISTS "moddatetime";
-- Utile pour les tâches planifiées (ex: sync auto)
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ==============================================================================
-- 2. FONCTIONS DE VALIDATION (PL/pgSQL)
-- ==============================================================================

-- Vérifie l'intégrité structurelle d'un tableau de numéros de loterie (5/90)
-- Utilise des stratégies d'arrêt rapide pour la performance.
CREATE OR REPLACE FUNCTION is_valid_loto_numbers(nums INTEGER[])
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Vérification nullité et taille fixe
  IF nums IS NULL OR array_length(nums, 1) <> 5 THEN 
    RETURN FALSE; 
  END IF;

  -- 2. Vérification de l'unicité (Pas de doublons)
  -- Compare la taille du tableau avec la taille du tableau dédoublonné
  IF array_length(nums, 1) <> (SELECT count(DISTINCT x) FROM unnest(nums) t(x)) THEN
    RETURN FALSE;
  END IF;

  -- 3. Vérification des bornes (1-90)
  -- L'opérateur <@ vérifie si le tableau est contenu dans le générateur de série
  -- Note: Cette méthode est plus performante que d'itérer sur chaque élément
  IF NOT (nums <@ ARRAY(SELECT generate_series(1, 90)::INTEGER)) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

-- ==============================================================================
-- 3. TABLES PRINCIPALES
-- ==============================================================================

-- A. RÉSULTATS DES TIRAGES (Données Froides & Chaudes)
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  gagnants INTEGER[] NOT NULL,
  machine INTEGER[],
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Contrainte d'unicité composite (Empêche les doublons de tirage)
  CONSTRAINT unique_draw_date UNIQUE (draw_name, date),
  
  -- Validation des données via la fonction optimisée
  CONSTRAINT valid_gagnants CHECK (is_valid_loto_numbers(gagnants)),
  CONSTRAINT valid_machine CHECK (machine IS NULL OR is_valid_loto_numbers(machine))
);

-- B. ANALYTIQUES HPC (Données Calculées / Cache)
CREATE TABLE IF NOT EXISTS public.draw_analytics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  spectral JSONB, -- Résultats FFT
  fractal JSONB,  -- Résultats Hurst
  volatility JSONB, -- Scores de risque
  audit JSONB,    -- Logs forensic
  correlations JSONB, -- Matrices
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_analytics_draw_date UNIQUE (draw_name, date)
);

-- C. POIDS ALGORITHMIQUES (ADN du Système)
CREATE TABLE IF NOT EXISTS public.algo_weights (
  draw_name TEXT PRIMARY KEY,
  weights JSONB NOT NULL, -- Poids {frequency: 0.2, gap: 0.1...}
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

-- E. FEEDBACK RLHF (Renforcement)
CREATE TABLE IF NOT EXISTS public.prediction_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  rating TEXT NOT NULL, -- 'Visionnaire', 'Standard', 'Incohérent'
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

-- G. LOGS D'APPRENTISSAGE (Suivi Mutation ADN)
CREATE TABLE IF NOT EXISTS public.learning_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  draw_name TEXT NOT NULL,
  previous_fitness NUMERIC,
  new_fitness NUMERIC,
  improvement_delta TEXT,
  applied_weights JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. INDEXES DE PERFORMANCE
-- ==============================================================================

-- Index Composite B-Tree pour les requêtes chronologiques filtrées par jeu (Très fréquent)
-- Permet des "ORDER BY date DESC" instantanés
CREATE INDEX IF NOT EXISTS idx_results_lookup ON public.draw_results(draw_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_lookup ON public.draw_analytics(draw_name, date DESC);

-- Index GIN (Generalized Inverted Index) pour la recherche de numéros dans les tableaux
-- Essentiel pour : "Quand le 42 est-il sorti ?"
CREATE INDEX IF NOT EXISTS idx_results_gagnants ON public.draw_results USING GIN(gagnants);

-- Index pour les jointures utilisateurs
CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);

-- ==============================================================================
-- 5. SECURITÉ (RLS - ROW LEVEL SECURITY)
-- ==============================================================================

-- Activation globale
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algo_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;

-- Nettoyage préventif des politiques
DO $$ 
BEGIN 
    EXECUTE 'DROP POLICY IF EXISTS "Public Read Results" ON public.draw_results';
    EXECUTE 'DROP POLICY IF EXISTS "Service Write Results" ON public.draw_results';
    EXECUTE 'DROP POLICY IF EXISTS "User Own Data" ON public.user_preferences';
END $$;

-- --- POLITIQUES PUBLIQUES (LECTURE SEULE) ---
-- Tout le monde peut lire les résultats et les poids
CREATE POLICY "Public Read Results" ON public.draw_results FOR SELECT USING (true);
CREATE POLICY "Public Read Analytics" ON public.draw_analytics FOR SELECT USING (true);
CREATE POLICY "Public Read Weights" ON public.algo_weights FOR SELECT USING (true);
CREATE POLICY "Public Read Logs" ON public.learning_logs FOR SELECT USING (true);

-- --- POLITIQUES SERVICE (ÉCRITURE BACKEND) ---
-- Seul le 'service_role' (Edge Functions) peut écrire dans les tables de données globales
CREATE POLICY "Service Full Access Results" ON public.draw_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Analytics" ON public.draw_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Weights" ON public.algo_weights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Logs" ON public.learning_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Full Access Tx" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --- POLITIQUES UTILISATEUR (ISOLATION) ---
-- Les utilisateurs ne voient et ne modifient que leurs propres données
CREATE POLICY "User Manage Own Prefs" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User View Own Tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- Feedback : Insertion ouverte aux authentifiés, Lecture publique
CREATE POLICY "User Insert Feedback" ON public.prediction_feedback FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Public Read Feedback" ON public.prediction_feedback FOR SELECT USING (true);

-- ==============================================================================
-- 6. TRIGGERS (AUDIT AUTOMATIQUE)
-- ==============================================================================

-- Mise à jour automatique de la colonne updated_at
CREATE OR REPLACE TRIGGER handle_updated_at_draw_results BEFORE UPDATE ON public.draw_results FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_analytics BEFORE UPDATE ON public.draw_analytics FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_algo_weights BEFORE UPDATE ON public.algo_weights FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_user_prefs BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE OR REPLACE TRIGGER handle_updated_at_transactions BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
`;
