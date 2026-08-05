-- Plantillas personales por agente (persisten en BD, no en localStorage)
create table if not exists public.sek_plantillas_personal (
  id uuid primary key default gen_random_uuid(),
  agent_email text not null,
  nombre text not null,
  texto text not null,
  cat text default 'general',
  orden int default 0,
  created_at timestamptz default now()
);

-- Índice para buscar por agente
create index if not exists idx_sek_plantillas_personal_agent
  on public.sek_plantillas_personal(agent_email);

-- RLS: todo el staff puede leer, pero cada agente solo modifica las suyas
alter table public.sek_plantillas_personal enable row level security;

create policy "sek_plantillas_personal_staff_read"
  on public.sek_plantillas_personal for select
  using (public.is_sek_staff(auth.uid()));

create policy "sek_plantillas_personal_own_write"
  on public.sek_plantillas_personal for all
  using (public.is_sek_staff(auth.uid()))
  with check (public.is_sek_staff(auth.uid()));
