-- Activity Tracker Schema para Supabase nativo

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  agent_email TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  case_id TEXT,
  metadata JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_summary (
  id BIGSERIAL PRIMARY KEY,
  agent_email TEXT NOT NULL,
  date TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  time_block TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON activity_log(agent_email);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_summary_agent ON activity_summary(agent_email);
CREATE INDEX IF NOT EXISTS idx_activity_summary_date ON activity_summary(date);

-- Índices para cargar rápidamente los casos asignados y ordenados por actividad
CREATE INDEX IF NOT EXISTS idx_sek_cases_assigned_last_message
  ON sek_cases(assigned_to, last_message_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sek_cases_channel_test
  ON sek_cases(canal, es_test);

-- RLS: solo service_role puede insertar/leer (las API routes usan service client)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_summary ENABLE ROW LEVEL SECURITY;

-- Política: service_role tiene acceso total
CREATE POLICY "Service role full access activity_log" ON activity_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access activity_summary" ON activity_summary
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
