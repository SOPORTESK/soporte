-- =====================================================================
-- SEKUNET CHAT - Migración 0001 (sobre esquema sek_* existente)
-- Adapta el esquema actual para soportar la app de chat omnicanal.
-- Aplicar UNA SOLA VEZ en Supabase SQL Editor.
-- =====================================================================

create extension if not exists "pgcrypto";

-- 1) Canales (WhatsApp, Messenger, etc.)
create table if not exists public.sek_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('web','whatsapp','messenger','email')),
  name text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Extender sek_cases con tracking
alter table public.sek_cases add column if not exists last_message_at timestamptz;
alter table public.sek_cases add column if not exists last_message_preview text;
alter table public.sek_cases add column if not exists unread_count int not null default 0;
alter table public.sek_cases add column if not exists assigned_to text;
alter table public.sek_cases add column if not exists channel_id uuid references public.sek_channels(id) on delete set null;
alter table public.sek_cases add column if not exists customer_phone text;
alter table public.sek_cases add column if not exists updated_at timestamptz not null default now();

create index if not exists sek_cases_last_msg_idx on public.sek_cases (last_message_at desc nulls last);
create index if not exists sek_cases_assigned_idx on public.sek_cases (assigned_to);
create index if not exists sek_cases_phone_idx on public.sek_cases (customer_phone);
create index if not exists sek_messages_case_idx on public.sek_messages (case_id, created_at);
create index if not exists sek_messages_external_idx on public.sek_messages (external_id);

-- 3) Triggers
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sek_cases_set_updated on public.sek_cases;
create trigger sek_cases_set_updated before update on public.sek_cases
  for each row execute function public.tg_set_updated_at();

drop trigger if exists sek_channels_set_updated on public.sek_channels;
create trigger sek_channels_set_updated before update on public.sek_channels
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_sek_message_after_insert()
returns trigger language plpgsql as $$
begin
  update public.sek_cases set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.content,''), 200),
    unread_count = case when new.agent_email is null
                        then unread_count + 1 else unread_count end,
    updated_at = now()
  where id = new.case_id;
  return new;
end $$;

drop trigger if exists sek_messages_after_insert on public.sek_messages;
create trigger sek_messages_after_insert after insert on public.sek_messages
  for each row execute function public.tg_sek_message_after_insert();

-- 4) Helpers de seguridad (puente auth.users <-> sek_agent_config por email)
create or replace function public.is_sek_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1 from auth.users u
    join public.sek_agent_config a on lower(a.email) = lower(u.email)
    where u.id = uid
  );
$$;

create or replace function public.is_sek_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(
    select 1 from auth.users u
    join public.sek_agent_config a on lower(a.email) = lower(u.email)
    where u.id = uid and a.rol in ('admin','superadmin')
  );
$$;

create or replace function public.current_agent_email()
returns text language sql stable security definer set search_path = public, auth as $$
  select u.email from auth.users u where u.id = auth.uid();
$$;

-- 5) RLS
alter table public.sek_agent_config enable row level security;
alter table public.sek_cases        enable row level security;
alter table public.sek_messages     enable row level security;
alter table public.sek_docs         enable row level security;
alter table public.sek_doc_chunks   enable row level security;
alter table public.sek_plantillas   enable row level security;
alter table public.sek_train        enable row level security;
alter table public.sek_inventario   enable row level security;
alter table public.sek_audit_log    enable row level security;
alter table public.sek_channels     enable row level security;

drop policy if exists "sek_agent_staff_read"  on public.sek_agent_config;
create policy "sek_agent_staff_read"  on public.sek_agent_config for select using (public.is_sek_staff(auth.uid()));

drop policy if exists "sek_agent_admin_write" on public.sek_agent_config;
create policy "sek_agent_admin_write" on public.sek_agent_config for all
  using (public.is_sek_admin(auth.uid())) with check (public.is_sek_admin(auth.uid()));

drop policy if exists "sek_channels_staff_read" on public.sek_channels;
create policy "sek_channels_staff_read" on public.sek_channels for select using (public.is_sek_staff(auth.uid()));

drop policy if exists "sek_channels_admin_write" on public.sek_channels;
create policy "sek_channels_admin_write" on public.sek_channels for all
  using (public.is_sek_admin(auth.uid())) with check (public.is_sek_admin(auth.uid()));

do $$
declare t text;
begin
  for t in select unnest(array[
    'sek_cases','sek_messages','sek_docs','sek_doc_chunks',
    'sek_plantillas','sek_train','sek_inventario','sek_audit_log'
  ]) loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_rw', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_sek_staff(auth.uid())) with check (public.is_sek_staff(auth.uid()))',
      t || '_staff_rw', t
    );
  end loop;
end $$;

-- 6) Realtime
do $$ begin alter publication supabase_realtime add table public.sek_messages;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.sek_cases;
exception when duplicate_object then null; end $$;

-- 7) Storage
insert into storage.buckets (id, name, public)
values ('sek-attachments','sek-attachments', false)
on conflict (id) do nothing;

drop policy if exists "sek_attachments_staff_select" on storage.objects;
create policy "sek_attachments_staff_select" on storage.objects for select
  using (bucket_id = 'sek-attachments' and public.is_sek_staff(auth.uid()));

drop policy if exists "sek_attachments_staff_insert" on storage.objects;
create policy "sek_attachments_staff_insert" on storage.objects for insert
  with check (bucket_id = 'sek-attachments' and public.is_sek_staff(auth.uid()));
