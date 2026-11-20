# Brief — Marcación resiliente: la jornada no se pierde por la foto, por la cola ni por el silencio del rechazo

- **ID**: `2026-11-19-marcacion-evidencia-resiliente`
- **Fecha**: `2026-11-19`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "primero necesito desbloquear a los usuarios y garantizar que puedan marcar de manera acertada, procede a diseñar el plan de intervencion para etos casos y llevalo hasta el main de manera certificada donde garanticemos sueprar estos errores"

## 0. Medición previa (sin esto el plan es opinión)

Instrumento versionado y de solo lectura: `scripts/certifications/hr-marking-blocked-workers.js`
(su `--selftest` cubre las dos formas de argumento, la ventana de jornada colombiana UTC-5 y un rojo
provocado). Evidencia: `docs/qa/evidence/hr-marca-evidence-resilience-20261119/bloqueados-produccion-20261119.json`.
Ventana leída: 8 jornadas, del `2026-11-12T05:00Z` al `2026-11-20T05:00Z`, ambiente `production`
(host `aws-1-sa-east-1.pooler.supabase.com`), `escrituras: 0`.

Las cifras de esta sección son la lectura versionada (`leido_en: 2026-11-19T22:38:16Z`, 17:38 de Colombia).
La primera lectura —09:15 de Colombia, el día con **17 entradas y ninguna marcación posterior**— es la que
abrió el diagnóstico; los conteos crecen mientras el incidente sigue abierto, así que el artefacto se vuelve
a medir antes de citar una cifra. El artefacto se genera con `--sin-nombres`: en este tenant el `code` del
empleado y el correo guardan el nombre legal, y un registro laboral identificado no pertenece al repositorio.
Lo versionado son los `user_id`/`empleado_id`, que es con lo que el supervisor resuelve la ficha en la app.

Denominador operativo: **20 trabajadores** marcaron en la ventana; un día normal deja **56-75 marcaciones
de 16-19 trabajadores**. El 19-11-2026, a las 17:38 de Colombia, el día cerró en **32 marcaciones de 17
trabajadores** (17 entradas, 9 inicios de almuerzo, 4 fines de almuerzo, 2 salidas): la mañana nunca se cerró.

| Hecho medido | Volumen | Alcance |
|---|---|---|
| Registros leídos en la ventana | 1.286 | 1.069 `error/frontend` (21 usuarios), 145 `warning/backend` (19), 72 `warning/api` (2) |
| `"Backend no disponible desde frontend"` | 995 | 13 rutas distintas del mismo cliente. Causa cruda: 495 abandonos propios por tiempo (20 s), 317 `"Load failed"` (Safari iOS), 183 `"Failed to fetch"` |
| `MARCACION_FUERA_DE_SECUENCIA` (409) | 39 | 14 trabajadores |
| `MARCACION_DIFERIDA_EXPIRADA` (409, tope 24 h) | 20 | 9 trabajadores, todos a hora de entrada o salida de turno |
| Rechazos de formato de selfie (400) | 28 | 1 trabajador (user 231): 12 con frase `"El contenido del archivo no coincide con el formato declarado."` y 16 sin detalle |
| `SELFIE_REQUERIDA` (400) | 13 | 5 trabajadores |
| `IDEMPOTENCY_KEY_CONFLICT` (409) | 12 | 1 trabajador (emp 487), sin registro hoy |
| Jornadas de empresa operada sin registro del trabajador afectado | 18 | 12 de ellas sobre 9 trabajadores reales (excluye cuenta de soporte y `NyvoraDemo`) |

Lectura de la causa, en orden de consecuencia y no de volumen:

1. **El rechazo de formato no pierde una foto: pierde la jornada completa.** El user 231 (su `empleado_id`
   está en el artefacto versionado de esta carpeta; el nombre no se versiona) fue rechazado hoy entre las
   08:55 y las 08:59 de Colombia con
   `"El contenido del archivo no coincide con el formato declarado."`. Como su `entrada` nunca existió,
   todo lo demás que intentó pasó a ser `MARCACION_FUERA_DE_SECUENCIA`. La espiral es: la compuerta de
   evidencia mata el primer golpe del día y el control de secuencia mata los siguientes. Sin entrada, el
   operario ya no puede auto-registrarse y el día queda en manos de una corrección administrativa que
   **hoy no tiene pantalla**.
2. **La cola no tiene en cuenta el reloj del día.** Las 20 expiraciones caen a hora de inicio o fin de
   turno: la marcación se encoló, el dispositivo volvió al día siguiente y el servidor la rechazó por
   superar 24 h (`apps/api/src/modules/hr/service.js:862`). El cliente deja el elemento como
   "por enviar" y el trabajador cree que marcó.
3. **El canal del cliente no trae el código del servidor.** Los 42 `409` y 21 `400` que reporta el
   navegador llegan con `code=""`; solo sobrevive la frase humana. Un 409 de secuencia y un 409 de
   idempotencia son indistinguibles en el registro, que es exactamente el motivo por el que este
   diagnóstico costó dos mediciones.
4. **La mitad de los "fallos de backend" somos nosotros.** 495 de 995 son abandonos de petición
   provocados por nuestro propio techo de 20 s (`apps/web/lib/api.ts:11`), reintentados cada 12 s por
   `setInterval` mientras la pantalla dispara ~7 lecturas paralelas. La brecha medida entre fallos
   consecutivos del mismo usuario y ruta tiene su mediana en 9,2 s: es el intervalo, no la infraestructura.
   No hay ninguna ventana de 5 s con 3 o más usuarios distintos afectados, es decir, **no hubo caída
   de plataforma**; hay amplificación por dispositivo.
5. **El tráfico de marcación no pasa por el proxy que sí funciona.** `NEXT_PUBLIC_API_URL` se hornea en
   el build (`apps/web/lib/apiBaseUrl.ts:15`) y apunta directo al origen de la API, con prefijo CORS
   de por medio, mientras `apps/web/app/api/v1/[...path]/route.ts` responde en 0,40 s.

## 1. Objetivo

Que ningún trabajador pierda una jornada por el formato de la selfie, por el estado de la red o por el
reloj de la cola, y que todo rechazo que subsista llegue al supervisor y al registro con un código
legible por máquina. En concreto: la marcación de tiempo se guarda siempre (con evidencia degradada y
marcada como tal cuando el archivo no sirve), la cola expirada se cierra con una acción en lugar de
quedarse "por enviar", y el desbloqueo administrativo existe en la web.

## 2. Alcance exacto

Inventario planeado. El manifiesto de alcance de la promoción se genera del diff neto real al certificar
(`scope_schema_version: 2`, entrada `A`/`M`/`D` por archivo); esta tabla es el compromiso de diseño.

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/security/fileSignature.js` | Olfato por clase de contenido (ISO-BMFF: `avif`/`heic`/`heif` dejan de leerse como `video/mp4`), decodificador base64 tolerante que devuelve `{buffer, canonical, applied[]}`, compuerta por clase opt-in sin aflojar el camino estricto |
| `M` | `apps/api/src/security/policy.js` | `assertSafeFile` acepta opciones de clase para evidencia de marcación; el camino estricto queda igual para Comercio y adjuntos vehiculares |
| `M` | `apps/api/src/modules/hr/mobile-identity.js` | Contrato asíncrono de `normalizeSelfie`; estados de evidencia `available`/`degraded` con `evidence_failure_code`; la firma se comprueba contra el hash de los bytes recibidos; el canal móvil ya no degrada una marcación por re-codificado; `webIdentity` guarda la foto degradada y la jornada vive; tope de bytes restaurado como rechazo explícito |
| `M` | `apps/api/src/modules/hr/service.js` | Motivos de rechazo 409 con código y detalle legibles por máquina (`expected_type`, `punch_type`) para los dos canales; `await` que faltaba en `createOwnPunch` (la promesa de la selfie se colaba como metadata y la marcación quedaba sin identidad); `resolvePunchLadder`: la única vía fuera de la escalera es la corrección administrativa explícita de `POST /hr/time-punches`, con motivo obligatorio, sello de autor en la fila y novedad `AJUSTE_MANUAL_MARCACION` también cuando el salto es en el mismo día |
| `M` | `apps/api/src/modules/hr/schema.js` | `correccion_administrativa` y `motivo_correccion` declarados en el contrato del punch (sin efecto en el canal propio: el ámbito lo fija el servidor) |
| `M` | `apps/api/src/fabric/platformLogs.js` | `rejectionDetailFrom` (lista blanca: motivo, campo, MIME declarado vs olido, `byte_length` vs `max_bytes`, `expected_type`) y `rejectionFromPayload` para el 4xx que un hook responde sin lanzar; nunca el cuerpo de la respuesta |
| `M` | `apps/api/server.js` | El registro del 4xx persiste código, campo, MIME declarado vs olido y longitud de bytes, sin secretos ni contenido de la imagen |
| `M` | `apps/api/src/modules/admin/public-routes.js` | El buzón público conserva `metadata.failure_cause`: sin esa clave Fastify la removía en silencio y el reporte anónimo —el único cuando no hay sesión— perdía la clasificación de la causa |
| `A` | `apps/api/test/hr-evidence-resilience.test.js` | PNG etiquetado como JPEG, AVIF real, bytes sintéticos de marca HEVC, base64 con doble prefijo / saltos / url-safe / sin padding, PDF y mp4 hostiles, payload sobre el tope |
| `A` | `apps/api/test/platform-log-rejection-detail.test.js` | Contrato del detalle saneado del 409/400: nombra el motivo y acota; jamás arrastra base64, token ni claves fuera de la lista |
| `A` | `apps/api/test/hr-administrative-punch-correction.test.js` | La escalera sigue mandando en el canal propio aunque el payload declare la corrección; el motivo es obligatorio; el salto queda nombrado |
| `M` | `apps/api/test/hr-mobile-identity.test.js` | Migración al contrato asíncrono y nueva semántica de degradación |
| `M` | `apps/web/components/operations/PhotoCapture.tsx` | El formato sale de los bytes, nunca de `file.type`; re-codificación siempre que el navegador pueda decodificar (se elimina el atajo de los 2 MB); salida estructurada "inutilizable" en lugar de callejón sin salida |
| `M` | `apps/web/lib/hrOfflineMarking.ts` | Máquina de tres clases de fallo de cola (transitorio / evidencia / marcación), clave de reintento de evidencia y aviso de escalamiento por foto perdida. El rechazo de escalera se distingue del de horario: `expectedPunchTypeOf` lee `details.expected_type` (o la frase del servidor) y le dice al operario qué botón pulse, en vez de mandarlo al supervisor |
| `M` | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` | `flushPendingSync` consume la máquina de clases; un único ciclo en vuelo con retroceso exponencial y dispersión en lugar de `setInterval` fijo de 12 s; la diferida expirada se cierra con escalamiento visible; liberación automática en carga de los elementos bloqueados por formato; la marcación degradada se muestra al supervisor |
| `M` | `apps/web/lib/api.ts` | Causa cruda diferenciada (abandono por tiempo / sin conexión / petición rechazada) usando el detalle que ya se capturaba, techo de tiempo por tipo de petición y el `code` del rechazo viaja en el reporte a platform-logs (medido: los 4xx del navegador llegaban con el código vacío) |
| `M` | `apps/web/test/hr-offline-marking.test.mjs` | El fixtures imitan el `Error` real de `authorizedJson` (`status`, `code`, `details`); se afirma que un 409 de escalera nombra la marcación que sigue y que horario/permiso no prometen autocorrección |
| `A` | `scripts/certifications/hr-marking-blocked-workers.js` | Instrumento de triaje de solo lectura por ambiente, con ventana de jornada colombiana, denominador de dotación, desglose por causa cruda y lista de jornadas sin registro |
| `A` | `docs/qa/evidence/hr-marca-evidence-resilience-20261119/bloqueados-produccion-20261119.json` | Evidencia de la medición que sustenta este brief |
| `M` | `apps/web/lib/hrOfflineEvidence.ts` | Segunda tabla Dexie (`apexos_hr_pending_evidence`) para la foto que no pudo salir: guarda `ref`, bytes, tamaño, formato olfateado en los bytes, `reason` (`undecodable`/`too_large`/`encode_failed`), tipo de marcación y hora, para que el operario pueda recuperar la evidencia sin que viaje inline en la cola de `localStorage` —que es lo que inflaba el payload hasta el rechazo— |
| `A` | `apps/web/lib/hrMarkingCorrection.ts` | Vía administrativa del supervisor (criterio 10b): hueco nombrado por escalón, hora prefijada por el horario asignado —nunca inventada—, motivo ≥ 12 caracteres, `punched_at` con desplazamiento `-05:00` y cuerpo sin `route_id` para no interceptar el checklist preoperacional |
| `M` | `apps/web/app/dashboard/talento-humano/reportes/page.tsx` | El botón de corrección aparece en el hueco de la escalera solo con `hr:write`, prefiere la hora del horario, muestra el sello del ajuste y deja de ofrecer el hueco ya corregido |
| `A` | `apps/web/test/hr-marking-correction.test.mjs` | Contratos de la vía administrativa: sin motivo no hay guardado, la hora no puede ser futura, el hueco del medio se ofrece por tipo y el cuerpo sale sin `route_id` |
| `M` | `apps/api/test/telemetry-client-logs-public.test.js` | El buzón público conserva `metadata.failure_cause` cuando el reporte llega sin sesión |
| `A` | `scripts/certifications/hr-marking-evidence-resilience-local.js` | Certificación de producto de la resilientización (36 controles) sobre API real |
| `A` | `scripts/certifications/hr-marking-queue-browser-local.js` | Certificación de navegador de la cola y de la vía administrativa (43 comprobaciones) sobre `next start` del build de producción |
| `A` | `docs/qa/evidence/hr-marca-evidence-resilience-20261119/bloqueados-produccion-20261119.json` | Evidencia de la medición que sustenta este brief, generada con `--sin-nombres` (sin identidad directa: ver §0) |
| `A` | `docs/qa/evidence/hr-marca-evidence-resilience-20261119/browser-certification.json` y sus seis capturas | Evidencia de la certificación de navegador en tema claro y oscuro |
| `M` | `package.json` | Los dos scripts de certificación nuevos (`certify:hr-marking-evidence-resilience:local`, `certify:hr-marking-queue-browser:local`) |
| `M` | `docs/**`, `agents/**`, `.qoder/skills/**` | Documentación de módulo, brief, CHANGELOG y bumps de los agentes dueños según el preflight |

### Módulos (`change_intent.modules`)

- `talento-humano-marcacion`
- `hr-evidencia-identidad`
- `seguridad-archivos`
- `web-shell`
- `observabilidad-platform-logs`
- `certification-harness`
- `documentation`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- **El tope de 24 h de la marcación diferida no se relaja.** Es un control laboral: ampliarlo para que
  la cola alcance a descargar sería cambiar la regla de negocio para tapar un defecto de sincronización.
  Se corrige la cola y el escalamiento; el tope se queda y su rechazo se vuelve accionable.
- **Migraciones remotas, cambios en Railway/Supabase y variables de ambiente de Producción.** Ninguna
  fase de este brief las necesita; lo que requería despliegue se lista en la sección 10.
- **Comercio (`apps/api/src/modules/comercio/storage.js`) y adjuntos vehiculares
  (`transport/vehicle-document-storage.js`).** Su validación sigue siendo estricta (igualdad exacta entre
  MIME declarado y olido), porque publican con el tipo olido. Aflojarla escribiría tipos falsos en el almacén.
- **`apps/api/src/modules/apex-control/**` y `apps/control-tower/**`.** La torre es de solo lectura y no se promociona.
- **La app nativa Flutter.** Este brief garantiza que el servidor y la web nunca vuelvan a perder una
  jornada por la foto; el endurecimiento de la captura en la app nativa es otro brief con su propio ciclo.
- **Refactors de adyacentes** de `empleados/page.tsx` o del monitor de horarios que no aporte el alcance.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11).
  Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase
  sin autorización explícita e independiente.
- Aislamiento multi-tenant y RBAC intactos. La evidencia de un tenant nunca se sirve a otro.
- **La integridad del control de asistencia no se negocia.** Una selfie degradada es una marcación con
  la hora garantizada y la prueba de identidad marcada como no disponible; nunca es una marcación que se
  anuncia como verificada. Canal web: `photo_only`. Canal app con firma buena sobre los bytes recibidos:
  `verified`, con `evidence_status: "degraded"` y su código cuando el archivo no es renderizable.
- VIDEO, PDF, SVG, texto, alfabeto base64 inválido y payload sobre el tope siguen rechazándose.
- Nada de datos en crudo de la imagen ni cadenas de conexión en log, evidencia o brief.
- Un rechazo nunca puede quedar como éxito silencioso, y una ausencia de evidencia nunca puede pintarse
  como evidencia disponible.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `cd apps/api && node --test test/hr-mobile-identity.test.js test/hr-evidence-resilience.test.js` →
   verde, con el camino feliz de la app afirmando `verified` y
   `stored.sha256 === hash firmado` (esto impide la regresión de degradar todas las marcaciones normales).
2. Un archivo PNG etiquetado `image/jpeg` de menos de 2 MB enviado por la app o por la web → la marcación
   se guarda con evidencia disponible, el tipo **olido** (`image/png`) y los bytes recibidos sin
   re-codificar (`stored.sha256 === hash firmado`). Antes: rechazo 400 y jornada perdida. La re-codificación
   a JPEG que planteaba este criterio se descartó por medición: el `sharp` del despliegue trae libvips sin
   decodificador HEVC —transcodificar es imposible— y re-emitting los bytes rompe la firma EC P-256 de la
   app, que cubre el hash de lo recibido.
3. Bytes con marca mayor HEIC → **la marcación se guarda** con `evidence_status: "degraded"`,
   `evidence_failure_code` que nombra el formato no renderizable y alerta visible para el supervisor.
   Nunca 400, nunca pérdida de la hora.
4. Base64 con doble prefijo `data:`, con saltos de línea, alfabeto url-safe o padding ausente → la
   marcación se guarda, `normalization_applied` lista lo reparado y lo persistido es la cadena canónica.
   Alfabeto inválido → rechazo con el motivo.
5. Payload por encima del tope, PDF o mp4 como selfie → 400 con código y detalle que nombran el tope o la
   clase rechzada. La jornada no se pierde: la marcación sin evidencia válida sigue su propio camino de
   escalamiento, no un 500 ni un silencio.
6. En la web, un elemento de cola rechazado por formato queda liberado automáticamente al recargar la
   pantalla (el arreglo del cliente lo vuelve enviable) y deja de contarse como "por enviar".
7. Una marcación encolada que al reintentar supera las 24 h **deja de estar "por enviar"**: muestra que
   debe corregirla un administrador, genera la novedad y ofrece la vía de corrección. Verificable en el
   DOM con el arnés de navegador.
8. La pantalla de marcación no dispara dos ciclos simultáneos: con una petición en vuelo, el tick se
   salta, y tras fallos consecutivos el intervalo crece con retroceso y dispersión. Medible en la
   certificación de navegador por conteo de peticiones por ventana.
9. Dos usuarios distintos con un fallo de red local no generan el mismo patrón que una caída de
   plataforma: el registro distingue abandono por tiempo, sin conexión y petición rechazada.
10. La vía de desbloqueo administrativo existe y es sancionada: `POST /hr/time-punches` (permiso
    `hr:write`) acepta la marcación que falta **fuera de la escalera** solo si el cuerpo declara
    `correccion_administrativa` con `motivo_correccion` legible; sin motivo se rechaza 422 con código
    `MOTIVO_CORRECCION_REQUERIDO`. La fila queda sellada en `metadata.correccion_administrativa` con autor,
    motivo y el salto que dio la escalera, y genera la novedad `AJUSTE_MANUAL_MARCACION` incluso cuando el
    hueco es del mismo día. El canal propio (`/hr/self/time-punches`) sigue obligado por la escalera aunque
    el payload declare la corrección: el ámbito lo fija el servidor. *(Hecho y probado.)*
10b. El botón que invoca esa vía desde la pantalla del supervisor —pedir el motivo y mostrar la fila como
    corrección con su autor— quedó **echo y certificado en navegador**: el panel "Registrar la hora que
    falta" solo aparece para un usuario con `hr:write`, prefiere la hora del horario asignado (nunca una
    hora inventada), el guardado sale por `POST /hr/time-punches` (no por el canal propio), la fila queda
    sellada en `metadata.correccion_administrativa` con `{ motivo, salto, por, en }` donde `salto` nombra
    lo que la escalera esperaba (`esperada:<tipo>` / `en_orden` / `jornada_completa`), se abre la novedad
    `AJUSTE_MANUAL_MARCACION` con `source: "correccion_administrativa"` y su autor, la insignia
    "Corrección administrativa" se ve en la trazabilidad y el hueco corregido deja de ofrecerse. Verificado
    con login real de operario y de supervisor contra el build de producción.
11. `node scripts/certifications/hr-marking-blocked-workers.js --selftest` → `SELFTEST PASADO`, y la
    corrida contra `config/qa.env` no puede reportar Producción: la salida nombra siempre el archivo de
    ambiente resuelto, el ambiente declarado y el host.

## 6. Evidencia y certificación exigida

- Pruebas unitarias: `apps/api/test/hr-mobile-identity.test.js`,
  `apps/api/test/hr-evidence-resilience.test.js`, pruebas de web tocadas.
- Certificación de producto: script versionado
  `scripts/certifications/hr-marking-evidence-resilience-local.js` con fixtures reales (PNG etiquetado
  como JPEG, AVIF generado con sharp, marca HEVC sintética, PDF y mp4 hostiles, tres variantes de
  transporte base64 roto) y evidencia en
  `docs/qa/evidence/hr-marca-evidence-resilience-20261119/`.
- Certificación de navegador: arnés `puppeteer-core` sobre `next start` del build de producción
  (`apps/web/.next/BUILD_ID`), cubriendo los escenarios 2, 3, 6, 7 y 8 de la sección 5, en tema claro y
  oscuro, con captura de la marcación degradada visible para el supervisor. Script versionado
  `scripts/certifications/hr-marking-queue-browser-local.js`, con 43 comprobaciones en verde y
  `status: "passed"`: de los seis elementos sembrados en la cola sobreviven los cinco encolados —más la
  entrada del día corregido—, el vencido queda cerrado con su acción y no hay solapamientos entre los
  ocho envíos. Evidencia en
  `docs/qa/evidence/hr-marca-evidence-resilience-20261119/browser-certification.json` y sus capturas.
  El arnés sostiene el `advisory lock` de la marcación desde otra conexión para medir la contención real,
  siembra la cola de `localStorage` con la evidencia inline tal como la dejó el incidente de producción y
  no escribe almacenes a mano. La legibilidad se mide sobre el nodo que lleva el texto y con el tema
  forzado antes de cada lectura: aviso de cierre **17,06:1 en claro y 13,04:1 en oscuro** e insignia de
  evidencia degradada **14,44:1 / 8,49:1**, esta última compuesta sobre la capa
  `rgb(120 53 15 / 0.28)` con la que `html.dark` repinta `bg-amber-50` (`apps/web/app/globals.css:1446`).
  Las dos comprobaciones de tema venían verdes con `16,48` en los dos modos —la tinta del panel leída dos
  veces porque el claro nunca se forzaba— y quedaron corregidas en `b89c14fe` junto con las capturas, que
  antes eran byte a byte iguales. Dos clases de ruido del ambiente del puesto quedan excluidas de
  `cero_errores_de_consola` con su motivo registrado en la evidencia —el respaldo Supabase local muerto
  (`localhost:54321`, CSP `connect-src`) y el websocket de colaboración (`ws://localhost:3000/collaboration/live`,
  sin servicio en la certificación)—; el control positivo del filtro se demostró en las corridas 11 y 13, cuando
  la misma compuerta seguía poniéndose roja con el resto de errores de consola.
- Triage reproducible: `scripts/certifications/hr-marking-blocked-workers.js` (solo lectura) como
  evidencia del antes y el después por ambiente.
- Compuertas de promoción: `npm run qa:preqa:evidence -- <manifiesto>` para `desarrollo → develop` y
  `npm run qa:approval:evidence -- <manifiesto>` + `npm run qa:promotion:scope -- <manifiesto> <candidato> <target>`
  para `develop → main`, sobre manifiestos generados del diff neto, con `scope_schema_version: 2` y
  `allowed_deletions: []`. Contrato de CI del destino:
  `node scripts/git-governance-guard.js ci-promotion <candidato> <target> develop refs/heads/codex/qa-<cambio>`
  y `node scripts/certifications/scoped-qa-governance-local.js`.
- `certification_status` esperado: `local_passed_qa_pending` al publicar en `desarrollo`;
  `qa_approved` solo después de la corrida funcional en QA sobre el build desplegado.

## 7. Capacidades protegidas

- **Marcar la hora desde la app con selfie válida** — certificación local + prueba unitaria del canal
  verificado que exige `stored.sha256 === hash firmado`.
- **Marcar la hora desde la app sin foto utilizable** — certificación local con marca HEVC sintética:
  la fila existe, la hora es correcta, la evidencia está degradada y nombrada.
- **Marcar la hora desde la web** — `photo_only` conservado; la evidencia degradada no se anuncia como
  verificada; E2E de navegador.
- **Aislamiento multi-tenant y RBAC de marcación** — suites HR de API existentes, sin regresión.
- **Autenticación JWT y firma biométrica** — ninguna compuerta de firma se relaja: se comprueba contra
  los bytes recibidos y una firma inválida sigue siendo 403.
- **Corrección administrativa** — nuevo flujo E2E del criterio 10 sobre `POST /hr/time-punches`.
- **Validación estricta de adjuntos en Comercio y Transporte** — suites propias: demuestran que el
  camino estricto no cambió de comportamiento.
- **Registro de auditoría** — el 4xx conserva código, campo y tipos olidos, sin binarios ni secretos.

## 8. Riesgos y rollback

- Riesgo: degradar la evidencia puede leerse como aflojar el control de asistencia.
  Mitigación: el estado degradado es explícito, nombrado y visible en la pantalla del supervisor; la
  firma sigue siendo obligatoria en el canal móvil y `photo_only` sigue sin contarse como verificación.
- Riesgo: quitar el re-codificado del camino de escritura cambia lo que se almacena (bytes originales en
  lugar de JPEG canónico). Mitigación: solo en el canal móvil firmado, donde preservar los bytes es lo
  que hace verificable la firma; el peso sigue acotado por el tope de bytes, que se restaura como
  rechazo explícito.
- Riesgo: el retroceso exponencial puede retrasar la descarga de una cola grande. Mitigación: el
  retroceso se activa solo tras un fallo previo; el primer reintento sigue siendo inmediato y los disparadores
  `online`/`focus` se conservan.
- Riesgo: tocar la validación de archivos toca Seguridad. Mitigación: la flexibilidad es opt-in por
  llamada y solo para evidencia de marcación; Comercio y adjuntos vehiculares certifican sin cambios.
- Riesgo: esta intervención convive con el plan de choque de disco (base64 en jsonb). Mitigación: no se
  añade una segunda copia de ningún binario; lo degradado se marca con metadatos, no con contenido extra.
- Rollback: `revert` de los commits del cambio, en orden inverso, sobre `desarrollo` y luego sobre las
  ramas donde se haya promocionado. Nunca `reset --hard` ni un árbol antiguo como nueva base.

## 9. Supuestos y preguntas abiertas

- Supuesto: el parque de dispositivos que reporta el incidente usa cámara que entrega HEIC o etiquetas
  falsas; la evidencia medida es 1 trabajador con 28 rechazos de formato, no una masa. El arreglo es
  estructural porque un solo día perdido por operario es costo completo.
- Supuesto: `MARCACION_FUERA_DE_SECUENCIA` es consecuencia y no causa cuando precede a un rechazo de
  formato en el mismo trabajador y día; se verifica con la lista de jornadas sin registro.
- Supuesto: la corrección administrativa de las 12 jornadas (sección 10) se hace con horarios confirmados
  por el supervisor, no inferidos del log.
- Pregunta que altera el alcance: si el dueño autoriza que el tráfico de marcación enrute por el proxy
  propio (`apps/web/app/api/v1/[...path]/route.ts`) en lugar del origen horneado en el build, se agrega
  una pata de infraestructura a este mismo brief; sin esa autorización se queda en telemetría honesta y
  retroceso, que es lo que se puede garantizar con código.

## 10. Autorizaciones requeridas

- [ ] **Escritura en Producción para el desbloqueo humano (Fase 0).** Registrar administrativamente las
  entradas y salidas que faltan a los 9 trabajadores reales con 12 jornadas sin registro, con los horarios
  confirmados por el supervisor. Los identificadores con los que se opera (y que el API exige) son
  `user`/`emp`: 231/503 (18 y 19-11), 225/479 (14 y 19-11), /535 (13-11), /523 (17-11), /539 (18-11),
  /487 (19-11), /515 (17 y 18-11), /511 (12-11), /543 (18-11). La lista con la cuenta de cada uno vive en
  la evidencia versionada `docs/qa/evidence/hr-marca-evidence-resilience-20261119/bloqueados-produccion-20261119.json`;
  los nombres completos no se copian a este brief porque el registro laboral de una persona identificable
  no necesita además un documento de ingeniería. Requiere además el criterio 10 de
  la sección 5 desplegado o una escritura supervisada por API autenticada. **Ningún agente puede
  ejecutarla por iniciativa propia: es registro laboral.**
- [ ] Promoción `desarrollo → develop` (despliegue del candidato para QA funcional).
- [ ] Promoción `develop → main` (producción), con su manifiesto de aprobación y evidencia QA.
- [ ] Cambio de variable en Railway (`HR_DEFERRED_MARKING_MAX_AGE_HOURS`) — **no solicitado**: ver sección 3.
- [ ] Rebuild y redespliegue de `apexos-web-prod` con otro `NEXT_PUBLIC_API_TIMEOUT_MS` — implícito en la
  promoción a `main`, porque la variable se hornea en el build.
- [ ] Uso del proxy propio para el tráfico de marcación (pregunta de la sección 9).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/api/src/modules/hr,apps/api/src/security,apps/web/lib,apps/web/components/operations,apps/web/app/dashboard/talento-humano,scripts/certifications,docs/briefs"` →
  veredicto y agentes requeridos; se re-ejecuta con la lista exacta de archivos al cierre.
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`,
  `apexos-qa`, `apexos-brief`, `apexos-git-guardian`, `apexos-performance` (latencia del canal y
  amplificación medida), `apexos-db-nube` (registro de 4xx y aislamiento).
- **Documentación a actualizar**: `docs/briefs/2026-11-19-marcacion-evidencia-resiliente.md`,
  documentación de módulo de marcación/evidencia, `docs/qa/certifications/*`, `agents/CHANGELOG.md`.
- **Agentes a actualizar**: los dueños que el preflight marque, con bump semver, `updated_at`, `sha256` en
  `agents/registry.json` y controles nuevos donde correspondan (regla de evidencia degradada nunca
  destruida para `apexos-backend`/`apexos-seguridad`; regla de cola que no pierde jornadas para
  `apexos-frontend`; compuerta de ambiente declarado para `apexos-qa`).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` en el mismo commit.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<lista exacta>"` en verde; cada agente
  dueño con bump local y mención en la sección más reciente de `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run test:agents` →
  `npm run agents:preflight -- --paths "<exacta>"` → `npm run agents:coverage -- --paths "<exacta>"` →
  pruebas de la sección 5 → certificaciones de la sección 6 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push,
  merges, migraciones remotas ni infraestructura.
- [x] **Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`** — `npm run agents:preflight -- --no-fetch` sobre las 37 rutas de la intervención: veredicto `OK_CON_ADVERTENCIAS`. Las advertencias son rutas sin dueño que no son de esta intervención (sondas `tmp-*` del 2026-11-17, `Claude outputs/` y los scripts de alineación de base de datos de otra ronda).
- [x] **Cobertura de contexto en verde** — `npm run agents:coverage -- --paths "<las 37 rutas>"` → `OK`. Seis agentes con bump local frente a `origin/desarrollo`: `equipo-apexos` 2.50.0, `apexos-backend` 2.21.0, `apexos-seguridad` 2.33.0, `apexos-frontend` 2.36.0, `apexos-qa` 2.81.0 y `apexos-brief` 2.64.0, cada uno con su control nuevo en la sección más reciente de `agents/CHANGELOG.md`.
- [x] **Sin secretos, credenciales ni artefactos locales en el diff** — `apps/web/next-env.d.ts` revertido antes del commit; los tres JSON de evidencia no contienen ninguna cadena base64 de más de 400 caracteres (medido, no afirmado) y el único host versionado es el pooler de Producción sin credencial, como en `docs/qa/evidence/db-alignment-20261117/`; el artefacto de triaje se regeneró con `--sin-nombres` y la verificación fue `grep` de apellidos y de `@apexos.local` sobre el archivo generado: cero coincidencias.
- [x] **Documentación y agentes actualizados en la misma intervención** — el código va en `4776b8fd` (API), `450bd4d6` (web) y `320274d6` (instrumentos y evidencia), con tres correcciones del arnés encima: `572b5e56` (el lock de contención se sostiene desde que la petición sale del navegador), `8e16a436` (el listener declara su propio error y el control publica las ventanas que vio) y `b89c14fe` (el medidor de contraste lee el aviso y no el panel, composita la capa translúcida del tema oscuro y fuerza el claro antes de medir); la documentación de módulo, este brief y el cierre de agentes viajan en el commit de cierre de la misma tanda, antes del push.
- [x] **Certificación E2E ejecutada (no simulada) y su evidencia versionada** — `certify:hr-marking-evidence-resilience:local` (36 controles `passed`) y `certify:hr-marking-queue-browser-local` (**43 comprobaciones, `status: "passed"`**, `certified_commit b89c14fe` —el SHA del arnés que produjo la evidencia, no el de una versión anterior—) corridos sobre el árbol ya commiteado, con sus capturas en `docs/qa/evidence/hr-marca-evidence-resilience-20261119/`. Antes del verde hubo tres corridas rojas del **arnés**, no del producto, cada una atribuida con número: la contención se medía con un `pg_sleep(19 s)` a ciegas que sembrar la cola y recargar la página dejaban sin margen (la marcación esperó 14,857 ms y respondió 200 sin llegar al 503), y la señal que debía ancorar ese momento apuntaba a una variable renombrada cuyo `ReferenceError` se tragaba un `catch { /* ignorado */ }` (la corrida decía «no hubo petición en vuelo» cuando el API había contestado 503 en 15,190 ms). Y dos **verdes falsos** descubiertos al releer el artefacto ya publicado: las capturas «claro» y «oscuro» de trazabilidad eran byte a byte iguales y los dos controles de legibilidad reportaban `16,48` en ambos temas —la tinta del panel, medida sobre el contenedor y sin forzar el claro—. Corregidos en `b89c14fe`, la contención quedó medida en **15,667 ms con `503 MARCACION_CONCURRENCIA_TEMPORAL`** y la legibilidad en 17,06/13,04 (aviso de cierre) y 14,44/8,49 (insignia degradada). Suites completas: `apps/api` **1322 pruebas, 1319 pasan, 0 fallos, 3 omitidas**; `apps/web` **857 pruebas, 853 pasan, 4 rojos** que leen páginas de Contabilidad, Transporte y el registro de funciones del panel de mando idénticas a HEAD (`git status` limpio en esas rutas), ajenos a este corte.
