-- Roles: define para qué usa el sistema cada modelo.
-- Un modelo puede tener varios roles. El campo "orden" define la cadena de
-- fallback dentro de cada rol (menor = se intenta primero).
alter table sek_ai_models add column if not exists roles text[] not null default '{}';

create index if not exists idx_ai_models_roles on sek_ai_models using gin (roles);

-- Catálogo de roles disponibles (solo referencia para la UI)
create table if not exists sek_ai_roles (
  id text primary key,
  nombre text not null,
  descripcion text,
  orden int not null default 0
);

insert into sek_ai_roles (id, nombre, descripcion, orden) values
  ('chat',        'Chat principal',      'Conversación con el cliente · RAG · escalación', 1),
  ('web_search',  'Búsqueda web',        'Consultas con Google Search Grounding',          2),
  ('vision',      'Visión de archivos',  'Análisis de imágenes, video y documentos',       3),
  ('transcribe',  'Transcripción',       'Audio a texto de notas de voz',                  4),
  ('meta_chat',   'Chat de entrenamiento','Conversación del admin con el arquitecto',      5),
  ('learn',       'Aprendizaje',         'Resumen del caso al cerrar para el RAG',         6),
  ('auto_close',  'Cierre automático',   'Mensaje de cierre por inactividad',              7),
  ('extract',     'Extracción de datos', 'Extrae datos del cliente desde la conversación', 8),
  ('activity',    'Actividad',           'Procesamiento del registro de actividad',        9)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  orden = excluded.orden;

alter table sek_ai_roles enable row level security;
drop policy if exists "read_roles" on sek_ai_roles;
create policy "read_roles" on sek_ai_roles for all using (true);
