-- Timestamps para medir tiempos de respuesta humana
alter table public.sek_cases
  add column if not exists escalado_at  timestamptz,
  add column if not exists accepted_at  timestamptz;

create index if not exists sek_cases_escalado_at_idx on public.sek_cases(escalado_at);
create index if not exists sek_cases_accepted_at_idx on public.sek_cases(accepted_at);
