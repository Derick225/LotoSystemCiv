-- 1. Journal d'exécution de la synchronisation
create table if not exists public.sync_logs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger_source text not null default 'cron' check (trigger_source in ('cron','internal')),
  status text not null default 'running' check (status in ('running','success','partial','error')),
  months text[] not null default '{}',
  fetched_draws integer not null default 0,
  upserted integer not null default 0,
  unknown_draw_names text[] not null default '{}',
  missing jsonb not null default '[]'::jsonb,
  cancelled_inferred integer not null default 0,
  http_errors jsonb not null default '[]'::jsonb,
  error text,
  duration_ms integer
);
create index if not exists sync_logs_started_at_idx on public.sync_logs (started_at desc);
alter table public.sync_logs enable row level security;
revoke all on public.sync_logs from anon, authenticated;

-- 2. Tirages annulés (jours fériés, etc.)
create table if not exists public.draw_cancellations (
  draw_name text not null,
  date date not null,
  reason text,
  source text not null default 'manual' check (source in ('manual','auto')),
  created_at timestamptz not null default now(),
  primary key (draw_name, date)
);
alter table public.draw_cancellations enable row level security;
drop policy if exists draw_cancellations_read on public.draw_cancellations;
create policy draw_cancellations_read on public.draw_cancellations
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.draw_cancellations from anon, authenticated;

-- 3. Secret dédié dans Vault
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_sync_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cron_sync_secret',
      'Secret partagé pg_cron -> Edge Function cron-sync'
    );
  end if;
end $$;

create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_sync_secret' and decrypted_secret = p_secret
  );
$$;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

-- 4. Un seul job horaire
do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('sync_loto_results_et_ai', 'sync-draw-results-hourly') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'sync-draw-results-hourly',
  '5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://gmwsybvnsxxhudwgcajh.supabase.co/functions/v1/cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cmd$
);
