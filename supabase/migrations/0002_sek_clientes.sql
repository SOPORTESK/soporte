create table if not exists public.sek_clientes (
  id          uuid primary key default gen_random_uuid(),
  cedula      text not null unique,
  nombre      text not null,
  correo      text,
  telefono    text,
  empresa     text,
  password_hash text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists sek_clientes_cedula_idx on public.sek_clientes(cedula);

alter table public.sek_clientes enable row level security;

create policy "anon puede leer y crear clientes" on public.sek_clientes
  for all to anon using (true) with check (true);
