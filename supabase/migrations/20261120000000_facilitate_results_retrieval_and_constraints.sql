-- ==============================================================================
-- MIGRATION: FACILITER LA RÉCUPÉRATION DES RÉSULTATS & FIABILISER LES CONTRAINTES
-- Date: 2026-11-20
-- ==============================================================================
-- 1. Corrige la contrainte valid_machine sur draw_results qui rejetait les
--    tableaux vides `{}` envoyés pour les tirages sans machine (Fortune Thursday)
--    ou lorsque les boules machine ne sont pas publiées.
-- 2. Ajoute des index composites orientés lecture globale et delta-sync.
-- 3. Ajoute deux RPC légères pour lire le dernier tirage par jeu en 1 requête
--    et consulter l'état des dernières synchronisations serveur (`sync_logs`).

-- 1. Validation 5/90 rapide et parallèle
CREATE OR REPLACE FUNCTION public.is_valid_loto_numbers(nums INTEGER[])
RETURNS BOOLEAN AS $$
BEGIN
  IF nums IS NULL OR array_length(nums, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN (
    array_length(nums, 1) = 5
    AND array_length(nums, 1) = (SELECT count(DISTINCT x)::INTEGER FROM unnest(nums) AS t(x))
    AND nums <@ ARRAY(SELECT generate_series(1, 90)::INTEGER)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

-- 2. Tolérance stricte mais cohérente sur machine : NULL, tableau vide {} ou 5 boules valides
ALTER TABLE IF EXISTS public.draw_results
  DROP CONSTRAINT IF EXISTS valid_machine;

ALTER TABLE IF EXISTS public.draw_results
  ADD CONSTRAINT valid_machine
  CHECK (machine IS NULL OR cardinality(machine) = 0 OR public.is_valid_loto_numbers(machine));

-- 3. Index haute performance pour requêtes globales ('ALL'), résumés journaliers et delta-sync
CREATE INDEX IF NOT EXISTS idx_draw_results_date_desc
  ON public.draw_results (date DESC, draw_name);

CREATE INDEX IF NOT EXISTS idx_draw_results_updated_at
  ON public.draw_results (updated_at DESC);

-- 4. Garantir la table draw_cancellations et son index de consultation récente
CREATE TABLE IF NOT EXISTS public.draw_cancellations (
  draw_name TEXT NOT NULL,
  date DATE NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (draw_name, date)
);

CREATE INDEX IF NOT EXISTS idx_draw_cancellations_date_desc
  ON public.draw_cancellations (date DESC);

ALTER TABLE public.draw_cancellations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draw_cancellations_read ON public.draw_cancellations;
CREATE POLICY draw_cancellations_read ON public.draw_cancellations
  FOR SELECT TO anon, authenticated USING (true);

-- 5. RPC : Dernier résultat réel par tirage en une seule passe indexée
CREATE OR REPLACE FUNCTION public.get_draw_results_summary(
  p_draw_names TEXT[] DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  id UUID,
  draw_name TEXT,
  date DATE,
  gagnants INTEGER[],
  machine INTEGER[],
  version INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (r.draw_name)
    r.id,
    r.draw_name,
    r.date,
    r.gagnants,
    r.machine,
    r.version,
    r.updated_at
  FROM public.draw_results r
  WHERE r.date >= (current_date - GREATEST(1, LEAST(COALESCE(p_days, 30), 365)))
    AND (p_draw_names IS NULL OR cardinality(p_draw_names) = 0 OR r.draw_name = ANY(p_draw_names))
  ORDER BY r.draw_name, r.date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_draw_results_summary(TEXT[], INTEGER)
  TO anon, authenticated, service_role;

-- 6. RPC : Consultation sécurisée (lecture seule) des dernières exécutions de sync_logs
CREATE OR REPLACE FUNCTION public.get_recent_sync_status(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  trigger_source TEXT,
  status TEXT,
  months TEXT[],
  fetched_draws INTEGER,
  upserted INTEGER,
  cancelled_inferred INTEGER,
  autopsies_caught_up INTEGER,
  snapshots_cancelled INTEGER,
  error TEXT,
  duration_ms INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.sync_logs') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.started_at,
    s.finished_at,
    s.trigger_source,
    s.status,
    s.months,
    s.fetched_draws,
    s.upserted,
    s.cancelled_inferred,
    COALESCE(s.autopsies_caught_up, 0),
    COALESCE(s.snapshots_cancelled, 0),
    s.error,
    s.duration_ms
  FROM public.sync_logs s
  ORDER BY s.started_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_sync_status(INTEGER)
  TO anon, authenticated, service_role;
