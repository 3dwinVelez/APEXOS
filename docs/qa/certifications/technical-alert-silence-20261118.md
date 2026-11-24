# Certificación — el fallo técnico no es ventana (`technical-alert-silence-20261118`)

- **Empresa / alcance**: toda la superficie web de APEXOS; el registro del fallo sigue en `platform_logs`.
- **Promesa certificada**: con la API caída, estrellada o sin señal, el cliente **no ve ninguna ventana emergente técnica**; la pantalla queda viva en estado de dato y el fallo se registra. El detalle técnico solo aparece si el usuario activa el modo diagnóstico.
- **Candidato certificado**: reconstrucción puntual del commit `0b1ba6f8` de `desarrollo` sobre `origin/develop` `5fcc2ed1` (31 rutas de inventario).
- **Ventana de la corrida**: 2026-11-18 23:02–23:05 (hora local), `started_at` 2026-11-19T04:02:14Z en la evidencia.

## 1. Sustrato de la corrida

| Dato | Valor medido |
|---|---|
| Frontend servido por | `next start` (producción), **no** `next dev` |
| `BUILD_ID` | `jlUjFSh09mNnfsi-6VJw3` (`next build` con `NEXT_PUBLIC_API_URL=http://127.0.0.1:3000`) |
| Compilación / tipos | Turbopack compila en 98 s; TypeScript del proyecto termina sin errores en 88 s |
| Certificador | `scripts/certifications/technical-alert-silence-browser-local.js` |
| Duración de la corrida | 202 s |
| Veredicto | **68 de 68 controles en verde** |
| La misma suite sobre `desarrollo` | Corrida previa, `BUILD_ID` `3SEjWup4mZZxmkknqhAzd`, también 68/68, archivada en `docs/qa/evidence/technical-alert-silence-20261118/certification.json` de esa rama. Es la misma medición sobre el árbol original; no se sobrescribe: las dos corridas quedan en el repositorio |

## 2. Cómo se fabrica la tormenta (y por qué la ausencia significa algo)

La corrida no espera a que la API falle: **provoca** el fallo con intercepción de peticiones por visita y con cabeceras CORS correctas (responder sin CORS mata cada llamada en el preflight y la pantalla pinta el guard de acceso, no la capa de alertas):

| Escenario | Inyección | Medición real |
|---|---|---|
| `tormenta_500` | `ERROR_INTERNO` en cada `/api/v1/*` | 7 rutas fallidas en `rutas`, 1 en `mapa`, 5 en `servicios`, 1 en `monitoreo`; **14** posts de telemetría en tema claro y **28** en tema oscuro; 0 tarjetas |
| `tormenta_429` | `RATE_LIMIT_EXCEEDED` en cada `/api/v1/*` | 0 tarjetas en las 4 pantallas; el bloqueo por cuota no se anuncia |
| `red_cortada` | `request.abort()` (sin señal) | 14 peticiones abortadas medidas; 0 tarjetas |
| `diagnostico_activado` | misma tormenta 500 con `apexos_diagnostics = "1"` | peak de **5** tarjetas con su texto técnico (`Ruta: /api/v1/hr/employees?active=true \| Estado: 500 \| Detalle: Error interno del servidor`) |
| `sesion_vencida` | 401 en `/auth/me` + 500 en el resto | aviso legible en el login, sin ventana |

Telemetría acumulada de la corrida completa: **74** posts a `/api/v1/admin/platform-logs/client`. Errores de página (`page_errors`): **0**. Los `console_errors` registrados son exclusivamente las 500 y las `ERR_FAILED` inyectadas, más el websocket de colaboración que apunta al API local (`ws://127.0.0.1:3000/collaboration/live`, conexión rechazada porque en la corrida no hay API en ese puerto): ruido del ambiente de medición, no excepciones del cliente.

Cada visita de la tormenta 500 trae tres autocontroles por pantalla y tema (`scripts/certifications/technical-alert-silence-browser-local.js:294-298`), y el control falla si el arnés miente:

- `<pantalla>_<tema>_arnes_con_tormenta_real`: exige `dataRequests > 0`. Si la pantalla nunca pidió datos, la ausencia de ventanas no acredita nada. La única excepción declarada en el propio catálogo es el lobby `home`, marcado `static: true` porque se arma con los maestros ya guardados en almacenamiento local: mide 0 solicitudes y pasa por esa condición explícita, no por un indulto del reporte.
- `<pantalla>_<tema>_pantalla_sigue_viva`: exige `surface.mounted`, es decir un marcador del texto interior real (*Asignar horarios*, *CONTROL OPERATIVO GPS*, *Órdenes listas para gestionar*, *Mis módulos*), no el cascarón del shell.
- `<pantalla>_<tema>_sin_guard_de_acceso`: `!surface.denied` — la medición no vale si lo que se pintó fue el guard de «Acceso no autorizado» en lugar de la capa de alertas.

Los cuatro escenarios sin tema (`red_cortada`, `429`) se certifican con `<pantalla>_corte_de_red_sin_tarjeta` y `<pantalla>_429_sin_tarjeta` sobre 4 pantallas; la señal de que la inyección llegó está en `runtime.aborted_requests` (14 abortos) y en el cuerpo 429 devuelto. La descomposición de los 68 controles es 50 + 1 + 4 + 4 + 3 + 3 + 3, donde 1 es `los_fallos_quedan_en_platform_logs`, 3 son de sesión vencida, 3 del modo diagnóstico y 3 de contrato del canal.

## 3. Lo que se midió pantalla por pantalla

Cinco pantallas (`rutas`, `mapa`, `servicios`, `monitoreo`, lobby `home`) sobre las que se mide la tormenta 500 en tema claro y en tema oscuro; las cuatro primeras se repiten además con corte de red y con 429. A eso se suman la sesión vencida, el modo diagnóstico y el contrato del canal de eventos:

- Tarjetas flotantes de fallo técnico (`.platform-alert`): **0 en todas las visitas**, con el vocabulario técnico buscado en el texto pintado (`Fallo técnico detectado`, `Ruta: /api/v1…`, `Estado: 500`, `ERROR_INTERNO`, `"error":`, `request_id`, `Failed to fetch`, `API no disponible`).
- El fallo **sí** sale del navegador: los posts a `/api/v1/admin/platform-logs/client` se cuentan por visita (14 y 28) mientras la vista queda limpia.
- Modo diagnóstico (`localStorage.apexos_diagnostics = "1"`): con la misma tormenta, el peak medido fue de **5 tarjetas**, que es el presupuesto de 5 por minuto; 9 s de autocierre. Sin la bandera, el canal `apex:alert` está retirado del producto y ninguna tarjeta aparece.
- Cierre de sesión por inactividad: el login muestra «Tu sesión terminó por inactividad…», no una ventana.
- Evidencia fechada en `docs/qa/evidence/technical-alert-silence-20261118/` (`certification.json` + 13 capturas, incluyendo `06-sesion-vencida.png`, `07-login-aviso-sesion.png`, `08-modo-diagnostico.png`). El log de `next start` queda fuera del repositorio por política de artefactos.

## 4. Suites y soporte sobre el árbol del candidato

| Control | Resultado |
|---|---|
| Contratos del cambio (`technical-alert-silence.test.mjs` 9 + `hr-monitor-refresh.test.mjs` 5) | 14 de 14 en verde |
| Suite web completa, archivo por archivo (111 archivos, `node --test apps/web/test/*.test.mjs`) | 822 pruebas: **821 pasan, 1 falla** (`suite-web.txt`) |
| Fallo único | `command-palette-module-functions.test.mjs`: `/dashboard/contabilidad/pyg/ampliado` no tiene entrada en el centro de comandos. **Preexistente en develop**: la misma prueba, con el mismo mensaje, falla en el baseline `5fcc2ed1` (verificado en un árbol limpio de origin/develop). Ninguna ruta del inventario toca el centro de comandos ni PYG. |
| Lint de `apps/web` | 22 avisos (img/ARIA/`window.location`), **0 errores** |
| Typecheck de `apps/web` (`tsc -p tsconfig.typecheck.json --noEmit`) | `TYPECHECK_EXIT=0` |
| Autovalidación de la compuerta de alcance (`test:promotion-scope`) | 4 de 4 |
| Autovalidación de la compuerta pre-QA (`test:preqa-evidence`) | 3 de 3 |
| Build de producción | 140 páginas estáticas generadas en 11.8 s |

Todo lo anterior está en `soporte.txt` y `suite-web.txt`, sanitizados (sin rutas absolutas de la máquina).

## 5. Equivalencia y reconstrucción

- `equivalencia-candidato.txt`: 29 de 31 rutas son byte a byte idénticas al commit certificado en `desarrollo`. Las dos distintas son `package.json` y `.gitignore`, donde los mismos hunks se re-aplicaron sobre la versión propia de develop.
- La capa de contexto vivo (`agents/registry.json`, `agents/*/SKILL.md`, `.qoder/skills/**`) **no viaja** al candidato: esa estructura no existe en develop ni en main y su fuente de versión es `desarrollo`. Traerla sería un cambio generacional de gobernanza, no parte de este objetivo.

## 6. Deuda medida y explícitamente fuera de este alcance

1. **Ventanas nativas de validación de formulario** en Talento Humano → Empleados: 8 `window.alert`. Siete son mensajes estáticos de elegibilidad del formulario y uno (`resolvedOrganization.error`) sale de `organizationSelection`, que es validación client-side de sucursal/sociedad/centro de costo. **Ninguno muestra un fallo de la API**, así que no contradicen la promesa certificada; quedan como deuda de UX aparte.
2. **Fase 3 (backend/API)**: mapeo `P2024`/`P2028`/`57014` a código funcional, presupuesto de reintento contra `statement_timeout`, límite por tenant, evidencia en base64 dentro de lecturas pesadas y handlers `app/api/**` que filtran `Supabase ${status}: ${detail}`. El enmudecimiento del cliente **no** arregla ninguna de esas causas; solo deja de gritarlas.
3. **Telemetría sin sesión**: `/api/v1/admin/platform-logs/client` exige `request.user`, así que el fallo de un usuario deslogueado no deja registro. Se mide en la corrida de QA y se reporta como está, sin maquillarlo.
4. **Fallback silencioso de Supabase** en el cliente web (deuda de la Fase 4).

## 7. QA: la columna del antes (control positivo del arnés)

`scripts/certifications/technical-alert-silence-browser-qa.js` corre la misma promesa contra el ambiente desplegado, con sesión real en el navegador y usuarios efímeros desactivados al terminar: `NYVORA / Administrador de empresa`, `NYVORA / Empleado` y, para el control de aislamiento, `Diana vargas / Analista contable` — una empresa real distinta, no un fixture `QA-*`. El dominio del correo es neutro (`@silence-qa.test`) porque con `@nyvora.test` la cabecera del shell contaminaba la prueba de aislamiento: el arnés estaba midiendo su propio andamio.

Medición del **antes** sobre lo que QA ya servía (`develop 5fcc2ed16eae`, sin el arreglo), en `docs/qa/evidence/technical-alert-silence-20261118/qa-antes/certification.json`:

| Control | Resultado |
|---|---|
| Veredicto | **141 de 163**, 22 fallos, `EXIT=1` |
| Ventanas técnicas (`sin_tarjetas`, `feliz`, `rbac_sin_ventana`) | **20 fallos**: la promesa se incumple tal como la reportó el usuario. Incluye el **camino feliz sin ninguna inyección**: un `Empleado` de NYVORA que abre *Talento Humano → Rutas* ve 2 tarjetas producidas por `403` legítimos (`/api/v1/transport/vehicles`, `/api/v1/admin/user-master-data`) |
| Bundle desplegado | `apex:alert` presente en `/_next/static/chunks/12j80hwi6xw6n.js` y `apex:diagnostic` ausente en los 10 chunks publicados (629,048 bytes leídos): **2 fallos** que prueban que QA sirve el artefacto anterior, no una promesa de código |
| Registro del fallo | 89 intentos de telemetría desde el navegador, **86 registrados con 2xx** (83×200, 3×204) |
| Sonda sin token | `401` en `/api/v1/admin/platform-logs/client` → la deuda declarada del punto 6.3 queda medida, no maquillada |
| Autocontroles por rol | `tormenta_real` exigida solo donde el rol dispara peticiones; la pantalla negada por RBAC se certifica como `guard_honesto_sin_ventana`. Con esta semántica, ningún fallo queda atribuido a la prueba mal planteada |

La columna del **después** se corre con el certificador idéntico sobre el candidato desplegado en QA y debe cerrar 163/163: los 20 fallos de ventana y los 2 de bundle son exactamente lo que este cambio tiene que voltear.

**Cumplida el 2026-11-19 sobre `develop 5ff1440f` desplegado: 163 de 163, `EXIT=0`**, con el mismo arnés y los mismos 163 controles. La columna, su ventana de corrida y la sonda del bundle publicado están versionadas en `docs/qa/evidence/technical-alert-silence-20261118/qa-despues/certification.json` y narradas en `docs/qa/certifications/technical-alert-silence-main-20261119.md`, que es la nota de la pierna `develop → main`. Esta sección no se reescribe: conserva la medición del antes tal como se tomó.

## 8. Qué se conserva como evidencia

`docs/qa/evidence/technical-alert-silence-20261118/`: `certification.json` + 13 capturas de la corrida local, `qa-antes/certification.json` y su captura final, `qa-despues/certification.json` y su captura final, `suite-web.txt`, `soporte.txt` y `equivalencia-candidato.txt`. La pierna `develop → main` agrega `main-20261119/`: `suite-web-main.txt`, `equivalencia-blob-main-develop.txt`, `compuertas-main.txt` (las tres compuertas y la igualdad exacta inventario↔diff) y `despliegue-producto-main.txt` (sonda del artefacto servido en Producción y `/health.commit`). Los `*.log` brutos (`next start`, corridas) quedan fuera del repositorio por la regla de artefactos generados.

