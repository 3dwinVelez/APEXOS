# Brief — Fase 3: curar las causas del fallo técnico (acotar, no ejecutar)

- **ID**: `2026-11-19-fase-3-causas-del-fallo-tecnico`
- **Fecha**: `2026-11-19`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "procede con todos los cambios necesarios bajo mi autorizacion"
- **Estado**: **acotación**. Este documento no implementa nada: deja medido qué hay que tocar, con qué evidencia y qué autorizaciones separadas pide cada pieza. La implementación abre con autorización explícita del dueño, causa por causa.

## 1. Objetivo

El enmudecimiento de ventanas (`2026-11-18-fallo-tecnico-no-es-ventana`, publicado en `desarrollo`/`develop`/`main`) logró que el cliente deje de ver el fallo técnico. No curó nada: el 500 sigue ocurriendo, ahora en silencio y con su rastro en `platform_logs`. Esta fase convierte esas causas en códigos accionables y en trabajo concreto, de forma que un 503 de congestión se parezca a lo que es y no a «API caída».

Verificable al cierre de la fase: la distribución de fallos leída en `platform_logs` baja de volumen y ningún 5xx de congestión se responde como `ERROR_INTERNO` genérico.

## 2. Alcance exacto

Inventario de la fase completa. Ninguna de estas rutas se toca en el commit que publica este brief.

### Causa A — Prisma de congestión respondido como 500 genérico

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/core/api-error.js` | Mapear `P2024` (pool agotado), `P2028` (transacción muerta) y `P2034` (conflicto de escritura) a `503` con código propio y `Retry-After`, en vez de caer al 500 genérico del fondo. Hoy el mapper solo conoce `P2002` y `P2025`. |
| `M` | `apps/api/src/modules/hr/service.js` | Retirar el set local `transientCodes` (línea ~3217) y las reescrituras puntuales de `P2028` cuando el mapper central cubra el caso; el try-lock con deadline (~1843-1868) se queda, es la parte buena. |
| `A` | `apps/api/test/api-error-congestion.test.js` | Contrato: cada código Prisma de congestión devuelve 503 + código + `retry_after`, y un error sin declarar sigue bajando a 500 sin filtrar detalle. |

### Causa B — `statement_timeout` de 5 s contra lecturas pesadas

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/modules/hr/service.js` | Las lecturas de mallas/marcaciones que hoy caben en 5 s solo con concurrencia baja: paginación-server-side y proyección sin columnas pesadas. |
| `M` | `apps/web/lib/api.ts` | Presupuesto de reintento del cliente coherente con 5 s (hoy `API_TIMEOUT_MS` = 20 000 ms y reintento ciego): reintento solo con 503 + `Retry-After`, con tope y con backoff. |
| `A` | `docs/PERFORMANCE_ANTI_PATTERNS.md` | Registrar la pareja timeout/reintento como patrón controlado con su presupuesto medido. |

**Fuera de la parte ejecutable en repo:** `statement_timeout=5s`, `lock_timeout=500ms` y `idle_in_transaction_session_timeout=5s` son ajustes del rol en la base de QA/Producción, verificados el 2026-11-15 (`docs/briefs/2026-11-15-base-datos-auditoria-intervencion.md:61`). Cambiarlos es `ALTER ROLE` en la nube: no se toca desde esta fase sin autorización independiente, y subir el techo sin arreglar la lectura solo alarga la fila.

### Causa C — evidencia binaria dentro de lecturas jsonb

Rescatada a Storage y leída por referencia en `2f8907af` (producto) — la escritura de base64 ya no es el camino normal. Lo que queda:

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `scripts/hr-purge-rescued-base64.js` | Ejecución real (hoy existe y no se ha corrido contra QA/Producción), con reporte por fila y comprobación previa de que el objeto vive en Storage antes de podar el inline. |
| `M` | `scripts/hr-rescue-inline-base64-to-storage.js` | Modo verificación: recuento de residuos después de la purga, para cerrar la cuenta con evidencia. |

**Fuera de la parte ejecutable en repo:** el `VACUUM (FULL)`/`VALIDATE` y la reconstrucción de índices que la purga habilita, y la liberación de disco en Supabase/Railway. Todo eso es infraestructura y pide autorización propia (ver §10).

### Causa D — handlers `app/api/**` que filtran el detalle de Supabase

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/api/admin/roles/route.ts` | `Supabase ${status}: ${detail}` (línea 26) deja de viajar al cliente: código propio, detalle al log. |
| `M` | `apps/web/app/api/admin/users/route.ts` | igual, línea 28 |
| `M` | `apps/web/app/api/platform/company-sessions/route.ts` | igual, línea 30 |
| `M` | `apps/web/app/api/platform/companies/route.ts` | igual, línea 68 |
| `M` | `apps/web/app/api/platform/company-modules/route.ts` | igual, línea 52 |
| `M` | `apps/web/app/api/v1/services/orders/[id]/route.ts` | igual, líneas 107 y 130 |
| `A` | `apps/web/test/technical-detail-not-leaked.test.mjs` | Ningún handler `app/api/**` devuelve en el cuerpo texto que empiece por `Supabase ` ni un `detail` crudo del proveedor. |

### Causa E — límite de solicitudes por tenant

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/server.js` | El `@fastify/rate-limit` global (línea ~94) es 200/min con clave `req.user?.tenant_id || req.ip`: un visitante anónimo comparte la bolsa de `ip` y un tenant grande se castiga a sí mismo. Presupuesto por tenant autenticado y bolsa separada, más estrecha, para las rutas públicas (incluida la ingesta de telemetría nueva). |
| `A` | `apps/api/test/rate-limit-tenant-budget.test.js` | Un tenant saturado no derriba a los demás y la ruta pública conserva su límite propio. |

### Causa F — el fallback silencioso a Supabase

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/lib/api.ts` | Cuando la API rechaza y el cliente cae al respaldo de Supabase en silencio, el origen del dato debe ser observable (estado de la pantalla, no ventana) y debe quedar registrado. Es el punto donde «funciona pero con datos viejos» se vuelve invisible. |
| `M` | `apps/web/lib/supabaseClient.ts` | Marcar la procedencia de la lectura para que la pantalla pueda decir «respaldo» sin gritar. |

Esta causa es la más delicada de la fase: toca la disponibilidad de los módulos que hoy dependen del respaldo. Entra después de A y D, nunca antes.

### Lo que ya está cerrado (no reabrir)

- **Telemetría sin sesión**: `apps/api/src/modules/admin/public-routes.js` (`POST /api/v1/public/telemetry/client-logs`, 202 honesto, sin tenant en el cuerpo) y `apps/web/lib/api.ts` (`reportClientFailure`) en `desarrollo` desde esta intervención. Falta únicamente la variable de ambiente del buzón (§10).
- **Ventanillas de validación de Talento Humano → Empleados**: los ocho `window.alert` son mensajes en línea del campo. Quedan declarados, sin cambiar: un `window.confirm` (restablecer huella, `page.tsx:852`) y un `window.prompt` (fecha de cierre de afiliación, `page.tsx:549`), que son preguntas deliberadas del usuario y no avisos de fallo.

### Módulos (`change_intent.modules`)

- `api-core`
- `hr`
- `web-api-handlers`
- `web-client`
- `rate-limit`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Cambiar parámetros del servidor de base de datos en QA/Producción (`ALTER ROLE`/`ALTER SYSTEM`) o tocar Supabase/Railway.
- Ejecutar la purga C.2, `VACUUM`, `VALIDATE` o DDL de índices en la nube.
- Promover esta fase a `develop` o `main`, desplegar, o borrar ramas auxiliares.
- El costo fijo por petición autenticada en Producción (`auth` 2,2-3,5 s medido el 2026-11-19): es frente aparte de latencia, no una causa de ventana ni de 5xx.
- Retocar la capa de alertas ya publicada: si una causa se cura, el enmudecimiento no se revisa.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos. La causa A no puede convertir un 503 en una pista sobre otros tenants, y la ruta pública de telemetría sigue sin aceptar tenant en el cuerpo.
- Sin secretos ni credenciales en el brief ni en el diff.
- Cada causa se certifica sola: un commit que mezcle A con D no pasa el manifiesto de alcance.

## 5. Criterios de aceptación

1. `node --test apps/api/test/api-error-congestion.test.js` → `P2024`, `P2028` y `P2034` responden `503` con código propio y `retry_after`; un error sin declarar sigue siendo `500` sin detalle técnico en el cuerpo.
2. `npm run certify:technical-alerts-silence:local` → sigue verde (ninguna causa nueva puede reintroducir una ventana) y `native_dialogs` queda vacío en la evidencia.
3. `node --test apps/web/test/technical-detail-not-leaked.test.mjs` → ningún handler `app/api/**` devuelve `Supabase ` en el cuerpo; el control positivo del arnés demuestra que puede ponerse rojo.
4. Lectura de `platform_logs` (autenticada, ambiente de prueba, nunca Producción) antes/después: la cuota de `ERROR_INTERNO` en rutas de HR baja y aparece en su lugar el código de congestión. Sin acceso a datos de clientes reales.
5. `npm run test:api` y `npm run test:web` en verde con la misma cuenta de pasadas que el baseline de la rama.
6. Causa C: `node scripts/hr-purge-rescued-base64.js --dry-run` (o su modo verificación) reporta 0 residuos en el ambiente local certificado, con evidencia versionada.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/api-error-congestion.test.js`, `apps/api/test/rate-limit-tenant-budget.test.js`, `apps/web/test/technical-detail-not-leaked.test.mjs`, suites `test:api` / `test:web`.
- Certificación: `npm run certify:technical-alerts-silence:local` (regresión de la promesa ya publicada) más un certificador nuevo por causa, con evidencia en `docs/qa/evidence/fase-3-causas-20261119/<causa>/`.
- `certification_status` esperado: `local_passed_qa_pending` por causa; ninguna causa se promociona con certificación parcial.

## 7. Capacidades protegidas

- **Asignación de mallas y rutas (HR)** — la causa A no puede cambiar el resultado de una escritura: misma fila, mismo horario, mismo dictamen, con `503` en vez de `500`.
- **Aislamiento multi-tenant** — causa E: un tenant que agota su presupuesto no afecta a otro; causa A: el 503 no revela el tamaño de la cola de otro tenant.
- **Alta y edición de empleados** — la validación en línea que ya entró no se degrada: el motivo sigue en el campo y `native_dialogs` sigue en cero.
- **Telemetría del navegador** — el reporte anónimo no se convierte en canal de inyección entre tenants ni de siembra de PII (ya está probado en `apps/api/test/telemetry-client-logs-public.test.js`).

## 8. Riesgos y rollback

- Riesgo: marcar de más en el mapper central convierte un fallo nuestro genuino en 503 «vuelve luego» y esconde una regresión real → Mitigación: el test exige que el error sin declarar baje a 500 y que el detalle siga yendo al log → Rollback: revert del commit del mapper, sin reset.
- Riesgo: retirar el detalle de Supabase rompe diagnósticos que hoy se hacen leyendo la respuesta → Mitigación: el detalle se conserva en `platform_logs` con `request_id`, y el modo diagnóstico (`apexos_diagnostics=1`) sigue mostrando el canal técnico.
- Riesgo: la paginación de la causa B cambia el contrato de una pantalla ya certificada → Mitigación: la certificación del enmudecimiento se re-ejecuta como regresión obligatoria.
- Riesgo: la causa F puede quitar datos a quien hoy los ve por respaldo → Mitigación: entra la última, y solo con el origen del dato visible en pantalla.

## 9. Supuestos y preguntas abiertas

- Supuesto: las causas A y D se pueden cerrar sin tocar la base; B y E necesitan medición en ambiente con datos realistas; C y F son de infraestructura y de cliente respectivamente.
- Supuesto: `platform_logs` en QA ya recibe los fallos del build publicado, así que la línea base de distribución se puede sacar de ahí sin fabricarla.
- Pregunta (altera el alcance): ¿se autoriza tocar los parámetros de rol en la base de QA para medir la causa B con presupuesto realista, o la fase se ciña a código y la nube quede para una intervención aparte?
- Pregunta (altera el alcance): ¿el `window.confirm` de restablecer huella y el `window.prompt` de cierre de afiliación se convierten en modales de la casa en esta fase, o se quedan como están por ser preguntas deliberadas?

## 10. Autorizaciones requeridas

- [ ] **Causa A** (mapper + test, solo `desarrollo`) — código, dentro de la autorización de rama.
- [ ] **Causa D** (7 handlers `app/api/**` + test) — código, dentro de la autorización de rama.
- [ ] **Causa B** (consulta paginada + presupuesto de reintento) — código; cualquier cambio de `statement_timeout` en la nube pide autorización independiente.
- [ ] **Causa E** (rate-limit por tenant) — código; la verificación con carga pide ambiente de prueba.
- [ ] **Causa F** (fallback de Supabase observable) — código, decide el dueño por impacto en disponibilidad.
- [ ] **Causa C** — ejecutar la purga en QA/Producción, `VACUUM`/`VALIDATE` y DDL de índices: **deshabilitada sin autorización explícita e independiente** (borra datos en la nube).
- [ ] **`APEXOS_TELEMETRY_TENANT_ID`** en Railway (QA y Producción) — sin ella, la ruta pública nueva responde `202 recorded:false` y el reporte anónimo no se guarda. Es una variable de ambiente en infraestructura compartida: pide autorización propia. El tenant del buzón tiene que ser un tenant de operación de APEXOS, nunca el de un cliente.
- [ ] **`HR_EVIDENCE_STORAGE_ENABLED`** en QA y Producción — la misma forma de autorización, pendiente desde la intervención de latencia del 2026-11-19 (pendiente (c) de esa entrada en `agents/CHANGELOG.md`): sin ella las marcaciones nuevas siguen escribiendo base64 en jsonb, que es la causa C de esta fase reabriéndose cada día. Si el dueño autoriza una, conviene decidir las dos en la misma sesión.
- [ ] **Promoción a `develop` / `main`** de cualquier causa — nunca incluida en el trabajo de rama.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/web/app/dashboard/talento-humano/empleados/page.tsx,apps/web/lib/api.ts,apps/api/src/modules/admin/public-routes.js,apps/api/server.js,apps/api/test/telemetry-client-logs-public.test.js,scripts/certifications/technical-alert-silence-browser-local.js,docs/briefs"` → `Veredicto: OK_CON_ADVERTENCIAS`; agentes requeridos `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- **Agentes consultados**: los cinco anteriores, con sus `SKILL.md` leídos antes de editar.
- **Documentación a actualizar**: este brief, `docs/qa/certifications/technical-alert-silence-20261118.md` (§7 deudas) y `docs/qa/certifications/technical-alert-silence-main-20261119.md` cuando una causa cierre.
- **Agentes a actualizar**: `apexos-frontend`, `apexos-backend`, `apexos-seguridad` y `apexos-qa` con los controles de esta intervención (validación en línea, ingesta pública sin sesión, certificación de ausencia de ventanillas nativas).
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256` recalculados por `agents:sync`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage` en verde antes del commit.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas de la sección 5 → commit → `git push origin desarrollo`.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
