# Plan: Orden y deduplicación de mensajes

## Estado: PENDIENTE DE EJECUCIÓN

Punto de restauración: tag `restauracion-pre-orden` (commit `d4a6831`)
Para volver atrás: `git reset --hard restauracion-pre-orden`

## Diagnóstico (medido el 2026-08-19)

- 14.126 mensajes totales, 733 casos
- 118 casos afectados por desorden (16%)
- 1.620 mensajes duplicados
- 42% de mensajes sin `messageId` (IA 92%, técnico 52%, cliente 0%)
- 1.453 duplicados sin `messageId` (imposible deduplicar hoy)
- 83 duplicados con `messageId` distinto (reenvío real por lentitud)
- 3.781 mensajes con timestamp de segundo (WhatsApp) vs milisegundo (app)

Scripts de diagnóstico (solo lectura):
```
node scripts/diag-orden-mensajes.mjs
node scripts/diag-duplicados.mjs
node scripts/diag-messageid.mjs
```

## Causas raíz

1. `sek_append_hist` deduplica por `messageId` pero no asigna `seq`, no genera `messageId` si falta, y no deduplica por contenido.
2. El motor IA (`supabase/functions/seka-whatsapp/index.ts`) tiene 49 puntos de append directo `[...histtecnico, newMsg]` SIN pasar por `sek_append_hist`. Esos mensajes no se deduplican.
3. El frontend (`chat-view.tsx`) ordena por `time` primero. El `seq` que usa es un contador local que se reinicia cada render, no viene de la BD.
4. La lentitud del Evolution API (Render free tier) causa reenvíos que generan duplicados reales.

## Plan en 5 fases

Cada fase es independiente y reversible. Cada una se commitea por separado.

---

### Fase 1 — Migración SQL: `sek_append_hist` v2
**Sin tocar código de la app. Solo base de datos.**

Cambios a la función `sek_append_hist`:
1. Generar `messageId` (uuid v4) si no viene en el entry
2. Asignar `seq` automáticamente: `max(seq) + 1` del caso sobre ambos historiales
3. Deduplicar por contenido cuando no hay `messageId`: comparar `role + content + ventana de 60 segundos`

Archivo a crear: `supabase/migrations/20260819_append_hist_v2.sql`

Riesgo: bajo. La función es aditiva.

Verificación: enviar un mensaje de prueba y revisar que el entry quede con `seq` y `messageId`.

---

### Fase 2 — Frontend: ordenar por `seq` en vez de `time`
**Solo lectura. No modifica datos.**

Cambios a `unifyMessages` en `src/components/chat/chat-view.tsx` (líneas 130-137):
1. Ordenar por `seq` primero (si existe), `time` como fallback
2. Si un mensaje no tiene `seq` (viejo sin backfill), usar `time`

Riesgo: mínimo. Si `seq` no existe, cae al comportamiento actual.

Verificación: abrir un caso con mensajes desordenados y ver si se acomodan.

---

### Fase 3 — Motor IA: usar `sek_append_hist`
**El cambio más grande pero mecánico.**

Reemplazar los 49 puntos de `histtecnico: [...histtecnico, newMsg]` en `supabase/functions/seka-whatsapp/index.ts` con llamadas a `sek_append_hist` vía `db.rpc()`.

Lotes:
- 3a: mensajes de bienvenida y horario (líneas 1084, 1106, 1209, 1240)
- 3b: mensajes del flujo de IA (líneas 1266-1313)
- 3c: mensajes de cierre y encuesta (líneas 2095, 2405-2580)
- 3d: mensajes de escalado y menú (líneas 2610-2969)

Importante: el `extra` (estado, cliente, closed_at) se aplica en un update separado después del append, porque `sek_append_hist` solo toca el historial.

Riesgo: medio.

Verificación: mandar un mensaje al bot de prueba y revisar que la respuesta quede con `seq` y `messageId`.

---

### Fase 4 — API send y widget: usar `sek_append_hist`
**Migrar los appends directos restantes.**

Archivos:
- `src/app/api/evolution/send/route.ts`: reemplazar append directo + `persistMessageId` con `sek_append_hist`
- `src/app/api/widget/message/route.ts`: migrar a `sek_append_hist`
- `src/app/api/admin/test-bot/route.ts`: migrar a `sek_append_hist`
- `src/app/api/admin/agente-ia/simulate/route.ts`: migrar a `sek_append_hist`

Riesgo: bajo. Cada archivo es independiente.

---

### Fase 5 — Backfill de datos existentes
**Modifica datos existentes. Requiere permiso explícito del usuario.**

Script que:
1. Asigna `seq` a todos los mensajes existentes (ordenados por `time` dentro de cada caso)
2. Genera `messageId` (uuid) para los 5.956 mensajes sin identificación
3. Marca duplicados existentes como `deleted: true` (no los borra, los oculta)

Riesgo: alto. Modifica 14.126 mensajes. Por eso va de último.

Verificación: correr los 3 scripts de diagnóstico después y comparar números.

---

## Orden de ejecución

```
Fase 1 (SQL)  →  Fase 2 (frontend)  →  Fase 3 (motor IA, 4 lotes)
                                            →  Fase 4 (APIs)  →  Fase 5 (backfill)
```

## Notas

- La lentitud del Evolution API (Render free tier) es un problema separado que genera duplicados por reenvío. Upgradear el plan de Render resolvería eso.
- Hay que decidir qué hacer con los 1.620 duplicados existentes antes de la Fase 5.
