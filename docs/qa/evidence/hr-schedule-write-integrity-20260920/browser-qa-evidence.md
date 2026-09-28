# Réplica funcional desde el navegador — QA (cierre del split-brain de horarios `hr-schedule-write-integrity-20260920`)

- **Fecha:** 2026-09-20/21 (corrida del fixture `20260921031726`, hora Bogotá)
- **Web QA:** https://apexos-web-qa-production.up.railway.app — pantalla `/dashboard/talento-humano/rutas` (Monitor de mallas horarias → *Asignar horario*)
- **API QA:** https://apexos-api-qa-production.up.railway.app — `/health` commit `7d6e8d1a3e6e`. Este release es **frontend-only** (`apps/web`); `apps/api` no se toca, por lo que el servicio API de QA **no se redespliega** y su commit desplegado sigue siendo idéntico al backend del tip de `develop`.
- **Build web QA:** el servicio web sí se reconstruyó con el candidato. CSS servido: `_next/static/chunks/2cfpwpkr55vhk.css`.
- **Fixture:** admin temporal `qa.hrw.web.20260921031726@scj.test` (`user_id` 509, rol `APEX_ADMIN`, tenant SCJ QA `cbbf3627-4336-4f23-95c6-1077414bcd17`), persona `QA Administrativo Uno` (QA-ADM-001), sede SEDE-PRINCIPAL, fecha 2026-09-20, tipo administrativo, GPS activo. Contraseña **no persistida; usuario desactivado al terminar**.
- **Navegador:** Chromium vía MCP browser-use, sesión admin real.

## Paridad del bundle servido (prueba de que se certificó el código desplegado, no el local)

El bundle servido por la web de QA contiene el arreglo de este release:

- Chunk `_next/static/chunks/1cd0m38ffetfm.js`: guard minificado `eo(e,t)` con el set de escrituras HR bloqueadas `["/api/v1/hr/gps/ping","/api/v1/hr/time-punches","/api/v1/hr/work-activities","/api/v1/hr/routes","/api/v1/hr/routes/bulk"]`, el regex `/^\/api\/v1\/hr\/routes\/[^/]+$/` y la condición `"GET"!==t&&(i.has(a)||r)` — es `shouldBlockHrWriteFallback` de `apps/web/lib/api.ts` compilado.
- Chunk `_next/static/chunks/3jdmo249igp4j.js`: banner con tono `` `rounded-md border p-4 text-sm font-medium ${"error"===ez?"border-rose-200 bg-rose-50 text-rose-900":"border-emerald-200 bg-emerald-50 text-emerald-900"}` `` y `role:"error"===ez?"alert":"status"` — es el nuevo estado `messageTone` de la pantalla de rutas compilado.

## Recorrido ejecutado

| # | Caso | Acción | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | **Negativo: jornada que cruza medianoche** | Asignar horario 20:35 → 05:00, persona QA-ADM-001, fecha 2026-09-20, y pulsar *Asignar horario* | El modal **no se cerró** y mostró el panel de validación: "Faltan datos para guardar \| Completa puntualmente lo siguiente: \| • La hora final debe ser estrictamente posterior a la hora inicial dentro de la misma fecha.". Red: **96 peticiones registradas, todas GET, cero POST** — el bloqueo ocurrió en el cliente (`scheduleSameDayShiftIssue`) antes de cualquier request. No se creó ningún registro. | Registro de red y snapshot de accesibilidad de la sesión MCP |
| 2 | **Control positivo** | Asignar horario 09:00 → 13:00, misma persona y fecha | Exactamente **un** `POST /api/v1/hr/routes` con status **200**. Banner verde `role="status"` con clases `border-emerald-200 bg-emerald-50 text-emerald-900` y texto "Horario asignado correctamente.", modal cerrado. En base: `TimeRoute` id **299**, `09:00-13:00`, `status=active`, `employees=["QA-ADM-001"]`. Visible en la lista del monitor como: `SEDE-PRINCIPAL \| 2026-09-20 · 09:00 - 13:00 \| Sin eventos \| QA Administrativo Uno \| 09:00 - 13:00 \| 1 persona(s) \| 0 evento(s) \| GPS \| 0 evidencia(s) \| Abrir \| Editar \| Clonar \| Jornada administrativa`. El monitor lee lo que la API escribe. | Registro de red, snapshot del monitor, consulta de solo lectura a `TimeRoute` |
| 3 | **Negativo: solapamiento (409 visible)** | Asignar horario 11:00 → 12:00, misma persona y fecha (solapa al caso 2) | `POST /api/v1/hr/routes` → **409**. Banner en **rosa** `role="alert"` con clases `border-rose-200 bg-rose-50 text-rose-900` y texto "Error 409 en /api/v1/hr/routes: Ya existe una malla superpuesta para al menos una persona en la misma fecha.", más el toast de plataforma "Fallo tecnico detectado ... Ruta: /api/v1/hr/routes \| Estado: 409 \| Detalle: Ya existe una malla superpuesta para al menos una persona en la misma fecha.". El modal quedó **abierto** para corregir. No se creó ningún registro. | Registro de red y snapshot de accesibilidad de la sesión MCP |

## Errores silenciosos

- **Consola:** un único mensaje de error en toda la sesión: el **409 deliberado** del paso 3. Cero errores silenciosos de aplicación; ningún fallo no surfaced.
- **Red:** caso 1 con 96 peticiones **todas GET, cero POST** (la escritura inválida nunca sale del cliente). Caso 2 con un único `POST /api/v1/hr/routes` **200**. Caso 3 con un único `POST /api/v1/hr/routes` **409** mostrado en banner rosa `role="alert"` y toast de plataforma. Antes del arreglo, ese 400/409 caía en silencio al respaldo Supabase y la pantalla pintaba "Horario asignado correctamente." en verde con el horario huérfano.
- **Tabla de consulta de horarios:** renderizó **exactamente 100 filas**, lo que confirma en vivo el tope `take: 100` de `listRoutes` cuando no se pasa rango de fechas (hallazgo abierto, **no bloqueante**, documentado en releases anteriores).

## Verificación de datos en QA (solo lectura, antes y después de los tres pasos)

Integridad del split-brain en la base QA — las tablas del respaldo Supabase no recibieron ninguna escritura:

| Métrica (solo lectura) | Antes | Después |
|---|---|---|
| Huérfanos en `public.operational_routes` con patrón `^HOR-\d{8}-[0-9A-F]{8}$` | 0 | 0 |
| Total `operational_routes` | 18 | 18 (semillas demo intactas; las más recientes de 2026-06-10 `PUEBLA-RUTA-*`) |
| Total `route_assignments` | 61 | 61 |
| Filas de `operational_routes` con `route_date` 2026-09-20 | 0 | 0 |

Es decir: ni el rechazo 400/409 (casos 1 y 3) ni el éxito 200 (caso 2) escribieron en las tablas del respaldo Supabase. La única escritura del recorrido fue `TimeRoute` 299 vía API operativa, que es la tabla que el monitor lee.

## Estado del fixture

Limpieza selectiva **ya ejecutada** (no se borró ningún registro, solo se desactivaron):

- `TimeRoute` 299 → `status=inactive` (1 fila).
- `User` `qa.hrw.web.%` → `active=false` (1 fila).
- Verificado tras la limpieza: 0 admins temporales activos, 0 huérfanos `HOR-*`, 18 `operational_routes`, 61 `route_assignments`.
- La contraseña del admin temporal **no se persiste en ninguna evidencia**; el usuario quedó desactivado al terminar.

El usuario de la certificación NYVORA (empresa modelo, `user_id` 510) también se desactivó al terminar; ver `qa-nyvora-hr-monitor.json`.
