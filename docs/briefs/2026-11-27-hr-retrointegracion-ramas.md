# Brief — Retrointegración del módulo de Talento Humano desde develop

- **ID**: `2026-11-27-hr-retrointegracion-ramas`
- **Fecha**: `2026-11-27`
- **Rama activa**: `desarrollo` (punta `536c72bb`, igual a `origin/desarrollo` al abrir el preflight)
- **Prompt crudo**: "veo que no todos los cambios fueron migrados hacia talento humano desde develop, faltan funciones, campos entre otras herramientas ?" · "ten en cuenta dejar para produccion provicionalmente la aplicacion de maracion mediante la web los demas cambios deben migrar de manera completa y sana" · "verfica todo al finalziar debe quedar todo respaldado y funcionando de manera correcta sin elminar de produccion la aplicaicon de marcacion lo demas debe quedar alineado en todos los ambientes"

## 1. Objetivo

Dejar a `desarrollo` con el mismo Talento Humano que ya sirve `develop` (bancos, liquidación de retiro, revisión por día, ajustes manuales, nómina rediseñada, reportes con columnas de tiempo) **sin perder ninguna capacidad certificada que solo vive en `desarrollo`**, y sin tocar un registro de cliente. La pantalla de marcación web sigue existiendo y sigue accesible desde el hub.

## 2. Alcance exacto

106 rutas contra la baseline `536c72bb`: 74 altas, 32 modificaciones, +5.613 −728. El inventario ruta por ruta está en `docs/qa/evidence/hr-alineacion-20261127/divergencias.txt` y en `paridad.json`. Frente por frente:

| Estado | Frente | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/hr/banks.js`, `davivienda-file.js`, `payrollReceiptPdf.js`, `payrollPeriod.js`, `dayReview.js`, `termination*.js` (4), `contractFoundationRepair.js`, `contractCalendarDate.js`, `accumulatedOrdinaryTime.js`, `adjustmentCalendarConcept.js` | Maestro de bancos, archivo Davivienda, PDF de desprendible, periodos, revisión por día, liquidación de retiro y tiempo ordinario acumulado |
| `M` | `apps/api/src/modules/hr/{routes,schema,service}.js` | Registro de endpoints y esquemas de los módulos anteriores |
| `A` | `apps/web/app/dashboard/talento-humano/bancos/page.tsx`, `nomina/payroll.module.css`, `components/hr/{HrWorkspace,TerminationDayReviews,TerminationManualAdjustments}.tsx` + 2 css | Pantalla de bancos y el rediseño de nómina y retiro |
| `M` | `apps/web/app/dashboard/talento-humano/{aportes-sociales,configuracion-laboral,libranzas,liquidacion-trabajador,nomina,prestaciones-pagos,provisiones}/page.tsx` | Columnas, catálogos y flujos del rediseño |
| `M` | `apps/web/app/dashboard/talento-humano/page.tsx` | Hub fusionado: entra **Maestro de bancos**, `Horarios y mallas` apunta a `/rutas` y **Marcaciones sigue visible** |
| `M` | `apps/web/app/dashboard/talento-humano/reportes/page.tsx` | Fusiona: columnas de tiempo de develop + frente de corrección administrativa y degradación de evidencia de desarrollo |
| `M` | `apps/web/app/dashboard/talento-humano/empleados/page.tsx` | Blob de develop + recupera el cierre de vigencia en línea y el panel biométrico de dos clics |
| `M` | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` | Se queda la versión de desarrollo (tolerancia de foto) + el selfie ligado al paso de develop |
| `M` | `apps/web/app/dashboard/talento-humano/mapa/page.tsx` | Blob de develop sin la línea que pintaba la evidencia en base64 dentro del detalle |
| `M` | `apps/web/lib/{hrAttendanceState,hrTimeReport,payroll-period,payrollDisplay,hrScheduleMonitor,moduleFunctions,reportExports}.ts` | Librerías del rediseño y catálogo de funciones del módulo |
| `A`/`M` | `apps/api/test/hr-*.test.js` (11), `apps/web/test/hr-*.test.mjs` (11), `scripts/certifications/hr-*-local.js` (14), `docs/qa/certifications/hr-*.md` (15) | Pruebas e instrumentos del trabajo de develop |
| `M` | `apps/web/components/shell/MobileNav.tsx` | Vuelve a la versión de producción: cinco casillas y la de Marcar sigue |

### Módulos (`change_intent.modules`)

- `talento-humano`
- `plataforma-shell`

### Borrados autorizados (`allowed_deletions`)

- ninguno. Ninguna ruta del árbol integrado elimina un archivo: las 728 supresiones son líneas dentro de rutas modificadas, auditadas una por una.

## 3. Fuera de alcance

- Promociones. Esto solo toca `desarrollo`; `develop` y `main` no se mueven aquí.
- Migraciones en la nube, Railway, Supabase, secretos ni infraestructura.
- El frente biométrico (WebAuthn, rostros, dispositivos) no se lleva a Producción en esta intervención: son 14 endpoints y 3 tablas que exigen migración autorizada.
- Las ventanillas nativas que ya existían (sección 9).
- `apps/control-tower/**`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: no se tocó `apps/api/prisma/**` ni una sola escritura de cliente.
- Sin secretos ni credenciales en el brief ni en el diff.
- **No aplicar los borrados de develop**: `develop` elimina 155 rutas de módulos que viven legítimamente solo en `desarrollo`. Por eso la retrointegración se hizo por blob y por ruta, nunca con `merge`.

## 5. Criterios de aceptación

1. `node --test apps/web/test/*.test.mjs` → 948 pruebas, 943 pasan; los 5 rojos son los mismos que ya caen en la baseline prístina y pertenecen a Servicios/Contable.
2. `node --test apps/api/test/hr-*.test.js` → 413 pruebas, 409 pasan; los 4 rojos son los mismos nombres que caen en la baseline (361/357), con 52 pruebas de API más que `desarrollo` traía.
3. `tsc --noEmit` en `apps/web` → salida 0.
4. Comparación por blob contra `origin/develop` en las 169 rutas del módulo → 158 idénticas y 11 divergentes, cada divergencia explicada y aditiva.
5. `grep` de `window.alert|window.confirm|window.prompt` en `empleados/page.tsx` → cero coincidencias, y el control biométrico se pone rojo si se reintroduce.
6. El hub de Talento Humano sigue listando `Marcaciones` (`/dashboard/talento-humano/marcacion`) y la navegación móvil conserva su casilla.

## 6. Evidencia y certificación exigida

- Artefacto: `docs/qa/evidence/hr-alineacion-20261127/paridad.json` con `divergencias.txt`, `rojos-web.txt`, `rojos-api.txt`, `rojos-api-base.txt`.
- Certificación escrita: `docs/qa/certifications/hr-retrointegracion-20261127.md`.
- `certification_status` esperado: `local_passed_qa_pending`. Sin corrida de navegador contra ambiente desplegado no se puede proponer promoción.

## 7. Capacidades protegidas

- **Corrección administrativa de marcación desde Reportes** — sobrevive fusionada; `test/hr-marking-correction.test.mjs` en verde.
- **Degradación de evidencia fotográfica** (la foto en formato ilegible no cuesta la jornada) — queda en Reportes y en Marcación; `hr-marking-lateness-selfie.test.mjs` con control de mutación.
- **Compuerta de escrituras self-service contra el respaldo Supabase** — `hr-offline-marking.test.mjs` punto D, puesto al día sin aflojar el control.
- **Marcación web** — enlace del hub, casilla móvil y pantalla intactos.
- **Enmudecimiento de ventanas técnicas en Empleados** — recuperado del revert de develop.

## 8. Riesgos y rollback

- Riesgo: fusionar a mano una pantalla de 1.300 líneas → Mitigación: el puerto es aditivo (170 inserciones, 4 líneas reescritas) y se audito una por una las lineas quitadas. Rollback: `git revert` del commit de integración en `desarrollo`, nunca snapshot antiguo.
- Riesgo: creer que `desarrollo` ya tenía todo → Medido: 4 frentes certificados estaban revertidos en `develop` y llegaron aquí; se documentan en la certificación.
- Riesgo: marcar esto como listo para Producción → No lo está: falta la corrida de navegador y el manifiesto de alcance contra la punta de `develop`.

## 9. Supuestos y preguntas abiertas

- Supuesto: "alineado en todos los ambientes" se cumple llevando el trabajo de `develop` a `desarrollo` primero; la promoción sigue necesitando autorización expresa.
- Hallazgo: `develop` —y por tanto Producción— corre código revertido de trabajos certificados: telemetría y clasificación de fallos del cliente, identidad de instalación, la línea de evidencia en base64 del mapa y dos ventanillas nativas en Empleados. Tres de los cuatro quedan corregidos en `desarrollo` con esta intervención; la declaración pública va en la certificación.
- Pendiente: 7 `confirm(` sin prefijo en nomina, rostros, liquidación, dispositivos y aportes — preexistentes en las dos ramas, con su propio brief.

## 10. Autorizaciones requeridas

- Ninguna adicional para cerrar `desarrollo` (el push acotado ya está concedido en AGENTS.md).
- Para `desarrollo -> develop` y `develop -> main`: autorización expresa + manifiesto de alcance `scope_schema_version: 2` + `qa:promotion:scope` + `qa:preqa:evidence` / `qa:approval:evidence`.
- Para el frente biométrico en Producción: autorización de migración remota de `hr_face_enrollments`, `hr_shared_devices`, `hr_webauthn_credentials`.

## 11. Documentación, agentes y publicación (obligatoria)

- Agentes dueños según `agents:preflight`: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- Control nuevo versionado: la paridad de un módulo entre ramas se demuestra **por blob y por línea sin réplica**, no por ancestría de commits; y una retrointegración que toma blobs de otra rama debe comparar identificadores exclusivos del destino antes de cerrar.
- Publicación: `git push origin desarrollo` al cierre, con suites y evidencia en verde.
