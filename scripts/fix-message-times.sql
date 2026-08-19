-- Migración: corregir tiempos de mensajes históricos
-- Problema: los mensajes del agente se guardaban con hora del servidor (desfasada),
-- mientras que los del cliente usaban la hora real de WhatsApp. Eso hacía que
-- mensajes del agente aparecieran ANTES que el mensaje del cliente que los originó.
--
-- Solución: recorrer los mensajes en orden de conversación y, si un mensaje
-- tiene un time anterior al mensaje que lo precede, ajustarlo a 1ms después.

CREATE TEMP TABLE IF NOT EXISTS _msg_fix (
  case_id UUID,
  msg_type TEXT,
  msg_idx INT,
  old_time TEXT,
  new_time TEXT
);

DO $$
DECLARE
  r RECORD;
  rec RECORD;
  prev_time TIMESTAMPTZ;
  curr_time TIMESTAMPTZ;
  new_time_str TEXT;
  fixed_count INT := 0;
BEGIN
  TRUNCATE _msg_fix;
  
  FOR r IN SELECT id, histcliente, histtecnico FROM sek_cases LOOP
    prev_time := NULL;
    
    -- Recorrer mensajes ordenados por tiempo, luego tipo (cliente primero), luego idx
    FOR rec IN
      WITH cliente_msgs AS (
        SELECT 
          'histcliente' AS msg_type,
          i AS msg_idx,
          r.histcliente->i AS entry,
          r.histcliente->i->>'time' AS time_str
        FROM generate_series(0, GREATEST(jsonb_array_length(r.histcliente) - 1, -1)) AS i
        WHERE r.histcliente IS NOT NULL 
          AND jsonb_typeof(r.histcliente) = 'array'
          AND jsonb_array_length(r.histcliente) > 0
      ),
      tecnico_msgs AS (
        SELECT 
          'histtecnico' AS msg_type,
          i AS msg_idx,
          r.histtecnico->i AS entry,
          r.histtecnico->i->>'time' AS time_str
        FROM generate_series(0, GREATEST(jsonb_array_length(r.histtecnico) - 1, -1)) AS i
        WHERE r.histtecnico IS NOT NULL 
          AND jsonb_typeof(r.histtecnico) = 'array'
          AND jsonb_array_length(r.histtecnico) > 0
      ),
      all_msgs AS (
        SELECT * FROM cliente_msgs
        UNION ALL
        SELECT * FROM tecnico_msgs
      )
      SELECT msg_type, msg_idx, time_str, entry
      FROM all_msgs
      ORDER BY 
        COALESCE(time_str, '9999-12-31T23:59:59.999Z'),
        CASE WHEN msg_type = 'histcliente' THEN 0 ELSE 1 END,
        msg_idx
    LOOP
      -- Parsear tiempo
      curr_time := NULL;
      BEGIN
        curr_time := rec.time_str::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        curr_time := NULL;
      END;
      
      new_time_str := NULL;
      
      IF curr_time IS NULL THEN
        IF prev_time IS NOT NULL THEN
          curr_time := prev_time + INTERVAL '1 millisecond';
        ELSE
          curr_time := NOW();
        END IF;
        new_time_str := to_char(curr_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      ELSIF prev_time IS NOT NULL AND curr_time < prev_time THEN
        curr_time := prev_time + INTERVAL '1 millisecond';
        new_time_str := to_char(curr_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      END IF;
      
      IF new_time_str IS NOT NULL THEN
        INSERT INTO _msg_fix VALUES (r.id, rec.msg_type, rec.msg_idx, rec.time_str, new_time_str);
        fixed_count := fixed_count + 1;
      END IF;
      
      prev_time := curr_time;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Mensajes a corregir: %', fixed_count;
  
  -- Aplicar correcciones a histtecnico
  -- Agrupar por case_id + idx para actualizar cada array
  -- Hacemos updates individuales por cada corrección
  FOR rec IN SELECT DISTINCT case_id, msg_type, msg_idx, new_time FROM _msg_fix WHERE msg_type = 'histtecnico' LOOP
    EXECUTE format(
      'UPDATE sek_cases SET histtecnico = jsonb_set(histtecnico, ARRAY[''time''], $1, false) WHERE id = $2',
      rec.msg_idx::text
    );
  END LOOP;
END;
$$;

-- Mostrar correcciones
SELECT * FROM _msg_fix LIMIT 20;
