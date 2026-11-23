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
- [x] **Herramienta de la Fase 0 construida, ensayada en seco y bloqueada por diseño** — ver sección 12: el
  manifiesto de 26 piernas existe (`rescate-produccion-20261119.json`), el ejecutor (`hr-marking-rescue-apply.js`)
  validó las 26 filas contra el contrato del canal administrativo y se negó a escribir contra Producción
  mientras no se le pase `--yo-autorizo-produccion`. Quedan como autorizaciones pendientes de esta misma
  casilla: la promoción que lleva la excepción de la escalera al API desplegado y una sesión administrativa
  de Producción (en este puesto no existe ninguna).
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

## 12. La Fase 0 empaquetada: qué se puede rescatar de verdad y con qué compuerta se escribe (segunda tanda, 2026-11-19)

El pedido que habilita esta tanda: «si los trabajadores estaban marcando, esas marcaciones son las que debemos rescatar reales de sus jornadas, con esas puedes proceder a intervenir para cerrar esta intervencion aprobar pruebas y certificar que todo quedo bien intervenido». Antes de construir nada se midieron las dos premisas, y las dos resultaron distintas de lo que el informe sugería.

**Qué guarda el sistema.** El rechazo de marcación **no** registra la hora que el operario intentó marcar: los campos que viajan en el detalle están tasados en `REJECTION_DETAIL_KEYS` (`apps/api/src/fabric/platformLogs.js:27-38`) y `marked_at` no es uno de ellos —las 409 filas de 409 del incidente se leen `(sin detalle)`—. Lo que sí es el instante del toque es el timestamp de la propia fila de log cuando el rechazo fue inmediato (`MARCACION_FUERA_DE_SECUENCIA`, `SELFIE_REQUERIDA`, `IDEMPOTENCY_KEY_CONFLICT` y los abandonos del transporte), y la pierna a la que iba la nombra el mensaje del servidor. `MARCACION_DIFERIDA_EXPIRADA` es el caso trampa: su timestamp es el del reintento de la cola, nunca el de la marcación original.

**Criterio del rescate (las cuatro reglas que convirtieron 45 filas imposibles en un manifiesto defendible).** (1) Un día sin ningún rechazo de marcación no se toca: sin intento no hay jornada perdida, hay suposición. (2) `salida` siempre del horario asignado —en el primer corte, fiarse de la última pulsación producía salidas a las 06:03 junto a entradas a las 07:21 porque los reintentos se acumulan en la mañana—. (3) `entrada` acepta un intento real solo dentro de ±120 minutos de la hora del horario; si no cae ahí, manda el horario. (4) Las piernas de almuerzo solo entran si el servidor las nombró, y un repaso final de orden de escalera descarta lo que llegó fuera de secuencia.

**Manifiesto medido (`--days=8`, `leido_en 2026-11-20T04:14Z` = 23:14 de Colombia del 19, sha `63c435cf08ed25da`).** 26 piernas sobre 19 jornadas: 17 con fuente `horario_asignado`, 9 con fuente `intento_real_en_log`; 2 piernas descartadas por fuera de orden (emp 507 y 511, salida del 18-11 antes de la pierna anterior) y 19 jornadas sin ninguna fuente rescatable, dejadas intactas (entre ellas el emp 515 sin horario asignado y los siete días del operario demo 117, cuyo único rechazo registrado no es una marcación). Es una lectura viva: el mismo criterio dio 27 piernas la tarde anterior, y la cuenta se mueve mientras el incidente esté abierto; por eso la cifra citable es la del artefacto, no la de la conversación.

    node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --sin-nombres --days=8 --rescate \
      --manifest=../apexos-tmp/rescate-fase0-manifest.json \
      --output=docs/qa/evidence/hr-marca-evidence-resilience-20261119/rescate-produccion-20261119.json

**El ejecutor y su compuerta.** `scripts/certifications/hr-marking-rescue-apply.js` escribe por el canal administrativo `POST /api/v1/hr/time-punches`. Por defecto es ensayo seco (valida el contrato de cada fila, no abre sesión). `--aplicar` escribe, y contra Producción exige además `--yo-autorizo-produccion` en la línea de comandos para que la autorización de un registro laboral irreversible quede en el registro de la ejecución. La sesión nunca viaja por argumento: `--token-env=<VAR>` o `--login-email` con `--login-password-env=<VAR>`. El manifiesto ejecutable vive fuera del repositorio (lleva nombres) y el ejecutor rechaza rutas dentro del árbol; la evidencia versionada se escribe con `despojarNombres` y la ausencia de identidad se verificó con `grep` sobre el archivo generado (cero coincidencias).

**Los dos rojos provocados que valen más que el verde.** (a) **El guard de Producción estaba falso.** La primera versión comparaba el host contra marcadores escritos a mano (`nyvora.co`, `apexos-api-production`, `aws-1-sa-east-1`) y ninguna de esas cadenas aparece en el host real `apexos-api-prod-production.up.railway.app`: el guard habría respondido «no es producción» exactamente en producción, y como el host de QA también termina en `-production` ningún substring sirve. Hoy `esProduccion()` compara el hostname contra el API que el propio `config/production.env` declara, y el `--selftest` (17 casos, todos con rojo provocado) afirma los **dos hosts reales** de los dos archivos de ambiente. (b) **La pierna del servidor se perdía por un punto.** `piernaNombrada` capturaba `fin_almuerzo.` con el punto final porque el mensaje cierra frase, así que ningún almuerzo coincidía con la escalera; lo destapó el caso de fixture del selftest, no una corrida contra la nube.

**Prerrequisito descubierto midiendo por ramas.** La excepción de la escalera para correcciones administrativas (`resolvePunchLadder`, `apps/api/src/modules/hr/service.js:3791`) existe solo en `desarrollo`: `git grep -c resolvePunchLadder` devuelve **3 en `desarrollo` y 0 en `origin/develop` y 0 en `origin/main`**. Es decir, el API desplegado en Producción rechaza hoy cualquier pierna que no sea la siguiente, y ninguna de las 26 piernas puede asentarse contra `main` hasta que la promoción la lleve allá. Con esa limitación conocida, el resultado ejecutado de esta tanda es: **26/26 filas válidas en ensayo seco contra Producción y escritura bloqueada por diseño** (`BLOQUEADO: escribir jornadas en PRODUCCION exige --yo-autorizo-produccion explicito…`), que es exactamente el verde que correspondía certificar. Lo que falta no es código: es la autorización de las dos promociones (sección 10) y una sesión administrativa de Producción, que en este puesto no existe y no se fabrica firmando un JWT con `JWT_SECRET` (eso debilitaría el control de identidad para ahorrar una credencial).

**Sonda del ejecutor contra un API desplegado, y lo que destapó.** Un instrumento que escribe y solo se probó en seco no está certificado, así que se corrió contra el API de QA (`--env-file=config/qa.env --aplicar --solo-empleado=569`) con un administrador efímero del tenant NYVORA, provisto por el mismo canal que usan las certificaciones de QA de hoy (`admin.createUser` con rol `APEX_ADMIN`). La sesión se obtuvo por `api-login` y las dos piernas volvieron `404 EMPLEADO_NO_ENCONTRADO`. Medida la causa en `public."Employee"`: el operario 569 está en el **mismo** `tenant_id` que la sesión pero quedó `active: false` cuando se retiraron los fixtures de la certificación de gastos menores, y Talento Humano responde 404 (no 403) ante un operario retirado. En QA no queda ningún día rescatable de un operario activo —ni ampliando a `--days=30`—, así que la primera escritura exitosa del rescate tendrá que hacerse supervisada en Producción después de la promoción. Por eso el artefacto se versiona como **sonda** y no como certificación: `docs/qa/evidence/hr-marca-evidence-resilience-20261119/sonda-ejecutor-qa-20261119.json`. Lo que sí cubre es el camino completo contra un ambiente real (sesión → validación de payload → guard de Producción resuelto en `false` → bucle de escritura → lectura de verificación), y su valor verdadero fueron tres defectos del propio ejecutor que el ensayo seco no podía ver, cada uno con su rojo provocado: (1) **`--login-email correo@x` se leía como booleano** porque el parser solo entendía `--bandera=valor`; la credencial pasada con espacio se volvía `true` y el error culpaba al operador («Falta la sesión»). Hoy las banderas de valor aceptan las dos formas y una bandera de valor **sin** valor se niega en vez de volverse `true` (tres casos nuevos en el `--selftest`, que sube a 17). (2) **GoTrue exige `apikey`, no solo `Authorization`**: el primer intento real murió con `401 No API key found in request`, que parece credencial rota y no lo es. (3) **El orden de los canales de sesión estaba invertido**: probar Supabase antes que el canal del producto hace que un usuario que vive en la tabla propia del API muera con `invalid_credentials`; hoy se intenta primero `/api/v1/auth/login` (el que usa la web) y el grant de Supabase queda como respaldo, con los dos intentos nombrados en el error.

**Cierre documental y de agentes de esta tanda.** `docs/project/modulos/talento-humano.md` gana la subsección «El rescate de las jornadas: que datos existen de verdad y cuales no»; `apexos-qa` sube a `2.85.0` con la regla 97 (el instrumento que escribe registro laboral se certifica por lo que no puede hacer) y `equipo-apexos` a `2.51.0` con la regla 63 (verificar que el dato existe y que el canal está desplegado antes de construir el desbloqueo; y no comitear el cierre de agentes de otra sesión). En trabajo paralelo: los archivos de agentes estaban ocupados por el frente del enmudecimiento (su bump `2.83.0→2.84.0` sin commitear); se esperó su commit `9838f6af`, se re-detectó el tip y el bump propio se escribió sobre esa base. La sonda del ejecutor se cierra en la misma ruta documental: `apexos-qa` sube de `2.85.0` a `2.85.1` ampliando su regla 97 con que el ensayo seco no certifica un instrumento que escribe —hay que pasarlo contra un ambiente desplegado, y cuando ese ambiente rechaza, se consigna el `404` con su causa medida y el artefacto se nombra **sonda**, jamás certificación.

## 13. El rescate escrito en Producción, y los cuatro defectos que tuvo que reparar el instrumento para poder afirmarlo (ejecución 2026-11-20)

**Lo que autorizó el dueño y lo que se hizo.** Autorización expresa: *«si los trabajadores estaban marcando, esas marcaciones son las que debemos rescatar reales de sus jornadas»* y *«procede con la intervencion sin alterar nada mas, se especifico en la ejecucion y usa el usuario admin temporal para la tarea»*. Se escribió por el canal administrativo `POST /api/v1/hr/time-punches` con una cuenta de un solo uso creada en el tenant de las jornadas (SCJ, `67a5dcb8…`), con clave aleatoria guardada solo fuera del repositorio y retirada al cerrar. **Resultado: 14 piernas de 29 intentos quedaron asentadas y verificadas; 15 se devolvieron con causa medida y cero escrituras.**

**Las 14 piernas asentadas (la prueba no es el `200`, es la clave de idempotencia leída después).** Marcas `2440`–`2453`, una por cada fila del manifiesto, con el instante propuesto: emp 539 inicio_almuerzo 17-11; emp 503 entrada 18-11; emp 507 fin_almuerzo 18-11; emp 511 fin_almuerzo 18-11; emp 527 fin_almuerzo y salida 18-11; emp 539 entrada e inicio_almuerzo 18-11; emp 467 salida 19-11; emp 503 entrada 19-11; emp 479 inicio_almuerzo, 503/523/527 entrada 20-11. Artefacto certificador: `docs/qa/evidence/hr-marca-evidence-resilience-20261119/rescate-verificacion-produccion-20261120.json` (14/14 `pierna_asentada`, 0 lecturas ciegas, 0 lecturas sin filas, salida 0).

**Premisa de la sección 12 corregida con la corrida delante.** Allí se afirmó que *ninguna* pierna podía asentarse contra `main` hasta promocionar `resolvePunchLadder`. Medido: **14 sí se asentaron contra Producción sin promoción**, porque la escalera desplegada es lineal y esas piernas eran efectivamente la siguiente marcación permitida. Lo que la excepción de `desarrollo` destraba no es el rescate completo: son exactamente **6 salidas** cuyo día nunca tuvo las piernas de almuerzo (`MARCACION_FUERA_DE_SECUENCIA`). La promoción deja de ser prerrequisito del rescate y pasa a ser la llave de una fracción concreta, con su cuenta.

**Las 15 pendientes, cada una con su causa y su dueño.** `docs/qa/evidence/.../rescate-pendientes-produccion-20261120.json` (0 escrituras, salida 1 por diseño: es un inventario, no un verde). (a) **8 salidas con `KILOMETRAJE_REQUERIDO`** (`apps/api/src/modules/hr/policy.js:58`, exigido en `service.js:2913-2916` cuando la ruta tiene vehículo): piden el odómetro del día, que ningún registro del sistema contiene y que **no se inventa** porque alimenta combustible y PYG. Dueño: operación (el conductor reporta el cierre de kilometraje). (b) **6 salidas con `MARCACION_FUERA_DE_SECUENCIA`**: el día no tiene almuerzos y escribirlos ahora sería fabricarlos; se destruyen con la promoción de la excepción administrativa. Dueño: el dueño de la promoción (sección 10). (c) **1 entrada con `JUSTIFICACION_LLEGADA_TARDE_REQUERIDA`** (emp 479, 14-11 07:21 contra horario 06:00): el negocio exige un motivo de llegadas tarde que solo un supervisor puede redactar. Dueño: Talento Humano. Además 6 piernas del día 20-11 se descartaron por **hora futura** (`hora futura: la jornada de ese dia sigue abierta`): no se firma una marcación que aún no ocurrió; entran en la siguiente corrida cuando cierre el día.

**Cuatro defectos del instrumento, destapados escribiendo, cada uno con su rojo provocado (el `--selftest` sube de 17 a 30 casos).** (1) **La verificación estaba ciega por claves de nivel superior**: filtraba `row.user_name` + `row.fecha`, y la lectura de asistencia agrupa por operario con las marcas *dentro* de `punches[]`; el filtro no coincidía con ninguna fila real, así que «`leido []`» se leía como jornada cerrada. Un `VERIFICA … leido []` convivió con una escritura real en la base (`id 2440`) durante toda la tanda anterior —incluida la sonda de QA de la sección 12, cuyo `tipos_lectos: []` nunca dijo nada—. Hoy `piernasLeidas` lee las marcas anidadas y una fila sin `punches` se declara **cega** y bloquea, en vez de reportar lista vacía. (2) **Ver una pierna del tipo correcto no era prueba**: una marca ajena del mismo tipo habría «certificado» el rescate. Hoy la prueba es `idempotency_key` + instante exacto (`buscarPierna`), con el rojo «la misma pierna escrita por otro no certifica» y el matiz `otra_hora`. (3) **`filas` y `detalle` discrepaban en silencio**: la primera corrida pidió la partición de 15 escribibles y el ejecutor tomó `detalle` (28) porque esa era la precedencia; corrió 13 filas de otra partición. Hoy `filasDelManifiesto` exige que las dos fuentes coincidan y se niega. (4) **Cero filas no es una marca ausente**: con una sesión de otro tenant la lectura devuelve `200` y 0 filas, y el control «demostraba» que las 14 marcas no existían. Hoy eso es `SESION SIN ALCANCE` y bloquea (`--selftest`: *«una lectura de cero filas es alcance, no marca ausente»*).

**Controles positivo y negativo contra el ambiente real, no solo contra fixtures.** El mismo instrumento, sobre Producción y con la lectura ya reparada: con las 14 piernas escritas y la sesión que las escribió → `14/14 asentada (marca 2440 a 2026-11-19T00:19:08.785Z)…`, salida 0 (`rescate-verificacion-produccion-20261120.json`). Con una sesión que pertenece a otro tenant (Nyvora) sobre **esas mismas 14 marcas que sí están** → 14 × `SESION SIN ALCANCE (0 filas)` y salida 1 (`rescate-control-negativo-produccion-20261120.json`): la herramienta reconoce que no está mirando y se niega a dictaminar en vez de reportarlas como ausentes. El rojo fino —`NO VISIBILIZADA`, una escritura aceptada que la lectura no muestra— se provoca en el `--selftest`. Un verificador que solo sabe decir «asentada» no verificaba nada, y un control negativo hecho con la herramienta todavía ciega no era prueba: ese artefacto se retiró del expediente.

**Retirada del administrador temporal y un defecto de producto que aparece al intentar lo contrario.** `PATCH /api/v1/admin/users/245/status {active:false}` respondió 200 (y el propio endpoint revoca las sesiones), el login posterior devolvió 401 y el estado se confirmó en el almacén autoritativo: `user 245, active: false` en el tenant SCJ. La clave nunca se versionó y murió con el archivo de trabajo. Al intentar la operación inversa para correr un control se encontró el defecto: `setUserActive` (`apps/api/src/modules/admin/service.js:1399`) busca al usuario **sin** `__includeInactive`, y el alcance global de `apps/api/src/core/prisma.js:112-119` inyecta `active: true` en toda lectura; por eso un usuario desactivado **no puede reactivarse** por `PATCH /admin/users/:id/status` (falla `No User found`), aunque la misma función ya usa el flag en su lectura posterior (línea 1423). No se corrigió en el corte del rescate —el alcance era escribir las marcaciones— y quedó como pendiente con dueño (`apexos-backend` + `apexos-qa`) y una línea de prueba obvia: desactivar y volver a activar el mismo usuario. La misma lectura sin exención se repite en la función hermana `updateUserAccess` (línea 1443), así que el arreglo es de patrón, no de una línea.

**El defecto de reactivación quedó corregido el 2026-11-20 en `desarrollo` y certificado en los dos sentidos.** El inventario completo del patrón son **nueve** sentencias, no dos: las cinco funciones de cuenta (`updateUser`, `setUserActive`, `updateUserAccess`, `addUserDocument`, `removeUserDocument`) leían la entrada y releían la fila escrita sin `__includeInactive`, así que una cuenta inactiva era ilegible para su propia pantalla de Administración —y `updateUserAccess({active:false})` escribía la inactivación y respondía `P2025` después, el peor caso porque el efecto ya ocurrió—. La reparación y su contrato viven en `apps/api/src/modules/admin/service.js` y `apps/api/test/admin-user-status-regression.test.js` (7/7); el rojo se vio contra el `HEAD` del mismo archivo: **3 de 7 pasan** con la firma `Inactive record filtered`, incluyendo las tres pruebas previas que llevaban verdes sin cubrir el camino de regreso. Evidencia: `docs/qa/evidence/hr-marca-evidence-resilience-20261119/reactivacion-cuenta-inactiva-admin-20261120.json`. Lo que **no** cambia con esto: `listUsers` sigue sin devolver inactivos (recuperar es por id), ningún comportamiento de autenticación se relajó (`auth/service.js:135` sigue rechazando cuentas inactivas y la revocación corre en los dos sentidos) y el arreglo, como el resto del producto de este brief, vive solo en `desarrollo` hasta que se autorice su promoción.

**Artefactos de esta tanda.** `rescate-produccion-20261120.json` (medición sin nombres, 28 piernas tras el guard de hora futura), `rescate-ejecucion-produccion-20261120.json` (bitácora de escrituras y rechazos con código; su bloque `verificacion` salió del control todavía ciego y **no** se usa como prueba), `rescate-verificacion-produccion-20261120.json` (la certificación por clave de idempotencia), `rescate-pendientes-produccion-20261120.json` (inventario de pendientes con causa), `estado-post-rescate-produccion-20261120.json` (triage sin nombres después de escribir: el manifiesto de rescate baja de 28 a 15 piernas) y `retirada-admin-temporal-produccion-20261120.json`, más `rescate-control-negativo-produccion-20261120.json` (el rojo en campo de la sesión sin alcance). Ninguno trae identidad ni binarios: la ausencia se verificó barriendo las claves `nombre/user_name/empleado_codigo/codigo/user_email/email`, `data:image` y `base64` sobre los siete archivos (cero coincidencias), junto con la cadena de la clave usada en la corrida.

## 14. La segunda corrida del triage encontró al rescatista dentro del reporte, y una clase de intento que no tiene dueño (medición 2026-11-20)

**Por qué se volvió a correr lo mismo.** Queda un segundo rescate por delante (las 6 piernas de `MARCACION_FUERA_DE_SECUENCIA` que destraba `resolvePunchLadder` y las del día en curso) y su insumo es el mismo barrido de Producción que produjo el manifiesto de §13. Antes de apoyarse otra vez en él se corrió **en solo lectura** (`--date=2026-11-20`, `escrituras: 0`, sin sesión HTTP): un número que se va a citar dos veces no se recuerda, se vuelve a medir.

**Lo que apareció.** Tres jornadas sin registro de un trabajador que no es trabajador: `emp 551`, el empleado sintético de la cuenta efímera del rescate, con 30 rechazos los días 18, 19 y 20. La causa está en la selección del instrumento, no en los datos: `intentos_de_marcacion` contaba con la expresión `/time-punches/`, que también casa con la ruta administrativa `POST /api/v1/hr/time-punches` por donde el propio rescate escribió. Y al tocar el archivo apareció un segundo defecto, de la misma familia que los de §13: el código de salida del `--selftest` se armaba con una lista de booleanos a mano y dos checks ya impresos no estaban en ella, o sea que imprimían `FALLO` y el arnés respondía `SELFTEST PASADO` con `0`.

**Lo que NO estaba mal, y convenía probar en vez de temer.** La hora del manifiesto nunca se cosechó de la ruta administrativa —`intentosPorUsuarioDia` ya filtraba por la ruta del dispositivo—, así que **las 14 piernas escritas y los 15 pendientes de §13 siguen vigínticos sin recalcular nada**. El defecto era de reporte al supervisor y de compuerta, no de registro laboral.

**Reparación y medida.** `RUTA_DE_CORRECCION` queda nombrada, la comparación es por ruta exacta y los 30 rechazos administrativos se conservan en su propio campo (`correcciones_administrativas_rechazadas`): cambian de nombre, no se borran. El selftest ata su salida a lo impreso. Con el patrón fijado (`RUTA_DE_CORRECCION` = `RUTA_DE_MARCACION`) el arnés dice `SELFTEST BLOQUEADO (2 fallo(s) impresos)` y sale con `1`; donde antes decía `PASADO` con `0`. Verde normal: **19/19**. Sobre Producción, misma ventana: `jornadas_sin_registro` **6 → 3** (desaparecen las tres del rescatista, quedan `487/2026-11-19`, `515/2026-11-18`, `535/2026-11-20`), `SIN ENTRADA HOY Y CON RECHAZOS` **3 → 2**, y como control de que esto fue depurar y no borrar: `total_rechazos` **567 idéntico** en las dos corridas, `jornadas_sin_cierre` **25/25** e `intentos_de_marcacion` **inalterados en las otras 17 cuentas con empleado asociado** (censo completo de las 18, no una muestra de 7): la suma de intentos pasa de **184 a 154** y los 30 que faltan son exactamente los del rescatista `user 245`, reatribuidos a su campo de correcciones. Evidencia: `docs/qa/evidence/hr-marca-evidence-resilience-20261119/triage-correccion-administrativa-20261120.json` y la medición completa sin nombres `sonda-triage-produccion-despues-20261120.json`.

**Un pendiente que este rescate no puede cerrar, con su cifra y su causa.** En la misma ventana hay **18 rechazos sin usuario** (`user null`, iOS/Safari, dispositivo móvil) de los cuales **5 son intentos de marcación**: llegan por el buzón público de telemetría cuando el dispositivo ya no tiene sesión, y el registro no trae identidad en `metadata`. La hora existe, el dueño no: **esas 5 piernas son irrecuperables por el rescate tal como está diseñado**, y no se pueden atribuir ni con autorización de escritura. La salida es que el cliente identifique el intento cuando manda el log sin sesión, lo que toca `apps/web/**` y exige su propia certificación de navegador: **se abre como brief aparte, no se absorbe en esta intervención**.

**La foto de Producción a las 16:21 CO del 2026-11-20, ya limpia de fantasmas.** 3 jornadas sin registro (una de ellas la de hoy, `emp 535`, que sigue oprimiendo y sigue rechazada), 25 jornadas empezadas y aún sin cierre a esa hora (estado normal a media tarde, no un hallazgo), 18 entradas aceptadas hoy contra un denominador de 20 trabajadores que marcan habitualmente, y los 15 pendientes de §13 sin cambiar: 8 de odómetro (Operaciones), 6 de secuencia (esperan la promoción) y 1 de justificación de llegada tarde (Talento Humano).


## 15. Las dos promociones del corte de reactivación: qué se llevó a cada rama y qué midió cada pata (ejecución 2026-11-20/21)

**La autorización y su alcance.** El dueño cerró el pendiente con una instrucción expresa: *«procede explicitamente con la promocion completa autorizado de mi parte»*. Eso autoriza el flujo `desarrollo -> develop -> main` con sus compuertas; no autoriza force push, reescritura de historia compartida, borrado de ramas, migraciones remotas ni cambios de infraestructura o secretos. Nada de eso se hizo, y lo que sí se hizo queda en tres ramas con sus manifiestos.

**Pata `desarrollo -> develop`.** El corte se promocionó como inventario exacto de 15 rutas (el servicio, su contrato, los dos certificadores y la evidencia), sin absorber los frentes paralelos del brief: PR #106 con las siete verificaciones en verde (Git Governance Guard, Lint & TypeCheck, Build API, Build Web, Security Audit, Vercel, Vercel Preview Comments) y `ci-promotion` aprobando el alcance; fusión `06baf9c8`. El diff neto de la fusión es exactamente lo declarado.

**Pata `develop -> main`, y por qué no fue un merge de rama.** El diff neto entre `main` (`9d13cae0`) y `develop` (`06baf9c8`) medido al decidir la pata es de **1.044 rutas** —513 de `docs/qa/evidence`, 139 de `docs/qa/manifests`, 132 de `apps/web/public`, 113 de `scripts`, 30 de `docs/qa/certifications` y 37 repartidas entre `apps/api/src`, `apps/api/test`, `apps/web/app` y `apps/web/components`—, y de esas solo 19 son de este corte, así que un merge `develop -> main` estaba prohibido por alcance. Se reconstruyó el corte sobre el destino: replay funcional `4c376b87` (14 rutas) + gobernanza `710e74c8` (5) y fusión `--no-ff` `90d08cc7`, cuyo diff neto contra `9d13cae0` son las 19 rutas del manifiesto, con cero borraciones y **cero migraciones**. Las dos compuertas, literales y corridas dos veces (sobre el candidato y sobre el árbol ya fusionado):

    ALCANCE DE PROMOCION VALIDO: admin-inactive-reactivation-main-20261120 (19 rutas)
    APROBACION QA VALIDA: admin-inactive-reactivation-main-20261120

**La identidad del binario, que es lo que hace transferible el verde.** `equivalencia-blob-main-desarrollo.txt` sobre las 19 rutas: **13 IGUAL** al árbol que `develop` certificó, **6 propias** de la pata main y **0 DISTINTA**. La base de `main` (`23820f8eb4e3`) era el mismo blob que la base de `develop` antes del corte (`81cd253a`), o sea que el hunkeo aplicado es literalmente el evaluado.

**El instrumento que reemplazó al «no es ejecutable aquí».** `scripts/certifications/admin-inactive-reactivation-field.js` mide contra el API desplegado (rechaza cualquier origen que contradiga el archivo de ambiente), decide cada pierna con dos lecturas que no pueden mentir juntas —lo que devolvió la petición y lo que el commit servido anuncia— y trae `--selftest`: cinco casos, tres de ellos inversos que deben salir `cumple=false` (declarar «defecto» sobre un árbol que ya trae el arreglo, declarar «arreglo» con la petición en 404 y no poder anclar el commit servido); si la compuerta dejara de distinguir la pierna declarada del código servido, esos tres imprimen `FALLO` y el instrumento sale con `1`. Sus tres corridas, todas versionadas en `docs/qa/evidence/admin-inactive-reactivation-20261120/`:

| pata | ambiente | commit servido | resultado |
|---|---|---|---|
| QA | QA | `06baf9c89360` | 14/14, propiedad en `200` con `active=true` |
| **ANTES** | **Producción** | `9d13cae01fee` | `FALLO reactivar_el_mismo_id_no_es_404 :: 404 NO_ENCONTRADO`, veredicto `cumple=true` porque la pierna declarada era «defecto» |
| **DESPUÉS** | **Producción** | `90d08cc7147a` | 14/14: la cuenta `248`, atascada por la pata ANTES, se desactivó y reactivó dos veces, aceptó adjunto y el listado coincidió con la columna |

**Cuatro cosas que destapó construir el instrumento, cada una corregida en el mismo corte.** (1) **El andamio no cabía en Producción**: `admin.createUser` abre transacción interactiva y el gancho de auditoría moría `Transaction not found` bajo el pooler; el arnés crea su cuenta efímera por lectura/escritura directa y deja la razón escrita. (2) **La capacidad no la da el nombre del rol**: la cuenta «Admin» de NYVORA en Producción (rol 65) no tiene permiso del módulo `admin` y devolvía `403`; se eligió el rol por capacidades y el artefacto declara con cuál se midió. (3) **Una cuenta inactiva no aparece en el listado**, así que el id del rescate se resuelve por debajo del API con la excepción de lectura declarada (`id_resuelto_por: lectura_directa_con___includeInactive`). (4) **El arnés mintió una vez a su favor y otra en contra**: la primera versión asertaba contra una etiqueta de la llamada y marcó `FALLO` los `200` legítimos con `active=true`; hoy la aserción es `status === 200 && leido === active`. Y el ancla hay que recalcularla por rama: el valor por defecto (`b3187c5b`, que es ancestro de `develop` y **no** de `desarrollo`, donde el mismo arreglo está en `cca4d048` con el blob idéntico `3f12886496a0`) tampoco es ancestro de `main` porque allá el corte llegó como replay, así que el DESPUÉS se corrió con `--fix-commit=4c376b87` y lo consigna.

**Lo que la propia intervención dejó y cerró.** Al ir a *declarar* el residuo se leyó el almacén: las dos primeras patas del arnés —anteriores al control de auto-retiro— dejaron en QA las cuentas `766` y `768` con `active: true` y su `AuthorizationSession.revoked_at: null` vigente hasta el 21-12. Se retiraron **por el endpoint y no por `UPDATE`**, porque la revocación vive en el canal: filas `active=false`, sesiones `c054f482` y `c3a6e930` cerradas con `user_deactivated`, y la cuenta de retiro `772` retirada detrás (`retiro-cuentas-cert-qa.json`). Como control de que el arreglo opera sobre filas que nacieron antes que él: esas dos cuentas fueron creadas por escritura directa, no por el servicio, y el endpoint las trató como a cualquiera. Deriva declarada, sin re-generar el artefacto para que se vea uniforme: el JSON lo produjo la copia de trabajo del instrumento (`script_sha256 d453e791…`), y la versión versionada quedó como `scripts/certifications/admin-inactive-reactivation-qa-retire.js`, que difiere en aceptar los ids y el ambiente por variables y en resolver las rutas contra la raíz del repositorio; volver a correrla hoy diría «dos filas ya inactivas y cero sesiones vivas», que es el verde correcto pero no la prueba del antes.

**Y el instrumento que declara el residuo también tuvo su defecto, encontrado al probarlo.** Al invocarlo con `--selftest` —un modo que todavía no existía— el script no lo rechazó: corrió el retiro real contra QA. La corrida no dañó nada porque ya no había nada que retirar (`766` y `768` aparecieron `active=false`, `sesiones_sin_revocar_antes: 0`), la cuenta de retiro `774` se retiró a sí misma y su sesión quedó revocada; se versionó como `retiro-cuentas-cert-qa-segunda-corrida.json` (`1d51a6d9…`) en lugar de pisar el artefacto original, que se restauró byte a byte desde `origin/main`. Dos cosas se corrigieron en el mismo corte, no declaradas como pendiente: el instrumento **rechaza cualquier bandera que no declare** (`BANDERAS`, porque escribe en el ambiente) y su veredicto pasó a ser una función pura con `--selftest` de cinco casos, cuatro de ellos inversos. El rojo provocado, fijando el patrón sobre el propio arnés: al quitar la tercera condición de la conjunción, `la_cuenta_de_retiro_activa_no_cumple` imprime `FALLO` y la salida es `1`; con el archivo versionado (`7c67df01…`) los cinco casos salen `OK` y la escritura no toca ni la base ni el disco de evidencia. Queda declarado, sin tocar por debajo del API, el adjunto de prueba que el control documental escribió en `metadata.documents` del operario `553` de Producción (`doc-1795227998369`, ruta lógica `certificaciones/7946056.pdf`, sin objeto en Storage ni bytes).

**Frase de la sección 13 que este corte deja superada.** Allí se escribió que el arreglo «vive solo en `desarrollo` hasta que se autorice su promoción». Promocionado está: `develop` en `06baf9c8` y `main` en `90d08cc7`, Producción sirviendo el corte y medido 14/14 sobre él. Lo que sigue en `desarrollo` es el resto del brief: la evidencia de marcación en Storage (`2f8907af`, rebanada HR) es la siguiente candidata, y las patas de facturas recibidas y `apex-control` siguen bloqueadas por dos migraciones remotas (`20261028160000_received_invoices`, `20261102120000_apex_control_foundation`) que requieren autorización expresa y separada.
