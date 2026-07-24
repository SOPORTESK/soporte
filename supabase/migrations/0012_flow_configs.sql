-- Tabla para almacenar flujos del bot configurados visualmente
CREATE TABLE IF NOT EXISTS public.sek_flow_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  flow_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo puede haber un flujo activo a la vez
CREATE UNIQUE INDEX IF NOT EXISTS sek_flow_configs_active_idx
  ON public.sek_flow_configs (activo) WHERE activo = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.updated_at = now(); RETURN new; END $$;

DROP TRIGGER IF EXISTS sek_flow_configs_set_updated ON public.sek_flow_configs;
CREATE TRIGGER sek_flow_configs_set_updated
  BEFORE UPDATE ON public.sek_flow_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS: solo staff puede gestionar flujos
ALTER TABLE public.sek_flow_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read flow configs" ON public.sek_flow_configs;
CREATE POLICY "Staff can read flow configs" ON public.sek_flow_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage flow configs" ON public.sek_flow_configs;
CREATE POLICY "Admins can manage flow configs" ON public.sek_flow_configs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sek_agent_config
      WHERE email = auth.jwt() ->> 'email'
      AND rol IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sek_agent_config
      WHERE email = auth.jwt() ->> 'email'
      AND rol IN ('admin', 'superadmin')
    )
  );

-- Insertar flujo por defecto (vacío, se llenará desde el editor)
INSERT INTO public.sek_flow_configs (nombre, descripcion, flow_data, activo)
VALUES (
  'Flujo WhatsApp por defecto',
  'Flujo de bienvenida y recolección de datos para WhatsApp',
  '{"nodes":[],"edges":[]}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
