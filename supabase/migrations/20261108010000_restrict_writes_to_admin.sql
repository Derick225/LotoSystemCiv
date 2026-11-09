-- Écriture réservée aux admins (app_metadata.role, non modifiable par l'utilisateur).
-- Le service_role (Edge Functions, cron) contourne RLS.
drop policy if exists "Auth Write Results" on public.draw_results;
drop policy if exists "Admin Write Results" on public.draw_results;
create policy "Admin Write Results" on public.draw_results for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Auth Write Weights" on public.algo_weights;
drop policy if exists "Admin Write Weights" on public.algo_weights;
create policy "Admin Write Weights" on public.algo_weights for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Auth Write Analytics" on public.draw_analytics;
drop policy if exists "Admin Write Analytics" on public.draw_analytics;
create policy "Admin Write Analytics" on public.draw_analytics for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Service role can update snapshots" on public.prediction_snapshots;

alter table public.sync_logs
  add column if not exists autopsies_caught_up integer not null default 0,
  add column if not exists snapshots_cancelled integer not null default 0;
