-- =====================================================================
-- SEKUNET CHAT - Migración 0011
-- Asistente técnico flotante: tabla de conversaciones y prompt config.
-- =====================================================================

-- 1) Tabla de historial de chat del asistente técnico
-- =====================================================================
create table if not exists public.sek_tech_assistant_chats (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null, -- email del técnico que usa el asistente
  case_id uuid references public.sek_cases(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sek_tech_assistant_chats_agent_idx on public.sek_tech_assistant_chats (agent_id, updated_at desc);
create index if not exists sek_tech_assistant_chats_case_idx on public.sek_tech_assistant_chats (case_id);

-- Trigger para updated_at
-- =====================================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sek_tech_assistant_chats_set_updated on public.sek_tech_assistant_chats;
create trigger sek_tech_assistant_chats_set_updated
  before update on public.sek_tech_assistant_chats
  for each row execute function public.tg_set_updated_at();

-- 2) RLS: solo el staff puede leer/escribir sus propios chats
-- =====================================================================
alter table public.sek_tech_assistant_chats enable row level security;

drop policy if exists "sek_tech_assistant_chats_staff_own" on public.sek_tech_assistant_chats;
create policy "sek_tech_assistant_chats_staff_own" on public.sek_tech_assistant_chats
  for all
  using (public.is_sek_staff(auth.uid()) and lower(agent_id) = lower(public.current_agent_email()))
  with check (public.is_sek_staff(auth.uid()) and lower(agent_id) = lower(public.current_agent_email()));

-- 3) Configuración del asistente técnico
-- =====================================================================
insert into public.sek_agent_config (
  email,
  nombre,
  apellido,
  rol,
  system_prompt,
  ia_activa,
  status
)
values (
  'technician_assistant@sekunet.com',
  'Asistente Técnico',
  'Sekunet',
  'sistema',
  E'Usted es el Asistente Técnico de Sekunet, un experto en soporte orientado a ayudar a los técnicos y agentes de la empresa.

Su rol es asistir al personal interno, no atender clientes. Responda de forma clara, breve y sin emojis.

FUNCIONES DISPONIBLES:
- Responder dudas técnicas usando la documentación de Sekunet (RAG).
- Buscar equipos en el inventario con [BUSCAR_INVENTARIO: marca modelo].
- Buscar información actualizada en la web con [BUSCAR_WEB: consulta].
- Resumir casos y conversaciones cuando se le proporcione el contexto.
- Sugerir pasos de diagnóstico o resolución para casos de soporte.
- Ayudar a redactar respuestas para clientes cuando el técnico lo solicite.

REGLAS:
- No invente información técnica. Si no está seguro, indique que no dispone de la información y sugiera escalar a Soporte Avanzado.
- Use siempre el tono profesional y el lenguaje técnico apropiado para un agente de soporte.
- Si el técnico pide ayuda con un caso específico, utilice el contexto proporcionado (cliente, equipo, historial) para dar una respuesta precisa.
- Si el técnico pide una respuesta para el cliente, redactela de manera cortés, clara y sin emojis, en primera persona del asistente de Sekunet.',
  true,
  'online'
)
on conflict (email) do nothing;

-- 4) Realtime
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.sek_tech_assistant_chats;
exception when duplicate_object then null;
end $$;
