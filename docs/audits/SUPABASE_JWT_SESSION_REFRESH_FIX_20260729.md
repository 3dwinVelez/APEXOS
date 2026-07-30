# Correccion de sesion Supabase - JWT expired

Fecha: 2026-07-29  
Rama validada: `main`  
Incidente reportado: pantalla movil de servicios muestra `Supabase 401: JWT expired`.

## Origen de la problematica

El frontend mantiene sesiones Supabase guardando `token`, `refresh` y `auth_provider=supabase` en `localStorage`. Varias pantallas operativas, incluyendo servicios y monitor, consultan Supabase directamente mediante `supabaseFetch()`.

La capa `api.ts` ya tenia recuperacion para respuestas 401 al consumir la API interna, pero `supabaseFetch()` no renovaba ni reintentaba automaticamente cuando el access token de Supabase expiraba. Adicionalmente, `keepSessionAlive()` ignoraba los tokens Supabase porque `shouldRefreshLocalToken()` devolvia `false` para emisores Supabase.

Resultado: el tecnico podia seguir con la aplicacion abierta, pero el JWT real usado contra Supabase vencia y la siguiente consulta directa devolvia `401 JWT expired`.

## Correccion aplicada

- `apps/web/lib/supabaseClient.ts`
  - Agrega lectura segura del payload JWT.
  - Detecta sesiones Supabase por `auth_provider` o issuer del token.
  - Renueva el token cuando faltan 5 minutos o menos para expirar.
  - Serializa renovaciones concurrentes para evitar carreras entre consultas.
  - Limpia cache de lecturas Supabase al rotar el token.
  - Reintenta una vez las consultas Supabase que fallen con 401 despues de renovar.
  - Evita recursion durante `/auth/v1/token?grant_type=refresh_token` con `skipAuthRefresh`.

- `apps/web/lib/sessionSecurity.ts`
  - El heartbeat de sesion ahora tambien llama la renovacion Supabase.
  - Mientras exista refresh token valido, la pantalla abierta mantiene viva la sesion operativa.

## Validacion profesional de infraestructura

Variables requeridas para Railway frontend:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PROJECT_REF`
- `NEXT_PUBLIC_SUPABASE_TIMEOUT_MS`
- `NEXT_PUBLIC_SUPABASE_GET_CACHE_TTL_MS`
- `NEXT_PUBLIC_SUPABASE_GET_STALE_MS`
- `NEXT_PUBLIC_SUPABASE_GET_CACHE_MAX_ENTRIES`
- `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES`

El repositorio ya documenta estas variables en `.env.example`, `docs/ENVIRONMENT_VARIABLES_QA_PROD.md` y `PRODUCTION_SETUP.md`. No se requiere exponer `SUPABASE_SERVICE_ROLE_KEY` al cliente; esa clave debe seguir siendo server-side.

## Criterio operativo

Con esta correccion, una expiracion normal del access token Supabase no debe sacar al tecnico ni dejarlo en una pantalla de error. El flujo esperado es:

1. La pantalla permanece abierta.
2. `SessionLifecycle` ejecuta heartbeat cada minuto.
3. Si el token Supabase esta cerca de vencer, se renueva con el refresh token.
4. Si una consulta alcanza a recibir 401, se fuerza una renovacion y se reintenta una vez.
5. Solo se deberia pedir login nuevamente si Supabase invalida el refresh token, el usuario fue revocado o no existe refresh token local.

## Validacion ejecutada

```powershell
npm run typecheck --workspace apps/web
```

Resultado: exitoso.

