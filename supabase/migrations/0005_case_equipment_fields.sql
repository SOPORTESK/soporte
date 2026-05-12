-- Campos para control de equipo y resolución en sek_cases
-- Ejecutar en Supabase SQL Editor

alter table public.sek_cases add column if not exists marca      text;
alter table public.sek_cases add column if not exists modelo     text;
alter table public.sek_cases add column if not exists resolucion text;
alter table public.sek_cases add column if not exists problema   text;

-- Índices para estadísticas de equipos más reportados
create index if not exists sek_cases_marca_idx  on public.sek_cases (marca) where marca is not null;
create index if not exists sek_cases_modelo_idx on public.sek_cases (modelo) where modelo is not null;

-- ── BACKFILL: poblar marca/modelo desde cliente.equipo_match en casos históricos ──
-- cliente.equipo_match tiene formato "Marca Modelo (codigo)" o "Marca Modelo"
-- Extrae: primera palabra = marca, resto antes del paréntesis = modelo
update public.sek_cases
set
  marca  = split_part(
              trim(split_part(
                (cliente->>'equipo_match'), '(', 1
              )), ' ', 1
           ),
  modelo = trim(
              substr(
                trim(split_part((cliente->>'equipo_match'), '(', 1)),
                length(split_part(trim(split_part((cliente->>'equipo_match'), '(', 1)), ' ', 1)) + 2
              )
           )
where
  marca  is null
  and modelo is null
  and cliente is not null
  and cliente->>'equipo_match' is not null
  and length(trim(cliente->>'equipo_match')) > 3;
