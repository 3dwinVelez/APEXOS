# Certificación — El panel de plataforma de Producción volvió a llenarse con un permiso, no con código

- **Fecha**: `2026-11-27`
- **Ambiente**: Producción (base de Supabase de Producción y portal servido en `www.apexos.com.co`)
- **Disparador**: orden del dueño — "el ambiente de producción de APEXOS está fallando… la pestaña de cuentas no se puede visualizar nada, no muestra empleados ni empresas, en el ambiente de QA sí está funcionando, antes sí cargaba, investiga el problema y soluciónalo"
- **Autorización escrita para las escrituras**: "dale, aplicá el permiso a adminsjc@apexos.local y sumá las dos escrituras de la tabla del enlace de la app"
- **Evidencia**: `docs/qa/evidence/permiso-plataforma-produccion-20261127/antes-despues.json`
- **Veredicto**: `CONFIGURACION_DE_AMBIENTE_CORREGIDA_Y_VERIFICADA_POR_BASE — FALTA EL SI DEL DUENO EN EL NAVEGADOR`

## 1. Qué estaba pasando

El portal de administración **no pasa por el API para leer empresas**: consulta Supabase desde el navegador con el token de la cuenta con la que uno entró ([apps/web/lib/supabaseQa.ts:144](file:///C:/Users/mq1/Documents/Proyectos/APEXOS/apps/web/lib/supabaseQa.ts#L144)) y la puerta del módulo la decide el **rol que devuelve el API** ([apps/web/lib/moduleAccess.ts:399](file:///C:/Users/mq1/Documents/Proyectos/APEXOS/apps/web/lib/moduleAccess.ts#L399)). Son dos autorizaciones distintas y pueden divergir: el API te cree administrador, la base te niega el permiso fino.

Cuando la base niega el permiso, **no hay error**. La consulta responde `200` con **0 filas** y la pestaña queda vacía. Eso es exactamente lo que se veía.

## 2. Lo medido antes de tocar nada

| Hecho | Producción | QA |
|---|---|---|
| Filas en `public.platform_admins` | **1** (`ehvelez092@gmail.com`, otorgado 2026-07-01) | **1** (`admin@apexos.qa`) |
| Último ingreso por Supabase de esa cuenta | **2026-11-13 01:23**, 0 sesiones en 14 h | **2026-11-27 00:10** |
| Cuentas humanas con rol `APEX_ADMIN` del API **sin** permiso de plataforma | **8** | — |
| Empresas activas | **3** | — |
| Políticas de `companies` / `profiles` / `company_users` / `platform_admins` y `app_private.is_platform_admin()` | **idénticas a QA** | — |
| Filas en `public.platform_settings` | **0** | **1** |
| `service_role` con SELECT en `platform_settings` | **no** (PostgREST respondía `403 42501`) | **sí** |

Cuentas que entraron a Producción en las últimas 72 horas, todas sin el permiso (cuatro de estos correos no estaban versionados en el repositorio y se redactan por Ley 1581): un operario `apexos.local` (11-27 01:13), soporte de empresa `apex.local` (11-26 21:45), un correo personal (11-25 19:15), `adminsjc@apexos.local` (11-23 13:17) y una cuenta de cliente `apexos.local` (11-20 02:04).

## 3. Que no fue el transporte del viernes (prueba, no opinión)

- `git diff --name-only 0ec1cff0..91d43c79` → **63 rutas**, de las cuales **0** coinciden con `auth|admin|platform|login|session|security|middleware`.
- Los cuatro archivos por donde viajan los datos de ese panel tienen **el mismo blob** antes y después: `suscripciones/page.tsx` (`ced3550b`), `supabaseQa.ts` (`43e2b991`), `api/platform/companies/route.ts` (`b7a987fa`), `supabaseClient.ts` (`712635e0`).
- El bundle servido habla con el proyecto de Producción (leído en **10** chunks del portal en vivo) y `/health` del API reporta `91d43c79220d`.

## 4. Las tres escrituras, y lo que deliberadamente no se hizo

Una transacción, con guarda `WHERE NOT EXISTS` en las dos inserciones: `INSERT 0 1`, `INSERT 0 1`, `GRANT`, `COMMIT`.

1. Fila en `public.platform_admins` para `adminsjc@apexos.local` (`user_id 7441d678-…`), `status = active`.
2. Fila `mobile_app.url` en `public.platform_settings` con el valor que el ambiente ya servía por respaldo.
3. `GRANT SELECT ON public.platform_settings TO service_role` — espeja QA. **No** se otorgó a `authenticated`: no existe consumidor por PostgREST y ampliar un permiso sin consumidor es superficie sin beneficio.

No se hizo: desactivar RLS en `platform_settings` (Producción queda **más estricto** que QA, y como `service_role` tiene bypass y el dueño de la tabla lee, no hace falta aflojar), editar la migración `20261125183000_platform_settings` (el archivo no describe DDL de permisos), ni `prisma migrate deploy`. Ninguna tabla de cliente fue referenciada por las sentencias.

## 5. Verificación después

- `platform_admins`: **2** filas activas, la nueva otorgada 2026-11-27 11:26.
- `platform_settings`: **1** fila (`mobile_app.url`, `updated_by = seed_20261127_produccion`).
- `has_table_privilege('service_role','public.platform_settings','SELECT')`: **true**, y `GET /rest/v1/platform_settings` con rol de servicio pasó de `403 42501` a **`HTTP 200`** con la fila.
- `GET /api/v1/public/platform/mobile-app` en Producción: sigue devolviendo `https://appapexos-production.up.railway.app` — **0** regresiones para el que no tiene sesión.

## 6. Lo que este documento no certifica

- **No se inició sesión en Producción con ninguna credencial.** La clave local dice `TEMP` y ningún instrumento versionado la consume; mintió el resultado habría sido peor que dejarlo pendiente. La cuenta del dueño no se tocó.
- **Falta el sí del dueño en el navegador**: recargar la pestaña alcanza, porque las políticas evalúan la tabla por consulta y no el token — no hace falta volver a entrar.
- No se re-midió el censo de colisiones de correo ni se promueve nada a `develop` ni a `main` por esta intervención.
