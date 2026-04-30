# Sekunet Chat — Centro de Atención al Cliente

Plataforma **omnicanal** premium de atención al cliente, construida con **Next.js 14** + **Supabase** (Postgres, Auth, Realtime, Storage, Edge Functions).

> Diseñada con accesibilidad daltónica (paleta azul + naranja Sekunet, validada para deuteranopía/protanopía), modo claro/oscuro automático y cumplimiento WCAG AA.

## Características

- **Login seguro** con Supabase Auth (email/password + magic link).
- **Bandeja de conversaciones en tiempo real** vía Supabase Realtime.
- **Chat bidireccional** con indicadores de entregado/leído, fecha agrupada, scroll automático y envío con Enter.
- **WhatsApp Business Cloud API** integrado (recepción y envío) mediante Edge Functions.
- **Multi-canal** preparado: chat web, WhatsApp, Messenger (próximo), email (próximo).
- **Roles**: `admin`, `supervisor`, `agent`, `customer`. Row-Level Security estricto en cada tabla.
- **Tema claro/oscuro** + foco accesible, soporte teclado, respeto a `prefers-reduced-motion`.
- **Esqueleto preparado** para agente IA (RAG con pgvector) y base documental de manuales.

## Stack

| Capa            | Tecnología                                    |
| --------------- | --------------------------------------------- |
| Frontend        | Next.js 14 App Router, React 18, TypeScript  |
| UI / Estilos    | TailwindCSS, lucide-react, sonner            |
| Auth + DB       | Supabase (Postgres + RLS)                     |
| Realtime        | Supabase Realtime                             |
| Storage         | Supabase Storage (`attachments`, `avatars`)   |
| WhatsApp        | Meta Cloud API + Edge Functions Deno          |

---

## 1. Configurar Supabase

Tu proyecto: `https://kzcyxeracvfxynddyjld.supabase.co`

### a) Aplicar la migración SQL

1. Ve a **SQL Editor** en el dashboard de Supabase.
2. Pega el contenido de `supabase/migrations/0001_init.sql` y ejecuta.

Esto crea: tablas `profiles`, `customers`, `channels`, `conversations`, `messages`, `internal_notes`; triggers, RLS, buckets de Storage y publicación Realtime.

### b) Crear el primer usuario admin

1. En **Authentication → Users → Add user** crea un usuario (email + password).
2. En **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Tu nombre'
   where id = (select id from auth.users where email = 'tu@correo.com');
   ```

### c) Obtener las claves

En **Project Settings → API**, copia:

- `Project URL`
- `anon public`
- `service_role` (mantén en secreto)

---

## 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://kzcyxeracvfxynddyjld.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 3. Levantar la aplicación

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` e inicia sesión con tu admin.

---

## 4. Integrar WhatsApp Business Cloud API

### a) Pre-requisitos en Meta

1. Cuenta en [developers.facebook.com](https://developers.facebook.com).
2. App con producto **WhatsApp** habilitado.
3. Anota tu **Phone Number ID** y genera un **Access Token permanente** (System User).

### b) Desplegar las Edge Functions

Instala el [Supabase CLI](https://supabase.com/docs/guides/cli) y vincula tu proyecto:

```bash
npx supabase login
npx supabase link --project-ref kzcyxeracvfxynddyjld
npx supabase functions deploy whatsapp-webhook --no-verify-jwt
npx supabase functions deploy whatsapp-send
```

> **Importante:** `whatsapp-webhook` se despliega con `--no-verify-jwt` porque Meta llama al endpoint sin token JWT (la verificación se hace por `verify_token`).

### c) Registrar el canal en la app

1. Ingresa como admin → **Configuración → Nuevo canal WhatsApp**.
2. Captura `Phone Number ID`, `Access Token` y un `Verify Token` que tú elijas (cadena aleatoria).
3. Guarda.

### d) Configurar webhook en Meta

En Meta Developers → tu app → WhatsApp → Configuration → Webhook:

- **Callback URL:** `https://kzcyxeracvfxynddyjld.supabase.co/functions/v1/whatsapp-webhook`
- **Verify Token:** el mismo que guardaste en el paso anterior.
- **Suscripciones:** marca `messages`.

Envía un mensaje a tu número de WhatsApp Business → debe aparecer en la bandeja.

---

## 5. Despliegue a producción

### Vercel (frontend)

1. Push del repo a GitHub.
2. **Import Project** en Vercel.
3. Variables de entorno: las mismas de `.env.local`.
4. Cambia `NEXT_PUBLIC_SITE_URL` a tu dominio real.

> Recomendado actualizar Next a la versión patch más reciente del 14.x (`npm i next@^14.2.34`) por avisos de seguridad antes de desplegar a producción.

---

## 6. Estructura del proyecto

```
.
├── public/                      # logo y assets estáticos
├── src/
│   ├── app/
│   │   ├── (app)/               # rutas autenticadas
│   │   │   ├── inbox/           # bandeja de conversaciones
│   │   │   └── settings/        # configuración y canales
│   │   ├── auth/callback/       # callback de magic link
│   │   ├── login/               # login premium
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── chat/                # inbox-client, conversation-list, chat-view
│   │   ├── settings/
│   │   ├── ui/                  # button, input, avatar
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   ├── sidebar-link.tsx
│   │   └── logout-button.tsx
│   ├── lib/
│   │   ├── supabase/            # client / server / middleware
│   │   ├── types.ts
│   │   └── utils.ts
│   └── middleware.ts
├── supabase/
│   ├── migrations/0001_init.sql
│   └── functions/
│       ├── whatsapp-webhook/
│       └── whatsapp-send/
└── tailwind.config.ts
```

---

## 7. Roadmap (preparado en arquitectura)

- **Messenger**: agregar `kind = 'messenger'` con su edge function análoga.
- **Agente IA**: habilitar `pgvector`, agregar tabla `documents` + `chunks` con embeddings, conectar OpenAI/Claude.
- **Manuales / base documental**: bucket `documents` + interfaz de subida, indexación automática.
- **Plantillas WhatsApp** (HSM) para mensajes fuera de la ventana de 24h.
- **Asignación automática** de conversaciones por reglas/round-robin.
- **2FA** (TOTP) en Auth de Supabase.

---

## 8. Seguridad implementada

- **Row-Level Security** activo en todas las tablas; solo staff autenticado puede leer/escribir.
- **Service role key** nunca expuesta al cliente; usada exclusivamente en Edge Functions.
- **Cookies HTTP-only** vía `@supabase/ssr` para sesiones server-side.
- **Verify token** por canal para webhook de WhatsApp.
- **Foco visible** y `aria-*` en todos los controles para accesibilidad y auditoría.
- Storage privado para `attachments`; políticas de bucket que restringen lectura a staff.

---

## 9. Comandos útiles

```bash
npm run dev          # desarrollo
npm run build        # build producción
npm run start        # servir build
npm run typecheck    # verificar tipos TS
npm run lint         # lint
```

---

© Sekunet — Plataforma de atención al cliente.
