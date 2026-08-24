-- Proveedores de IA con sus API keys
create table if not exists sek_ai_providers (
  id text primary key,
  nombre text not null,
  api_key text,
  base_url text,
  activo boolean not null default true,
  orden int not null default 0,
  docs_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Modelos de IA configurables
create table if not exists sek_ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references sek_ai_providers(id) on delete cascade,
  modelo text not null,
  proposito text,
  usado_en text[],
  activo boolean not null default true,
  orden int not null default 0,
  last_status text,
  last_latency_ms int,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, modelo)
);

create index if not exists idx_ai_models_provider on sek_ai_models(provider_id);
create index if not exists idx_ai_models_orden on sek_ai_models(orden);

alter table sek_ai_providers enable row level security;
alter table sek_ai_models enable row level security;

drop policy if exists "service_role_all_providers" on sek_ai_providers;
create policy "service_role_all_providers" on sek_ai_providers for all using (true);

drop policy if exists "service_role_all_models" on sek_ai_models;
create policy "service_role_all_models" on sek_ai_models for all using (true);
