-- ==============================================================================
-- SCRIPT DE DÉPLOIEMENT DES MISES À JOUR (NEXUS PLATINUM v12.0)
-- À exécuter sur la base de données existante
-- ==============================================================================

-- 1. Activer le temps réel (WebSockets) pour la table prediction_snapshots
-- Cela permet à l'interface de se mettre à jour instantanément quand une autopsie est terminée
BEGIN;
  -- Création de la table prediction_snapshots si elle n'existe pas déjà
  CREATE TABLE IF NOT EXISTS public.prediction_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    draw_name TEXT NOT NULL,
    target_date DATE NOT NULL,
    predictions JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT now()
  );
  
  -- Index et RLS
  CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_lookup ON public.prediction_snapshots(draw_name, target_date DESC);
  ALTER TABLE public.prediction_snapshots ENABLE ROW LEVEL SECURITY;
  
  -- Policies (Ignorer les erreurs si elles existent déjà)
  DO $
  BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Snapshots' AND tablename = 'prediction_snapshots') THEN
          CREATE POLICY "Public Read Snapshots" ON public.prediction_snapshots FOR SELECT USING (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Full Access Snapshots' AND tablename = 'prediction_snapshots') THEN
          CREATE POLICY "Service Full Access Snapshots" ON public.prediction_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
  END
  $;

  -- On vérifie si la publication existe, sinon on la crée (Supabase la crée par défaut)
  -- On ajoute la table à la publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.prediction_snapshots;
EXCEPTION
  WHEN duplicate_object THEN
    -- Si la table est déjà dans la publication, on ignore l'erreur
    NULL;
END;

-- 2. Sécurisation du Cron Job de synchronisation
-- On supprime l'ancien job s'il existe
SELECT cron.unschedule('sync-draw-results-hourly');

-- On recrée le job avec l'en-tête d'autorisation (Sécurité)
-- REMPLACEZ 'VOTRE_SERVICE_ROLE_KEY' par votre vraie clé Service Role Supabase
SELECT cron.schedule(
  'sync-draw-results-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
      url:='https://ais-pre-iexwhv27jnwut37iq2ksdr-108345727073.europe-west2.run.app/api/cron-sync',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer VOTRE_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{"manualTrigger": false}'::jsonb
  );
  $$
);

-- 3. (Optionnel) Vérification des colonnes JSONB
-- Les nouvelles métriques (machine_transfer, near_misses, etc.) sont stockées 
-- dans les colonnes JSONB existantes (decision_dna, metrics_snapshot, etc.).
-- Aucune modification de structure de table n'est donc requise pour ces ajouts mathématiques.
