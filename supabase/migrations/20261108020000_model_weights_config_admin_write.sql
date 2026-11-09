-- Les poids appliqués depuis l'admin (Neural Opt., Biais Expert, calibrations) étaient refusés par RLS
-- (aucune politique d'écriture pour les utilisateurs) et l'erreur était avalée côté client.
drop policy if exists "Admin Write Weights Config" on public.model_weights_config;
create policy "Admin Write Weights Config" on public.model_weights_config
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
