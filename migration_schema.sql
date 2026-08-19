-- Ejecutar en el SQL Editor del nuevo proyecto

CREATE TABLE IF NOT EXISTS garantias_historial (
  "id" text PRIMARY KEY,
  "garantia_id" text,
  "fecha" timestamptz,
  "observaciones" text,
  "seguimiento" text,
  "modificado_por" text,
  "created_at" timestamptz
);

ALTER TABLE garantias_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role all" ON garantias_historial FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS registros (
  id text PRIMARY KEY,
  data jsonb
);

CREATE TABLE IF NOT EXISTS perfiles (
  "id" text PRIMARY KEY,
  "nombre" text,
  "apellido" text,
  "correo" text,
  "rol" text,
  "created_at" timestamptz
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role all" ON perfiles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS garantias (
  "id" text PRIMARY KEY,
  "numero_consecutivo" integer,
  "boleta" text,
  "tipo" text,
  "categoria" text,
  "motivo" text,
  "ticket" text,
  "sede" text,
  "nombre" text,
  "factura" text,
  "cantidad" integer,
  "fecha_compra" date,
  "marca" text,
  "serie" text,
  "descripcion" text,
  "falla" text,
  "fecha_creacion" timestamptz,
  "usuario_nombre" text,
  "usuario_id" text,
  "modificado_por" text,
  "fecha_modificacion" timestamptz,
  "registrado_por" text,
  "dev" text,
  "fecha_aprobacion" timestamptz,
  "numero_serie" text,
  "ticket_rma" text,
  "fecha_rma" date,
  "serie_fabrica" text,
  "estatus" text,
  "observaciones" text,
  "seguimiento" text,
  "factura_salida" text,
  "articulos_adicionales" text,
  "excluir_rma" boolean
);

ALTER TABLE garantias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role all" ON garantias FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS inventario (
  "id" text PRIMARY KEY,
  "bodega" text,
  "articulo" text,
  "descripcion" text,
  "marca" text,
  "unidad" text,
  "disponible" text,
  "updated_at" timestamptz
);

ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role all" ON inventario FOR ALL TO service_role USING (true) WITH CHECK (true);

