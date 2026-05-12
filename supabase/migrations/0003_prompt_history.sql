-- =====================================================================
-- SEKUNET CHAT - Migración 0003
-- Historial persistente de versiones del system_prompt de SEKA.
-- Aplicar en Supabase SQL Editor.
-- =====================================================================

-- Tabla de historial de versiones del prompt
create table if not exists public.sek_prompt_history (
  id           uuid        primary key default gen_random_uuid(),
  prompt       text        not null,
  summary      text        not null default 'Actualización de reglas',
  changed_by   text        not null,
  change_type  text        not null check (change_type in ('block_edit', 'full_replace', 'restore')),
  created_at   timestamptz not null default now()
);

-- Índice para listado cronológico inverso
create index if not exists sek_prompt_history_created_idx on public.sek_prompt_history (created_at desc);

-- RLS: solo staff puede leer; solo superadmin puede insertar
alter table public.sek_prompt_history enable row level security;

drop policy if exists "sek_prompt_history_staff_read" on public.sek_prompt_history;
create policy "sek_prompt_history_staff_read" on public.sek_prompt_history
  for select using (public.is_sek_staff(auth.uid()));

drop policy if exists "sek_prompt_history_admin_write" on public.sek_prompt_history;
create policy "sek_prompt_history_admin_write" on public.sek_prompt_history
  for insert with check (public.is_sek_admin(auth.uid()));
