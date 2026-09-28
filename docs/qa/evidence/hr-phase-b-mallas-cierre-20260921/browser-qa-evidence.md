# Evidencia de navegador QA — hr-phase-b-mallas-cierre-20260921

- Fecha: 2026-09-21
- Ejecutada por: APEXOS release owner (Edwin), asistido por MCP browser-use (Chromium)
- URL web QA: https://apexos-web-qa-production.up.railway.app/dashboard/talento-humano/rutas
- URL API QA: https://apexos-api-qa-production.up.railway.app (`/health` reporta commit desplegado `6c06412e89ad`, verificado antes y durante el recorrido)
- Build web desplegado: punta de develop `6c06412e89ad1dc978316a30d5f359e73d74c824` (merge de desarrollo con la Fase B + cierre del 409 MALLA_SOLAPADA)
- Sesión: admin temporal SCJ QA (usuario id 512, `qa.phaseb.1789999085131@scj.test`, rol APEX_ADMIN id 13, tenant `cbbf3627-4336-4f23-95c6-1077414bcd17`). Contraseña no persistida; usuario desactivado al terminar.

## 0. Paridad de bundle desplegado

El chunk servido por QA `2piyh6a2na8ju.js` contiene las cadenas del candidato: `hr/routes/prevalidate`, `Ya tiene malla`, `hr/routes/assignments`. Esto prueba que el navegador ejercita exactamente el código promocionado (prevalidación antes de escribir, aviso ámbar en el selector y consulta de asignaciones del día).

## 1. Aviso ámbar en el selector de personas (prevalidate + assignments)

Al abrir "Asignar horario" con fecha 2026-09-21, la fila de "Administrador SCJ QA" muestra la etiqueta ámbar `Ya tiene malla 08:00-17:00 en esta fecha`, derivada de GET `/api/v1/hr/routes/assignments` contra el conflicto real de QA (horario 74, 08:00-17:00, 27 personas, active). La fila de "QA Administrativo Uno" (QA-ADM-001) NO muestra aviso (correcto: sin malla ese día).

Captura: `qa-01-picker-ya-tiene-malla.png`.

## 2. Guardado bloqueado en el cliente (409 MALLA_SOLAPADA ya no llega a la API)

Con "Administrador SCJ QA" seleccionado (09:00-13:00, 2026-09-21), el envío ejecuta POST `/api/v1/hr/routes/prevalidate` y bloquea el guardado ANTES de cualquier POST `/api/v1/hr/routes`:

- Panel de validación: `Malla superpuesta: administrador scj qa ya tiene malla 08:00-17:00 el 2026-09-21 (horario 74). Quita esas personas del horario o ajusta las horas.`
- Banner rosa: `El horario no se guardo: hay personas con malla superpuesta en la misma fecha.`
- Diálogo permanece abierto para corregir.
- Registro de red: solo POST `/prevalidate`; cero POST `/hr/routes`.
- Prueba en base (solo lectura, PostgREST sobre el Postgres de la API QA): rutas del día = únicamente horario 74. Ninguna escritura nueva.

Este es el mismo escenario que en producción mostraba el 409 crudo `Ya existe una malla superpuesta para al menos una persona en la misma fecha.`: ahora el conflicto se explica con nombre, horario y fecha, y se corta en el cliente.

Captura: `qa-02-guardado-bloqueado-cliente.png`.

## 3. Control positivo (escritura válida sí persiste y se ve)

Tras deseleccionar a la persona en conflicto (chip "Administrador SCJ QA" removido; queda solo QA-ADM-001), envío 09:00-13:00 del 2026-09-21:

- POST `/api/v1/hr/routes/prevalidate` → 200 `{ok:true, dates:1, employees:1, created:1, omitted:0, results:[{date:"2026-09-21", status:"ready", conflicts:[]}]}`
- POST `/api/v1/hr/routes` → 200, crea TimeRoute id 302 (tenant SCJ QA, employees ["QA-ADM-001"], 09:00-13:00, tolerance 15, notas "Control de marcacion: gps / Sede administrativa: SEDE-PRINCIPAL")
- Banner verde: `Horario asignado correctamente.`
- Verificación en base: `rutas de hoy en QA: [{id:74, 08:00-17:00, active}, {id:302, 09:00-13:00, active}]` — el monitor lee lo que la API escribe.

Nota de transparencia: el diálogo conservaba el panel de issues obsoleto del envío bloqueado anterior y hubo que cerrarlo con "Entendido"; el banner de éxito y el POST 200 fueron capturados en vivo por el interceptor de red. Es un quirk cosmético de estado del panel, no una falla funcional (la escritura se creó y persistió).

Captura: `qa-03-control-positivo.png`.

## 4. Migración de datos en QA (novedad GPS_INACTIVO_SIN_SENAL)

Verificado en el Postgres de QA: `th_tipos_novedad` contiene 1 fila `GPS_INACTIVO_SIN_SENAL` para el tenant SCJ QA, aplicada automáticamente al arranque del servicio por la migración idempotente `20260921000000_gps_inactivo_sin_senal_novelty_type`.

## 5. Certificación NYVORA (empresa modelo) en QA

Ejecutada contra la API desplegada con `CERTIFICATION_EXPECTED_COMMIT=6c06412e89ad`: `qa-nyvora-hr-monitor.json` → ok=true, run_id 20260921085915, ruta dinámica 301, before event_count 0 → after punch_count 4 / activity_count 1 / evidence_count 1 / closed_count 1 / event_count 5, last_event_at 2026-09-21T22:00:00Z. Usuario de certificación 513 desactivado al terminar (`certification_user_deactivated: true`).

## 6. Limpieza (sin borrados)

- TimeRoute 302 → `status=inactive` (PATCH verificado, respuesta 200).
- Usuario temporal 512 → `active=false` (PATCH verificado, respuesta 200).
- Ruta 301 y sus marcaciones NYVORA quedan como artefacto de certificación, igual que en releases anteriores.
- Horario 74 (dato real preexistente de QA): intacto, sin modificaciones.

## 7. Consola y red

Sin errores silenciosos en consola durante el recorrido. Las únicas respuestas no-2xx del flujo fueron las deliberadas por los casos negativos, y en este recorrido el caso solapado ni siquiera alcanzó la API (bloqueo en cliente).
