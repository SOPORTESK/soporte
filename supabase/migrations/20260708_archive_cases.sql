-- =====================================================================
-- SEKUNET CHAT - Migración: archivo de casos antiguos comprimidos
-- Casos cerrados/resueltos con más de 3 meses se mueven a
-- sek_case_archives con histcliente e histtecnico comprimidos (gzip).
-- =====================================================================

create table if not exists public.sek_case_archives (
  id uuid primary key,
  estado text not null,
  canal text,
  customer_phone text,
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  archived_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  histcliente_gzip bytea,
  histtecnico_gzip bytea
);

create index if not exists sek_case_archives_assigned_idx on public.sek_case_archives (assigned_to);
create index if not exists sek_case_archives_phone_idx on public.sek_case_archives (customer_phone);
create index if not exists sek_case_archives_closed_at_idx on public.sek_case_archives (closed_at desc nulls last);

-- RLS: solo staff puede leer/escribir archivos
alter table public.sek_case_archives enable row level security;

drop policy if exists "sek_case_archives_staff_rw" on public.sek_case_archives;
create policy "sek_case_archives_staff_rw" on public.sek_case_archives for all
  using (public.is_sek_staff(auth.uid())) with check (public.is_sek_staff(auth.uid()));
