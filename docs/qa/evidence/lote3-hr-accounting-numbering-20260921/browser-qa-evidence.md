# Evidencia de navegador QA — lote3-hr-accounting-numbering-20260921

- Fecha: 2026-09-21
- Ejecutada por: APEXOS release owner (Edwin), asistido por MCP browser-use (Chromium)
- URL web QA: https://apexos-web-qa-production.up.railway.app/dashboard/talento-humano/rutas
- URL API QA: https://apexos-api-qa-production.up.railway.app (`/health` reporta commit desplegado `2be1ce5aa0dd`, verificado antes y durante el recorrido)
- Build web desplegado: punta de develop `2be1ce5aa0dd725e73a067fa64c89e435406881d` (merge de desarrollo con el lote 3 de Talento Humano y la numeración atómica de contabilidad)
- Sesión: admin temporal SCJ QA (usuario id 516, `qa.lote3.browser.1790006383657@scj.test`, rol APEX_ADMIN id 13, tenant `cbbf3627-4336-4f23-95c6-1077414bcd17`). Contraseña no persistida; usuario desactivado al terminar.

## 0. Paridad de bundle desplegado

Se escanearon 14 chunks JS servidos por QA (`/_next/static/**.js` enlazados desde `/dashboard/talento-humano/rutas`) y los cuatro literales del candidato están presentes en el bundle desplegado:

- `horarios mas recientes del tenant` (aviso de lista de horarios recortada)
- `El mapa del dia esta truncado` (aviso de mapa recortado)
- `amplia ping_limit/punch_limit/activity_limit` (hint del mapa)
- `El resumen de eventos cubre solo las rutas mas recientes` (hint por defecto de resúmenes)

Esto prueba que el navegador ejercita exactamente el código promocionado (señales visibles de truncamiento del lote 3).

## 1. Banner ámbar de truncamiento EN VIVO (rutas)

Con datos reales de QA (SCJ QA tiene 109 horarios, de los cuales 100 entran en la ventana del resumen de eventos), la página `/dashboard/talento-humano/rutas` pinta el banner ámbar de truncamiento derivado de `GET /api/v1/hr/routes/event-summaries`:

- Texto renderizado: `El resumen cubre las 100 rutas mas recientes; acota el rango de fechas en el listado de horarios para revisar rutas antiguas.`
- Contenedor: `div[role="status"]` con clases `border-amber-300 bg-amber-50 text-amber-900` (paleta ámbar, no de éxito).
- El banner aparece tras la carga asíncrona de `event-summaries` (montaje y refresco de 5s) y permanece mientras `truncation.truncated === true`.

Captura: `qa-01-banner-truncamiento-rutas.png`.

Este es el defecto que el lote 3 cierra: antes, el mismo recorte de 100 resúmenes se mostraba como un día completo sin advertir que faltaban rutas antiguas.

## 2. Red: topes de lectura del lote 3 en el cliente desplegado

Registro de red del recorrido (fetch/XHR, todas 200):

- `GET /api/v1/hr/routes?limit=500` — el cliente usa el nuevo tope `ROUTES_LIST_LIMIT=500` (antes pedía sin tope efectivo y recortaba en silencio).
- `GET /api/v1/hr/routes/event-summaries` — devuelve el bloque `truncation` (`{truncated:true, limit:100, returned:100, hint}`) que alimenta el banner ámbar.
- Refresco periódico de 5s de ambos endpoints sin errores ni respuestas no-2xx no deliberadas.

## 3. Contrato de truncamiento verificado por HTTP autenticado (solo lectura)

Con token de admin temporal SCJ QA contra la API desplegada:

- `GET /api/v1/hr/routes/event-summaries?date=2026-09-21` → 200, `truncation = {truncated:true, limit:100, returned:100, hint:"El resumen cubre las 100 rutas mas recientes; acota el rango de fechas en el listado de horarios para revisar rutas antiguas."}`, claves de nivel superior `[generated_at, routes, truncation]`.
- `GET /api/v1/hr/operations-map?date=2026-09-21` → 200, bloque `truncation = {truncated:false, collections:[], hint:""}` presente (hoy SCJ QA tiene 2 rutas, bajo los límites de ping/punch/actividad, por lo que NO hay recorte y el banner del mapa correctamente NO se muestra).
- `GET /api/v1/hr/routes?limit=9999&date=2026-09-21` → 200, sin error: el servidor acepta y acota el límite (clamp `[50,500]`), devolviendo las 2 rutas del día.
- `GET /api/v1/hr/routes?limit=500&start_date=2026-01-01&end_date=2026-12-31` → 200, devuelve las 109 rutas del rango (el tope 500 se respeta y no recorta por debajo).

## 4. Página mapa sin regresión y sin banner falso

`/dashboard/talento-humano/mapa` renderiza correctamente el control operativo GPS (2 rutas, 27 equipo, 0 en línea, 25 sin GPS, mapa de mosaicos cargado, "Rastreo en vivo activo"). No aparece banner ámbar de truncamiento porque `operations.truncation.truncated === false` hoy: la señal es condicional y no produce falsos positivos.

Captura: `qa-02-mapa-sin-regresion.png`.

## 5. Certificación NYVORA (empresa modelo) en QA

Ejecutada contra la API desplegada con `CERTIFICATION_EXPECTED_COMMIT=2be1ce5aa0dd`: `qa-nyvora-hr-monitor.json` → ok=true, run_id 20260921105218, ruta dinámica 303, before event_count 0 → after punch_count 4 / activity_count 1 / evidence_count 1 / closed_count 1 / event_count 5, last_event_at 2026-09-21T22:00:00Z. Usuario de certificación desactivado al terminar (`certification_user_deactivated: true`).

## 6. Contabilidad (numeración EM): nivel de prueba declarado

El incidente de numeración EM (read-modify-write del `accounting_numbering` completo que revierte `next_number` y causa P2002/409 determinista) se certifica de forma autoritativa en LOCAL con el script versionado `scripts/certifications/accounting-numbering-integrity-local.js` (16 controles, simulación fiel del incidente con fake-tx + candado advisory + formato legado) y 6 pruebas unitarias (`apps/api/test/accounting-numbering.test.js`). En QA NO se crearon entradas de mercancía: son escrituras contables difíciles de revertir en el tenant demo compartido. La verificación QA de contabilidad se limita a confirmar que el build desplegado sirve la lógica corregida (paridad de código) y que la reserva auto-reparable `max(configurado, MAX(document_number)+1)` bajo candado advisory elimina la colisión determinista; el tenant SCJ QA no tiene configuración `accounting_numbering` (el incidente era del tenant demo local), por lo que no hay estado QA que migrar.

## 7. Limpieza (sin borrados)

- Usuario temporal 515 (sonda HTTP) → `active=false`.
- Usuario temporal 516 (sesión de navegador) → `active=false`.
- Ruta 303 y sus marcaciones NYVORA quedan como artefacto de certificación, igual que rutas 301/288/300 de releases anteriores.
- Ningún horario, marcación ni documento contable preexistente de QA fue modificado.

## 8. Consola y red

Sin errores silenciosos en consola durante el recorrido. Las únicas respuestas no-2xx ausentes: el recorrido de este release es de lectura (el lote 3 cambia topes y señales de lectura, no escrituras), por lo que no se ejercitaron casos de escritura en QA; los casos de escritura de horarios siguen cubiertos por la certificación del release anterior y por las certificaciones LOCAL versionadas.
