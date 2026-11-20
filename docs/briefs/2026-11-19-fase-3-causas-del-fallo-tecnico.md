# Brief — Fase 3: curar las causas del fallo técnico (acotar, no ejecutar)

- **ID**: `2026-11-19-fase-3-causas-del-fallo-tecnico`
- **Fecha**: `2026-11-19`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "procede con todos los cambios necesarios bajo mi autorizacion"
- **Estado**: **acotación + ejecución parcial (2026-11-20)**. El documento abrió como acotación —dejó medido qué hay que tocar, con qué evidencia y qué autorizaciones separadas pide cada pieza— y el 2026-11-20 el dueño autorizó ejecutar causa por causa («procede con mi autorizacion los pendientes»). **Cerradas en `desarrollo`: A y D**, con sus contratos, su regresión de navegador (79/79) y su evidencia versionada. **En pie: B, E, F y C** —cada una con la autorización que le falta en §10, ninguna tocada a medias en este corte—.

## 1. Objetivo

El enmudecimiento de ventanas (`2026-11-18-fallo-tecnico-no-es-ventana`, publicado en `desarrollo`/`develop`/`main`) logró que el cliente deje de ver el fallo técnico. No curó nada: el 500 sigue ocurriendo, ahora en silencio y con su rastro en `platform_logs`. Esta fase convierte esas causas en códigos accionables y en trabajo concreto, de forma que un 503 de congestión se parezca a lo que es y no a «API caída».

Verificable al cierre de la fase: la distribución de fallos leída en `platform_logs` baja de volumen y ningún 5xx de congestión se responde como `ERROR_INTERNO` genérico.

## 2. Alcance exacto

Inventario de la fase completa. Ninguna de estas rutas se toca en el commit que publica este brief.

### Causa A — Prisma de congestión respondido como 500 genérico — **CERRADA el 2026-11-20**

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/core/api-error.js` | Mapear `P2024` (pool agotado), `P2028` (transacción muerta) y `P2034` (conflicto de escritura) a `503` con código propio y `Retry-After`, en vez de caer al 500 genérico del fondo. Hoy el mapper solo conoce `P2002` y `P2025`. |
| `M` | `apps/api/server.js` | **Añadido al inventario durante la ejecución:** el `setErrorHandler` respondía el `payload` y descartaba el presupuesto. Sin traducir `outcome.retryAfter` a la cabecera `retry-after`, el `503` decía «vuelve luego» pero no decía cuándo, y el reintento del cliente seguía a ciegas. |
| ~~`M`~~ | `apps/api/src/modules/hr/service.js` | **No se toca, con motivo declarado.** El set local `transientCodes` (línea 3252) no era una reescritura puntual de `P2028` sino la política de reintento de la marcación: cinco intentos con backoff de 120 ms × intento y, solo al agotarlos, el `503` declarado `MARCACION_CONCURRENCIA_TEMPORAL`. Retirarlo no delega nada al mapper: convierte cada pico de congestión en un rebote al operario en el primer intento. Es la misma clase de pieza que el brief perdona en el try-lock con deadline (~1843-1868), y por eso se queda. El mapper central sí cubre hoy los caminos que no reintentan. |
| `A` | `apps/api/test/api-error-congestion.test.js` | Contrato: cada código Prisma de congestión devuelve 503 + código + `retry_after`, y un error sin declarar sigue bajando a 500 sin filtrar detalle. |

Ejecutado y medido el 2026-11-20: `node --test apps/api/test/api-error-congestion.test.js apps/api/test/api-error-mapping.test.js` → **11/11** (6 controles nuevos de congestión + los 5 del contrato previo, que sigue verde: la causa A no pudo deformar lo que ya se respondía bien). Falsiabilidad probada sobre el mapper anterior: con el código viejo el mismo test falla `500 ERROR_INTERNO`. El contrato de `server.js` se verifica sobre el archivo fuente (leer una cabecera exige levantar la app, y `build()` deja handles vivos).

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

Ejecutado y medido el 2026-11-20: los **7 sitios** de los **6 handlers** quedaron reparados. El detalle vive ahora en `console.error` del servidor y el cuerpo recibe «El servicio de datos no respondió como se esperaba. Intente de nuevo o avise a soporte.» El control es un barrido de familia, no un parche sitio por sitio: `node --test apps/web/test/technical-detail-not-leaked.test.mjs` → **5/5**, y recorre los 9 `route.ts` de `app/api/**` —los 6 reparados y los 3 que nunca filtraron—, así que un handler nuevo que filtre cae bajo el mismo control. Contraste probado dos veces: el arnés ve el `throw` y la respuesta en un fixture fabricado (2 de 2) y, devolviendo a mano una filtración real a `admin/roles/route.ts`, se puso rojo (3 fallos) antes de restaurar el archivo. `npm run lint` → 0 errores / 24 warnings (el baseline de la rama) y `npm --workspace apps/web run typecheck` → limpio.

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

### Estado de la fase (2026-11-20)

Cerradas en `desarrollo`, dentro de la autorización de rama: **A** y **D**. En pie: **B** y **E** (piden medición en ambiente con datos realistas), **F** (decisión del dueño por impacto en disponibilidad: entra después de A y D, que ya lo están), **C** (deshabilitada sin autorización explícita e independiente: borra datos en la nube).

La cuenta de la suite web que deja esta fase: baseline de la rama **861 tests / 856 pasan / 5 rojos** → después de A y D **867 / 863 / 4**. Los 4 que quedan son contratos de otros frentes, cada uno medido contra el código y ajeno a este diff (los archivos que leen están idénticos a `HEAD`):

- `transport-master-access` y `transport-vehicle-master-catalogs`: **el contrato está viejo, no la capacidad.** La ficha de vehículo sí condiciona la lectura de flota a `canReadHr` (`app/dashboard/transporte/page.tsx:347`) y sí pide la estructura contable (`:332`), pero el test exige la forma textual `access.canReadHr ? api<Employee[]>` (hoy es un bloque `if`) y `api<OrgTree>("…vehicle-accounting-structure")` con paréntesis cerrado (hoy lleva `{ cache: "no-store" }`, añadido por el frente de latencia). Dos cadenas que el producto superó.
- `command-palette-module-functions`: `/dashboard/contabilidad/pyg/ampliado` tiene página pero ninguna entrada `fn-` en `lib/moduleFunctions.ts`, así que no se llega desde el centro de comandos. Falta de registro, no de arnés.
- `accounting-pyg-interactive`: `components/accounting/AccountingPygBudget.tsx` no contiene `/api/v1/accounting/organization-tree`. Aquí hace falta abrir el frente de Contabilidad para saber si el editor de presupuesto dejó de necesitar la cascada o si el acceso a la estructura se cayó de verdad; no se resuelve desde este corte.

Repararlos es tocar Transporte, Contabilidad y el registro del portafolio: un merge de rama completa disfrazado, que la gobernanza prohibe en un corte de `api-core` + `web-api-handlers`. Quedan declarados con su frente responsable.

### Lo que ya está cerrado (no reabrir)

- **Telemetría sin sesión**: `apps/api/src/modules/admin/public-routes.js` (`POST /api/v1/public/telemetry/client-logs`, 202 honesto, sin tenant en el cuerpo) y `apps/web/lib/api.ts` (`reportClientFailure`) en `desarrollo` desde esta intervención. La variable del buzón **ya está puesta y medida** (§10): QA `e8fac747-…` (Empresa Demo APEX-OS, `docs/qa/certifications/technical-alert-silence-seguencia-20261119.md:54`) y Producción `52db0658-…` (APEXOS Platform, `docs/qa/evidence/technical-alert-silence-20261119/prod-20261120/lectura.txt:21`). Nunca el tenant de un cliente real.
- **Ventanillas de validación de Talento Humano → Empleados**: los ocho `window.alert` son mensajes en línea del campo. ~~Quedan declarados, sin cambiar: un `window.confirm` (restablecer huella, `page.tsx:852`) y un `window.prompt` (fecha de cierre de afiliación, `page.tsx:549`)~~ **Convertidos el 2026-11-20** (detalle en la pregunta contestada de §9): la pantalla quedó en **cero ventanillas nativas**, medido por contrato con control de contraste y sobre el binario del propio corte (`docs/qa/evidence/technical-alert-silence-20261119/cero-ventanillas-empleados/`, 79/79). **Cabo suelto cerrado también el 2026-11-20:** `apps/web/test/hr-employee-biometric-reset.test.mjs` seguía exigiendo `window.confirm(` y venía poniendo roja la suite desde la conversión —un contrato que pedía la ventanilla que el producto ya no abre—. Ahora mide lo que sí ocurre: dos clics en el panel (`setArmed(true)` → «Confirmar restablecimiento», `Cancelar` desarma), la ruta `DELETE` del API y que el panel se remonte por empleado con `key={String(selected.id)}` (`page.tsx:675`); sin ese `key` el disparador quedaría armado sobre la ficha equivocada y el segundo clic borraría el registro del empleado incorrecto. 4/4 verde, con las dos comprobaciones nuevas vistas en rojo antes de restaurar (quitar el `key` y reintroducir el `confirm`).
- **El lint de la rama**, condición heredada y no causa de esta fase: `desarrollo` venía con tres pushes rojos en `Lint & TypeCheck` por un único `react/jsx-key` en el botón que la escalera de `reportes/page.tsx:1139` genera con `missingPunches.map()` (nacido en `450bd4d6`, el 2026-11-19). Reparado y medido en `16fb4d1d`: `eslint` de `apps/web` pasó de `1 error`/exit 1 a `0 errores`/exit 0 y el run `44689953380` salió **success**. Lo que explica que sobreviviera tres cortes no es el error sino que **ninguna compuerta local invoca `eslint`** (`check:local` solo mira `.env` y Docker, `qa:full-validation` no lo incluye y no hay `pre-push`) y el pipeline no formaba parte del cierre.

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

1. `node --test apps/api/test/api-error-congestion.test.js` → `P2024`, `P2028` y `P2034` responden `503` con código propio y `retry_after`; un error sin declarar sigue siendo `500` sin detalle técnico en el cuerpo. **Cumplido el 2026-11-20: 11/11** con el contrato previo de mapeo, y falsabilidad vista (con el mapper anterior, el test nuevo falla `500 ERROR_INTERNO`).
2. `npm run certify:technical-alerts-silence:local` → sigue verde (ninguna causa nueva puede reintroducir una ventana) y `native_dialogs` queda vacío en la evidencia. **Cumplido el 2026-11-20: 79/79** con `native_dialogs: []`, sobre el binario del corte (`BUILD_ID _I5ZfzKrKtY0K35ArePQD`), en `docs/qa/evidence/fase-3-causas-ad-20261120/`.
3. `node --test apps/web/test/technical-detail-not-leaked.test.mjs` → ningún handler `app/api/**` devuelve `Supabase ` en el cuerpo; el control positivo del arnés demuestra que puede ponerse rojo. **Cumplido el 2026-11-20: 5/5** (fixture 2/2 y filtración real devuelta a mano para ver 3 fallos).
4. Lectura de `platform_logs` (autenticada, ambiente de prueba, nunca Producción) antes/después: la cuota de `ERROR_INTERNO` en rutas de HR baja y aparece en su lugar el código de congestión. Sin acceso a datos de clientes reales. **No medible desde el puesto:** el `después` exige que el build con el mapper nuevo esté desplegado en QA, así que la causa A cierra como `local_passed_qa_pending`.
5. `npm run test:api` y `npm run test:web` en verde con la misma cuenta de pasadas que el baseline de la rama. **Medido, con la salvedad de los nombres:** no existen `test:api` ni `test:web` en la raíz —las suites corren por workspace con `node --test test/*.test.mjs`—. Web: baseline de la rama **861/856/5** → **867/863/4**; los 4 restantes son contratos de Transporte, Contabilidad y del registro del portafolio (ver «Estado de la fase»), todos con insumos idénticos a `HEAD`. API: la suite completa sigue con la deuda declarada de `apex-control/pulse.js` sin base local; este corte corre apuntado (11/11 de mapeo y congestión, más `telemetry-client-logs-public` **7/7** y `apex-control-modules` **8/8** —este último estaba imposibilitado por un `fastify` ausente en `node_modules`, no por el diff—). Lint **0 errores / 24 warnings** y `typecheck` limpio.
6. Causa C: `node scripts/hr-purge-rescued-base64.js --dry-run` (o su modo verificación) reporta 0 residuos en el ambiente local certificado, con evidencia versionada. **No intentado:** la causa C está deshabilitada sin autorización explícita e independiente.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/api-error-congestion.test.js`, `apps/api/test/rate-limit-tenant-budget.test.js`, `apps/web/test/technical-detail-not-leaked.test.mjs`, suites `test:api` / `test:web`.
- Certificación: `npm run certify:technical-alerts-silence:local` (regresión de la promesa ya publicada) más un certificador nuevo por causa, con evidencia en `docs/qa/evidence/fase-3-causas-20261119/<causa>/`.
- `certification_status` esperado: `local_passed_qa_pending` por causa; ninguna causa se promociona con certificación parcial.
- **Lo que efectivamente se usó como evidencia en A y D (2026-11-20):** no hizo falta un certificador nuevo por causa —lo que cada causa necesitaba demostrar es un contrato de código, y vive en `apps/api/test/api-error-congestion.test.js` y `apps/web/test/technical-detail-not-leaked.test.mjs`, ambos con su control de contraste—. La certificación de navegador existente se re-ejecutó como regresión obligatoria sobre el binario del corte y su evidencia quedó en `docs/qa/evidence/fase-3-causas-ad-20261120/` (`certification.json`: 79 checks, 0 fallos, `native_dialogs: []`, `build_id _I5ZfzKrKtY0K35ArePQD`). Estado real de ambas: **`local_passed_qa_pending`** —en QA falta el `platform_logs` antes/después del criterio 4, que no puede medirse hasta desplegar—.

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
- Pregunta (altera el alcance): ~~¿el `window.confirm` de restablecer huella y el `window.prompt` de cierre de afiliación se convierten en modales de la casa en esta fase, o se quedan como están por ser preguntas deliberadas?~~ **Contestada y ejecutada el 2026-11-20 por el dueño («procede con mi autorización los pendientes»).** Los dos vivían en `apps/web/app/dashboard/talento-humano/empleados/page.tsx` y ninguno se convirtió en modal: la pantalla ya no interrumpe. El cierre de afiliación pide la fecha en un `input type="date"` dentro de la propia fila —el `prompt` pedía `YYYY-MM-DD` escrito a mano—, con el motivo (`fecha vacía`, `anterior al inicio de vigencia`, el error del `PATCH`) debajo del campo con `role="alert"` + `aria-invalid` y el rojo que se borra al escribir; restablecer la huella quedó en dos clics dentro del panel, con la advertencia leída en la pantalla y el estado desarmado al cambiar de empleado. La pantalla cierra con **cero ventanillas nativas** (`alert`, `confirm` y `prompt`), medido por contrato con control de contraste. Los otros 24 `window.confirm` **no** se tocan aquí: son catorce archivos de cinco áreas (Administración, Contabilidad, Inventario, Tesorería y Transporte), cada uno es un corte con su propia medición y su certificación, y mezclarlos sería el merge de rama completa que la gobernanza prohibe.

## 10. Autorizaciones requeridas

- [x] **Causa A** (mapper + test, solo `desarrollo`) — código, dentro de la autorización de rama. **Ejecutada el 2026-11-20** con una ruta añadida al inventario (`apps/api/server.js`, para que el `Retry-After` salga de cabecera) y una que no se tocó y por qué (`transientCodes` en `hr/service.js`: política de reintento, no parche de mapeo).
- [x] **Causa D** (7 handlers `app/api/**` + test) — código, dentro de la autorización de rama. **Ejecutada el 2026-11-20** con barrido de familia sobre los 9 `route.ts` de `app/api/**`.
- [ ] **Causa B** (consulta paginada + presupuesto de reintento) — código; cualquier cambio de `statement_timeout` en la nube pide autorización independiente.
- [ ] **Causa E** (rate-limit por tenant) — código; la verificación con carga pide ambiente de prueba.
- [ ] **Causa F** (fallback de Supabase observable) — código, decide el dueño por impacto en disponibilidad.
- [ ] **Causa C** — ejecutar la purga en QA/Producción, `VACUUM`/`VALIDATE` y DDL de índices: **deshabilitada sin autorización explícita e independiente** (borra datos en la nube).
- [x] **`APEXOS_TELEMETRY_TENANT_ID`** en Railway (QA y Producción) — **puesta y medida el 2026-11-20** con autorización del dueño («procede con mi autorizacion los pendientes»): QA `e8fac747-e410-41dd-8784-2c0ca71660e8` (Empresa Demo APEX-OS) y Producción `52db0658-a184-4fa1-a47b-c90b184914c3` (APEXOS Platform), ambos tenants propios de la plataforma y nunca el de un cliente. Sin ella, la ruta pública respondía `202 recorded:false`; con ella la sonda de artefacto volvió a POSTear y el reporte se guarda. Fue una variable de ambiente en infraestructura compartida y exigió autorización expresa, que quedó otorgada solo para estas dos llaves.
- [ ] **`HR_EVIDENCE_STORAGE_ENABLED`** en QA y Producción — la misma forma de autorización, pendiente desde la intervención de latencia del 2026-11-19 (pendiente (c) de esa entrada en `agents/CHANGELOG.md`): sin ella las marcaciones nuevas siguen escribiendo base64 en jsonb, que es la causa C de esta fase reabriéndose cada día. Si el dueño autoriza una, conviene decidir las dos en la misma sesión.
- [ ] **Promoción a `develop` / `main`** de cualquier causa — nunca incluida en el trabajo de rama.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/web/app/dashboard/talento-humano/empleados/page.tsx,apps/web/lib/api.ts,apps/api/src/modules/admin/public-routes.js,apps/api/server.js,apps/api/test/telemetry-client-logs-public.test.js,scripts/certifications/technical-alert-silence-browser-local.js,docs/briefs"` → `Veredicto: OK_CON_ADVERTENCIAS`; agentes requeridos `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- **Preflight del corte A+D (2026-11-20)**: `npm run agents:preflight -- --paths "apps/api/src/core/api-error.js,apps/api/server.js,apps/api/test/api-error-congestion.test.js,apps/web/app/api/admin/roles/route.ts,apps/web/app/api/admin/users/route.ts,apps/web/app/api/platform/companies/route.ts,apps/web/app/api/platform/company-modules/route.ts,apps/web/app/api/platform/company-sessions/route.ts,apps/web/app/api/v1/services/orders/[id]/route.ts,apps/web/test/technical-detail-not-leaked.test.mjs,apps/web/test/hr-employee-biometric-reset.test.mjs,docs/briefs"` → `Veredicto: OK_CON_ADVERTENCIAS` (12 rutas; `apps/api/server.js` y `docs/briefs` sin agente dueño explícito → `equipo-apexos`); los mismos cinco agentes, con `apexos-backend` y `apexos-seguridad` dueños del mapper y `apexos-frontend`/`apexos-qa` de los handlers y los contratos web. `origin/desarrollo` == `desarrollo` (`89ca1f5b`) al abrir el corte: sin `INTEGRAR_REMOTO`.
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
