# Modulo Talento Humano

## Intervencion de marcaciones masivas 2026-09-02

- `GET /api/v1/hr/self/time-routes` ignora rangos suministrados por el cliente y entrega exclusivamente los horarios asignados al usuario para la fecha operativa actual de `America/Bogota`. La pantalla movil aplica el mismo filtro defensivo.
- Las operaciones autocontenidas de marcacion, actividad y sesion rechazan con `HORARIO_FUERA_DEL_DIA` cualquier horario que no corresponda al dia operativo actual, aunque el usuario lo haya tenido asignado historicamente.
- Cada marcacion movil genera una `idempotency_key`. Prisma y el respaldo Supabase mantienen unicidad por tenant/empresa para que un reintento de red devuelva la marca existente y no inserte duplicados.
- La secuencia de marcacion se serializa mediante un bloqueo transaccional por tenant, empleado, horario y dia. Personas diferentes no comparten el bloqueo y conservan concurrencia real. No se usa aislamiento global `Serializable`, porque sus bloqueos de predicado generaban abortos cruzados durante las pruebas masivas.
- La transaccion admite hasta 10 segundos para adquirir conexion, conserva un limite de ejecucion de 20 segundos y reintenta solo fallos transitorios de pool o serializacion. Las reglas funcionales `4xx` no se reintentan.
- El endpoint autocontenido de marcaciones admite hasta 600 solicitudes por minuto para soportar la rafaga certificada de 100 usuarios; autenticacion y las demas rutas conservan sus limites restrictivos.
- La cola movil conserva errores transitorios para sincronizacion posterior y descarta solicitudes rechazadas permanentemente, evitando que una marca invalida bloquee las siguientes.
- La certificacion masiva versionada usa Nyvora en QA, valida el SHA desplegado y ejecuta niveles de 20, 50 y 100 usuarios con cuatro marcas, reenvio idempotente, persistencia, ausencia de perdidas/duplicados y limpieza controlada.

## Cambios aplicados

- La entrada principal se simplifico como centro operativo de lectura rapida, con encabezado compacto, dos acciones prioritarias y cuatro indicadores esenciales.
- Los accesos a Marcacion, Planeacion, Mapa GPS, Reportes y Nomina usan bloques compactos con iconos y una descripcion breve de su funcion.
- El monitor de horarios presenta tabla profesional en escritorio y tarjetas tactiles en movil para comparar equipo, eventos, senal y estado operativo.
- La consulta permite buscar por placa, persona o estado y filtrar por prioridad operativa, horarios activos, ausencia de eventos o personas sin senal.
- Los horarios que requieren atencion se priorizan automaticamente; el detalle cronologico permanece en un panel separado para no saturar la vista principal.
- La pantalla administrativa Asignar horarios usa indicadores compactos y una tabla comparativa con filtros por persona/sede/placa, tipo de jornada, estado y fecha.
- La consulta administrativa conserva el historial completo de horarios y agrega sobre cada registro la trazabilidad disponible del dia, sin ocultar jornadas pasadas.
- Crear, editar y clonar horarios permanece en una ventana separada y guiada visualmente, diferenciando jornadas administrativas de sede fija y jornadas operativas con recurso movil.
- Las jornadas de sede fija toman sus opciones del maestro administrativo `locations`; no admiten sedes escritas libremente. El formulario informa en una ventana emergente todos los datos faltantes antes de guardar.
- Los horarios nocturnos pueden finalizar al dia siguiente (por ejemplo, `21:00` a `06:00`). Solo se rechazan horas de inicio y fin iguales. La asignacion de horarios ya no captura ni procesa viaticos.
- La persistencia de horarios cubre creacion individual, edicion y clonacion por rango tanto en la API operativa como en el respaldo Supabase, incluyendo las personas asignadas.
- Marcaciones mantiene enfoque movil con acciones tactiles y separacion entre marcar e historial.
- El mapa GPS usa coordenadas reales, enlace correcto a Google Maps y trazado de rutas.
- Planeacion de rutas se reorganizo como panel con KPIs, listado y acciones en ventanas flotantes.
- La creacion de ruta y la creacion de operario/tecnico se separaron para evitar saturacion.
- El mapa GPS fue reconstruido como centro de control operativo en vivo, usando tiles reales de OpenStreetMap y proyeccion Web Mercator sin depender de librerias externas.
- Se agrego el endpoint `GET /api/v1/hr/operations-map` para entregar rutas planeadas del dia, personas asignadas, ultima ubicacion GPS, ultima marcacion, estado operativo, tiempo en ruta y conteos de control.
- El panel del mapa ahora prioriza rutas, personas online, personas sin GPS, estado actual, placa, horario y acceso directo a Google Maps.
- La pantalla movil de marcacion ahora muestra mapa real embebido al activar GPS y envia presencia en vivo cada 30 segundos mientras el usuario permanece con GPS activo.
- El mapa deja de ser una grilla visual y pasa a funcionar como tablero dinamico de seguimiento para rutas planeadas y marcaciones.
- El mapa ya no depende solo de GPS activo: si una persona queda sin senal, conserva y muestra su ultima huella conocida de los ultimos dias configurados.
- Las rutas ahora exponen marcaciones georreferenciadas y el mapa conecta ingreso, almuerzo, retorno y cierre por usuario/ruta para reconstruir el recorrido operativo aunque haya zonas sin internet.
- Cada marcacion en el mapa es clicable y muestra tipo de marca, hora, fecha, placa, ruta, coordenadas, precision y minutos extra cuando aplique.
- El mapa GPS incorpora modo Historico, equivalente al flujo legacy, para revisar rutas cerradas o pasadas por fecha, ruta y usuario sin depender de que exista GPS activo en ese momento.
- Se normalizo el rango de fecha operativa a America/Bogota para que las rutas y marcaciones historicas se recuperen correctamente aunque el proceso Node corra con otra zona horaria.
- El fallback Supabase de GPS ya no confirma exito cuando la escritura falla: cualquier error de RLS, columnas, red o identidad se propaga al frontend para evitar falsos positivos de presencia.
- La identidad operativa de Supabase se normaliza antes de guardar GPS, marcaciones y actividades: empleados reales usan `employee_id`, usuarios sin ficha operativa usan `user_id`, y `user_name` conserva el alias enviado por la pantalla movil.
- Las pings GPS guardan la placa y el nombre suministrado dentro de `metadata` cuando la tabla Supabase no tiene columna fisica `vehicle_plate`, manteniendo trazabilidad para diagnostico y reconciliacion.
- El backend Prisma evita convertir UUIDs de Supabase a IDs numericos: si llega un UUID por `employee_id`, busca aliases/metadatos estables y no genera consultas con `NaN`.
- La asignacion de horarios separa identidad tecnica y visual: la UI envia un alias operativo legible de empleado y el monitor expone `employee_names`; la trazabilidad correlaciona marcaciones, actividades y GPS por `employee_id`, `user_id`, `user_name`, email y metadata, evitando que aliases genericos como `USR-*` oculten al usuario real.
- La creacion/edicion/clonacion de horarios normaliza la persona asignada hacia un alias operativo usable por Marcacion movil; si llega un UUID o ID tecnico, el backend intenta resolverlo contra aliases del empleado antes de guardar `route.employees`.
- Marcacion movil muestra los horarios asignados del usuario y, cuando hay mas de uno, exige seleccionar el horario antes de marcar o registrar actividades. La secuencia `entrada -> almuerzo -> retorno -> salida` se calcula por `route_id`, no por todas las marcas del dia.
- El estado operativo de Marcacion movil se reconstruye desde las marcaciones reales del horario seleccionado: si existe `entrada` sin `salida`, la jornada se muestra activa aunque el registro auxiliar `work_sessions` no exista, y el backend repara esa sesion al consultar o registrar actividades.
- Marcacion movil consume la misma trazabilidad de `operations-map` que usa el monitor administrativo como respaldo de `/attendance`; si el monitor ya muestra eventos del horario, el movil tambien debe derivar estado, proxima marca y actividades desde esos `punch_points` y `activity_points`.
- En el fallback Supabase, los IDs visibles de horario como `11` no se escriben en columnas UUID (`route_id`); se resuelven contra `operational_routes.id` cuando es posible y, si no hay UUID, se conservan como `metadata.display_route_id` para evitar errores 400 al guardar actividades o pings.
- Marcacion movil fusiona `/attendance` con `operations-map` para calcular la proxima marca por horario, de modo que eventos historicos sin `display_route_id` y eventos nuevos con metadata no rompan la secuencia. La UI avanza de forma optimista mientras Supabase sincroniza en segundo plano.
- Las marcas y actividades quedan en una cola local optimista mientras Supabase responde; el usuario no espera la carga de evidencias/GPS para continuar operando y solo recibe estado de sincronizacion o pendiente de confirmar.
- El monitor administrativo asocia marcaciones, GPS y actividades por `route_id` real o por `metadata.display_route_id`; esto permite reflejar ciclos completos guardados desde Marcacion movil aunque Supabase almacene el horario visible fuera de la columna UUID.
- La validacion funcional del monitor debe cubrir el cruce `route.id = 11` contra `operations.routes[].id = UUID` y `operations.routes[].code/display_id = 11`, esperando que el monitor fusionado conserve las 4 marcaciones y las actividades del usuario.
- La validacion de Marcacion movil debe comprobar que `apexos_hr_mobile_pending_sync` queda vacio despues de sincronizar; si hay registros pendientes, el monitor aun no puede considerarse actualizado aunque la UI movil haya avanzado localmente.
- Cuando `NEXT_PUBLIC_API_URL` esta configurado, las rutas operativas de Talento Humano usan el API operacional como fuente primaria para que el monitor y la marcacion consulten la misma base. Supabase queda como fallback de lectura, pero las escrituras criticas de marcaciones, actividades y GPS no se confirman por fallback si el API responde error.
- Cada marca, actividad y ping GPS movil envia `metadata.display_route_id`, `metadata.route_code` y `metadata.source_route_id` cuando estan disponibles. El backend Prisma tambien conserva estos metadatos, de modo que el monitor pueda reconciliar eventos aunque el horario llegue como ID visible, ID tecnico o UUID.
- El backend valida la secuencia de marcacion con la identidad operativa enviada por el movil (`user_name`, `employee_id` y aliases de metadata), ademas del empleado espejo del login. Esto evita que un usuario como `demo04` vea "Retorno almuerzo" en la UI pero el API responda que la siguiente marca permitida es `entrada`.
- La busqueda de marcaciones por horario acepta `route_id` numerico y metadatos historicos (`display_route_id`, `route_code`, `legacy_route_id`, `source_route_id`), evitando que al cambiar de horario se pierdan marcas guardadas por identificador visible.
- Las actividades moviles envian `user_name` y `employee_id` junto con GPS, evidencia y horario para que queden asociadas al mismo usuario/ruta que consume el monitor.
- La pantalla movil solo informa que el monitor puede actualizarse cuando la cola local de sincronizacion queda en cero; mientras existan pendientes, muestra que el monitor se actualizara al confirmar la cola.
- Se agregaron escenarios demo para validar mapa historico, recorrido por marcaciones y ultima huella offline:
  - `node scripts/seed-hr-map-demo.js`
  - `node scripts/validate-hr-map-demo.js`
- Los controles blancos ubicados sobre encabezados y paneles oscuros conservan su tratamiento inverso al alternar el tema, evitando perdida de contraste en el acceso a Marcacion y en los filtros del mapa.
- Reportes de tiempo consulta `attendance`, actividades y horarios con el mismo rango inclusivo aplicado por el usuario; el backend y el fallback Supabase limitan el rango a 92 dias para evitar consultas sin cota.
- Los filtros de reportes incluyen rangos rapidos (hoy, ultimos 7/30 dias y mes actual), empleado por identidad estable, jornadas completas/incompletas, solo horas extra y busqueda tolerante a tildes por persona, documento, rol, ruta, vehiculo o actividad.
- La trazabilidad del reporte solo asocia actividades de la misma fecha operativa de la jornada, incluso cuando coinciden identificadores de ruta reutilizados en otros dias.
- La descarga de reportes exige el permiso fino `hr:export` y usa un archivo `.xlsx` real con hojas Resumen, Jornadas y Trazabilidad, cabeceras visibles, autofiltros, panel congelado, fechas y horas numericas ordenadas; CSV deja de ser el formato de salida de esta pantalla.
- **2026-07-23 — Route Tracking ahora busca por metadata route_id.** La función `getRouteTracking` en `service.js` solo buscaba punches/pings GPS por `route_id` numérico directo. Las marcaciones desde móvil que guardan el route_id en `metadata.display_route_id` (por compatibilidad Supabase) quedaban huérfanas del seguimiento de ruta. Se reemplazó `route_id: Number(id)` por `...routeScopeWhere(id)`, una función ya existente que busca tanto por route_id directo como por `metadata.display_route_id`, `route_code`, `legacy_route_id` y `source_route_id`.
- **2026-07-23 — Script de validación integral HR.** Se agregó `scripts/validate-hr-flow.js` con 50 pruebas que cubren: creación de usuarios con empleados vinculados (conductor/operario), horarios, rutas, marcaciones completas con y sin checklist preoperacional, actividades post-cierre, monitor Operations Map, Route Tracking, Attendance, Work Sessions, procesamiento de jornada, y 6 edge cases de validación.
- **2026-07-23 — Documentación de auditoría.** Se agregó `docs/audits/HR_ROUTE_TRACKING_METADATA_FIX_20260723.md` con el detalle del bug, corrección y resultados de validación.

## Regla de experiencia

Talento Humano debe separar operacion diaria, configuracion y seguimiento. Marcaciones y rutas deben funcionar bien desde celular.

## Monitor de marcaciones: contrato de transporte (2026-11-18)

El incidente del horario #336 en produccion no fue un problema de datos: las marcaciones estaban bien tomadas. Fue un problema de transporte. El monitor y el reporte pedian la fila cruda de `TimePunch` y arrastraban la selfie en base64 dentro del `metadata` y del `extra_evidence`. Medido ese dia sobre el tenant del cliente: 44,4 MB y 7,74 s + 9,79 s para abrir un horario. Con las mismas lecturas proyectadas: 80 KB y 0,74 s, con los mismos 53 ids, las mismas 27 selfies anunciadas y el mismo soporte de horas extra.

La regla que sale de ahi, y la que sostiene el modulo de aqui en adelante:

- **El listado anuncia, el detalle entrega.** Ningun listado del monitor, del reporte de asistencia ni del cierre de jornada transporta binarios. Anuncia `{ id, source, has_base64_data, available, storage_path? }` y los bytes se piden a `GET /api/v1/hr/monitor-evidence/:source/:id`. La proyeccion conserva los primeros 64 caracteres y un `#apexos-monitor-evidence-sha#` + `md5` para que el dedupe y el conteo por valor sigan funcionando sin abrir el TOAST.
- **Un contador sin lectura no es un cero.** `punch_count` y `event_count` son `null` cuando la fuente no respondio por ese horario y `0` solo cuando la fuente afirmo que no hay. Pintar `0` sobre un fallo de red es exactamente el "el horario no tiene marcaciones" que el dueno leyio mal.
- **El fallo tecnico es un estado del dato, no una ventana.** Las dos lecturas del monitor registran cuando fue la ultima lectura valida y si el ultimo intento fallo; el panel dice "Sin lectura reciente del monitor" con la hora de la ultima lectura y reintenta solo (respaldo periodico), en vez de afirmar un vacio.
- **El presupuesto es una puerta, no una opinion.** `npm run certify:hr-monitor-budget:selftest` demuestra que la gate se pone roja con binario inline, con latencia fuera de presupuesto o con volumen; `certify:hr-monitor-budget:qa` y `:production` miden contra el ambiente desplegado (4 MiB por listado, p95 de 3.000 ms, cero data URL de mas de 8 KB).
- **Toda lectura cruda sigue escribiendo su `tenant_id` en el SQL** y toda resolucion de referencia valida el `tenant_id` de la fila antes de tocar Storage. Recortar bytes jamas recorta el filtro de aislamiento.

Mientras la purga del base64 ya rescatado no se ejecute en la nube (paquetes 5 a 7 del brief `2026-11-18-monitor-marcaciones-evidencia-por-referencia.md`), la columna pesada sigue ahi: lo que deja de viajar es la lectura, no todavia el almacenamiento.


## Marcacion web resiliente: la foto no se come la hora (2026-11-19)

El dueno reporto dos inconsistencias el mismo dia: "no aparece el inicio de la jornada" y "marca desde la app directamente pero no sale el registro, pero ingresa a la web y si le carga". Medido en Produccion sobre 1.286 registros de telemetria de marcacion (1.069 de error del navegador del operario): 995 fueron "Backend no disponible desde frontend" repartidos en 13 rutas del mismo cliente (495 abandonos propios del temporizador de 20 s, 317 "Load failed", 183 "Failed to fetch"), 39 rechazos `MARCACION_FUERA_DE_SECUENCIA` en 14 trabajadores, 20 `MARCACION_DIFERIDA_EXPIRADA` en 9, 28 rechazos de selfie concentrados en un solo operario (user 231), 13 `SELFIE_REQUERIDA` en 5 trabajadores, 12 `IDEMPOTENCY_KEY_CONFLICT` (emp 487) y 18 jornadas sin registro de las cuales 12 son de trabajadores reales. Cifras de la lectura versionada (`leido_en: 2026-11-19T22:38Z`, 17:38 de Colombia), obtenida con `node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --sin-nombres`: el conteo crece mientras el incidente esta abierto, y el artefacto que entra al repositorio no lleva nombres porque en este tenant el `code` del empleado y el correo SI lo son. Ese fue el punto de partida: la mayoria de los trabajadores no estaba bloqueada por una regla, estaba bloqueada por una foto.

La certificacion de navegador (`scripts/certifications/hr-marking-queue-browser-local.js`, arnes `puppeteer-core` sobre `next start` del build de produccion) reprodujo el incidente y encontró tres causas raiz de producto, no de red:

1. **`webIdentity` exigia selfie de entrada y salida sin excepciones.** Un `400 SELFIE_REQUERIDA` sobre un item que ya venia degradado cerraba la fila y perdia la hora. Hoy `apps/api/src/modules/hr/mobile-identity.js` acepta una exencion angosta (`declaredEvidenceDetachment`): el cuerpo tiene que declarar `metadata.evidence_status: "degraded"`, un `evidence_failure_code` que este dentro del contrato de `apps/api/src/security/policy.js` y un `evidence_detached_reason` de al menos 8 caracteres. Con eso la marcacion entra como `not_verified`; sin eso, el `SELFIE_REQUERIDA` sigue intacto. El piso de integridad no se movio: los bytes rechazados nunca se guardan, la fila jamas queda `verified` por declarar degradacion y el canal firmado de la app movil (`apexos-movil`) no conoce la exencion.
2. **El auto-arreglo de la cola liberaba el elemento bloqueado con la foto adentro.** Como el item ya salia marcado como degradado, el segundo `400` del servidor lo cerraba por politica: la hora se perdia otra vez, que es el incidente que esa ruta venia a cerrar. `releaseEvidenceBlockedItems` (`apps/web/app/dashboard/talento-humano/marcacion/page.tsx`) ahora desprende la evidencia (`detachEvidence`) antes de liberar, igual que la rama de reenvio en vuelo.
3. **El reenvio en vuelo declaraba el paraguas.** Ante un `400` de la foto, el cliente mandaba `failureCode: failure.code`, o sea `VALIDACION`, y el API no reconocia la excepcion: misma perdida, distinto codigo. Hoy declara el codigo de evidencia que devolvio el servidor (`evidenceCodeOf(error) || failure.code`); `VALIDACION` sigue siendo el codigo del envoltorio HTTP y solo se usa para avisar, nunca para pedir la exencion.

Lo que el operario ve son avisos que nombran el estado del dato, no el error tecnico: `SELF_HEAL_RELEASE_NOTICE` ("Se recupero una marcacion que estaba bloqueada por la foto y se envio de nuevo sin ella...") al montar, `DEGRADED_MARKING_NOTICE` ("Tu hora quedo registrada. La foto no se pudo guardar y queda pendiente de revision de tu supervisor.") cuando la hora entro degradada, y `EXPIRED_MARKING_ESCALATION_NOTICE` ("...Pide a tu supervisor que registre la hora. No es una falla de la aplicacion.") cuando la ventana de 24 h vencio. La pantalla además cuenta las filas cerradas ("N marcacion(es) cerradas: no se van a enviar y no cuentan como pendientes") para que nadie las lea como "por enviar".

La via de desbloqueo que el dueno autorizo ("no vamos a inventar, a todos les dejaremos el horario que tienen definido") ya existe y esta sancionada: `POST /api/v1/hr/time-punches` (permiso `hr:write`) acepta la marcacion fuera de la escalera solo si el cuerpo declara `correccion_administrativa` con `motivo_correccion` legible (sin motivo: `422 MOTIVO_CORRECCION_REQUERIDO`), el canal propio sigue obligado por la escalera aunque el payload declare la correccion, y la fila queda sellada con `{ motivo, salto, por, en }` abriendo la novedad `AJUSTE_MANUAL_MARCACION`. Ojo con `salto`: nombra lo que la escalera **esperaba** al momento de la correccion (`esperada:inicio_almuerzo`, `en_orden`, `jornada_completa`), no el tipo que se registro, para que el supervisor vea despues que el eslabon entro fuera de orden. La pantalla del supervisor ofrece el hueco como boton con el nombre del escalon ("Entrada"/"Inicio de almuerzo"/"Fin de almuerzo"/"Salida", `apps/web/lib/hrMarkingCorrection.ts:4`), prefiere la hora del horario asignado y nunca inventa una, y exige un motivo de al menos 12 caracteres (`CORRECTION_REASON_MINIMUM`, que el servidor corta a 300): el motivo es lo unico que distingue la correccion de un salto de orden cuando alguien la lea en la novedad.

Lo certificado (2026-11-19, brief `docs/briefs/2026-11-19-marcacion-evidencia-resiliente.md`): `npm run certify:hr-marking-queue-browser:local` → 43 de 43 comprobaciones en verde sobre `next start` del build de produccion, con el artefacto publicado sobre `certified_commit b89c14fe`, con login real del operario y del supervisor, cinco de los seis elementos encolados recuperando su hora (el vencido, cerrado con su accion) y capturas en tema claro y oscuro con sus razones de contraste medidas sobre el aviso (17,06 y 13,04 el de cierre; 14,44 y 8,49 el de evidencia degradada) (`docs/qa/evidence/hr-marca-evidence-resilience-20261119/`). El arnes sostiene el `advisory lock` desde otra conexion desde que la marcacion sale del navegador —no un tiempo fijo a ciegas— y mide la contencion real: la peticion contenida espero 15,667 ms y recibio `503 MARCACION_CONCURRENCIA_TEMPORAL`.

### El rescate de las jornadas: que datos existen de verdad y cuales no (2026-11-19)

El dueno fijo la regla dos veces: "no vamos a inventar, a todos les dejaremos el horario que tienen definido" y "si los trabajadores estaban marcando, esas marcaciones son las que debemos rescatar". Entre las dos frases esta el criterio completo, y para aplicarlo hay que saber que guarda el sistema y que no guarda:

- El rechazo **no** almacena la hora que el operario intento marcar. Los campos que viajan en el detalle de un rechazo estan listados en `REJECTION_DETAIL_KEYS` (`apps/api/src/fabric/platformLogs.js:27-38`) y `marked_at` no esta entre ellos: las 409 filas de 409 del incidente se leen `(sin detalle)`. Pedirle al log la hora intentada es pedirle un dato que nunca se registro.
- Lo que si es la hora intentada es **el timestamp de la propia fila de log** cuando el rechazo fue inmediato: `MARCACION_FUERA_DE_SECUENCIA`, `SELFIE_REQUERIDA`, `IDEMPOTENCY_KEY_CONFLICT` y los abandonos del transporte ("backend no disponible", "Load failed") ocurren en el instante del toque. `MARCACION_DIFERIDA_EXPIRADA` es el caso contrario: su timestamp es el del **reintento** de la cola, no el de la marcacion original, y por eso nunca presta una hora.
- La pierna a la que iba el intento la nombra el propio servidor en el mensaje ("la siguiente marcacion permitida es `fin_almuerzo`"), y esa es la unica fuente de la pierna para los dias sin escalera completa.

Con eso, `node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --sin-nombres --days=8 --rescate` construye el manifiesto ejecutable con cuatro reglas y las publica auditables: (1) un dia sin ningun rechazo de marcacion **no se toca** (una jornada sin intento no es una jornada perdida, es una suposicion); (2) `salida` siempre sale del horario asignado, porque los reintentos se acumulan en la manana y "la ultima pulsacion = el cierre" producia salidas a las 06:03 al lado de entradas a las 07:21; (3) `entrada` acepta un intento real solo si cae dentro de +/-120 minutos de la hora de entrada del horario, y si no, usa el horario; (4) las piernas de almuerzo solo entran si el servidor las nombro, y un repaso final de orden de escalera descarta lo que llego fuera de secuencia. Del primer corte de 45 filas ilegibles se paso, con estas cuatro reglas, a **26 piernas sobre 19 jornadas** (17 por `horario_asignado`, 9 por `intento_real_en_log`), con 2 piernas descartadas por contradictorias y 19 jornadas sin ninguna fuente rescatable (entre ellas el emp 515, sin horario asignado, y los siete dias del operario demo 117 (NyvoraDemo), cuyo unico rechazo registrado no es una marcacion).

El ejecutor es `scripts/certifications/hr-marking-rescue-apply.js`: por defecto es **ensayo seco** (valida el contrato de cada fila y no abre sesion ni escribe), `--aplicar` es lo unico que escribe y contra Produccion exige ademas `--yo-autorizo-produccion` en la linea de comandos, para que la autorizacion de un registro laboral irreversible quede en el registro de la ejecucion y no en el aire. La sesion nunca se pasa por argumento: se lee de la variable nombrada con `--token-env` o se obtiene con `--login-email`/`--login-password-env`. El manifiesto ejecutable vive **fuera del repositorio** (lleva nombres) y la evidencia que se versiona se escribe sin ellos (`docs/qa/evidence/hr-marca-evidence-resilience-20261119/rescate-produccion-20261119.json`, sha del manifiesto `63c435cf08ed25da` (`leido_en 2026-11-20T04:14Z`, 23:14 de Colombia del 19)).

Dos cosas se aprendieron midiendo, no leyendo: **"Produccion" no se reconoce por marcadores de texto.** La primera version del guard comparaba el host contra una lista escrita a mano (`nyvora.co`, `apexos-api-production`) y ninguno de esos cadenas esta en el host real `apexos-api-prod-production.up.railway.app`: el guard habria devuelto "no es produccion" justo en produccion, y QA dice `-production` en el mismo literal, asi que ningun substring sirve. Hoy el guard compara el hostname contra el API que el propio `config/production.env` declara, y el selftest afirma el host real de cada ambiente (produccion `true`, QA `false`). Y **el rescate no puede escribirse todavia**: la excepcion de la escalera para correcciones administrativas (`resolvePunchLadder`) existe solo en `desarrollo` (3 ocurrencias) y no esta en `origin/develop` ni en `origin/main` (0 en las dos, medido con `git grep` por rama), de modo que el API desplegado rechaza hoy cualquier pierna que no sea la siguiente. Antes de la Fase 0 hace falta la promocion con sus puertas, y una sesion administrativa de Produccion que este puesto no tiene.


## Identidad en la marcacion web: huella, rostro y celular del camion (2026-11-23)

- **Web movil (PWA aparte, repositorio `AppApexos`).** Al tocar *Marcar* el celular pide PRIMERO la huella (WebAuthn, llave ES256 registrada por cada empleado con su usuario en *Marcar jornada*) y DESPUES la selfie. La huella firma usuario, tipo, hora, idempotencia y llave (`apexos-web-punch|v2|...`, sin selfie); la selfie se compara con el rostro registrado.
- **Rostro (`face-identity.js`, Human 3.3.6).** Registro unico con autorizacion de datos biometricos (`face-consent.js`); el celular compara al instante y bloquea si no coincide; el servidor vuelve a comparar y, si no coincide, la marcacion queda registrada pero SENALADA (`identity_verification.face_match`). Umbral `FACE_MATCH_THRESHOLD` 0.55, a calibrar con fotos reales.
- **Huella (`personal-webauthn.js`).** `GET/POST /hr/self/webauthn`, `POST /hr/self/webauthn/registration-challenge`, `DELETE /hr/employees/:id/webauthn` (administrador). Firma invalida = 403; sin firma = `fingerprint.status: no_presentada`. Reportes muestra «Huella verificada» / «SIN HUELLA».
- **Ingreso con huella.** `POST /auth/webauthn/challenge` y `POST /auth/webauthn/login`: reto de un solo uso (2 min) y la misma sesion que `/auth/login`.
- **Celular del camion (`shared-device-identity.js`).** Un celular registrado por placa marca para la tripulacion de la malla del dia, con huella del celular y selfie de quien marca.
- **Limite.** El lector del telefono acepta cualquier dedo inscrito en el: la huella prueba celular y llave, no persona; por eso marcar exige tambien el rostro. Las llaves quedan atadas al dominio de la web movil.
- **Requisitos por ambiente.** Migraciones `hr_shared_devices`, `hr_face_enrollments`, `hr_webauthn_credentials` y variables `WEBAUTHN_ORIGINS` / `WEBAUTHN_RP_IDS` en la API. Al 2026-11-23 solo existen en `desarrollo`.

## Validaciones esperadas

- Registrar ingreso, almuerzo, retorno y cierre con GPS.
- Consultar historial.
- Ver ubicacion en mapa y tracking de ruta.
- Ver en el mapa central todas las personas con ruta planeada, diferenciando online, sin senal y sin GPS.
- Confirmar que una marcacion movil con GPS actualiza la presencia operativa en vivo.
- Confirmar que una falla al guardar presencia GPS en Supabase no se muestra como exitosa y deja alerta visible en la pantalla movil.
- Confirmar que usuarios Supabase sin ficha `employees` real pueden guardar GPS usando `user_id` sin romper RLS ni foreign keys.
- Confirmar que una persona sin GPS activo sigue apareciendo con su ultima huella conocida.
- Confirmar que las cuatro marcaciones de una ruta se conectan visualmente y muestran detalle al hacer clic.
- Confirmar que la marcacion movil no bloquea el registro esperando el ping redundante de presencia: la marca debe guardar rapido y la presencia se actualiza en segundo plano.
- Confirmar que el monitor en vivo correlaciona por `employee_id`, `user_id`, `user_name`, email y metadata para usuarios demo/autocreados, evitando aliases genericos tipo `usuario-###`.
- Confirmar que un usuario como `deemo04` asignado a un horario aparece con su nombre real y que sus marcaciones/actividades se ven en la trazabilidad aunque existan registros historicos con `USR-*`.
- Confirmar que al crear un horario desde Administracion, la columna Personas no muestra UUIDs y la pantalla movil detecta el horario asignado antes de guardar marcaciones o actividades.
- Confirmar que una persona con 2 o 3 horarios asignados puede elegir el horario correcto, cerrar la jornada de ese horario y registrar actividades sin mezclar eventos de otros horarios del mismo dia.
- Confirmar que una persona con una `entrada` ya registrada en un horario no vuelve a ver "Inicio jornada" como siguiente accion; debe ver la jornada activa, el horario seleccionado y la proxima marcacion pendiente de ese `route_id`.
- Confirmar que el monitor administrativo muestra el ID de horario en la tabla principal y que coincide con el horario seleccionado en Marcacion movil.
- Confirmar que un flujo real de 4 marcas mas evento operativo deja 4 `punch_points`, al menos 1 `activity_point` y huellas GPS visibles en la ruta del monitor.
- Confirmar que, tras cerrar un ciclo completo de `demo04` en `Horario 11`, `GET /api/v1/hr/operations-map?date=AAAA-MM-DD` expone 4 `punch_points` y las actividades del mismo horario, y que `apexos_hr_mobile_pending_sync` esta vacio.
- Confirmar que el modo Historico muestra rutas cerradas con sus 4 marcaciones por usuario, recorrido conectado y detalle clicable de cada marca.
- Confirmar que el escenario `MAP-101` contiene una ruta historica cerrada con 2 tecnicos y 8 marcaciones georreferenciadas.
- Confirmar que el escenario `MAP-202` conserva la ultima huella de una persona sin senal activa.
- Confirmar que cambiar Desde/Hasta consulta y muestra todas las jornadas del rango, incluye el dia final y rechaza rangos invertidos o superiores a 92 dias.
- Confirmar que los filtros rapidos, empleado, estado de jornada, solo extras y busqueda combinada producen el mismo subconjunto visible que se descarga.
- Abrir el `.xlsx` descargado y comprobar Resumen, Jornadas y Trazabilidad, autofiltros, fila congelada, formatos de fecha/horas y ausencia de eventos pertenecientes a otra fecha.
- Crear ruta sin mezclar el listado principal con formularios abiertos.
# Talento humano

## Planeacion de rutas y checklist preoperacional

- La creacion de personas ahora incluye clasificacion transversal `user_type`: conductor, auxiliar conductor, operario, tecnico, administrativo o supervisor.
- Cuando un usuario/empleado clasificado como conductor marca `Inicio jornada`, APEXOS crea un checklist preoperacional obligatorio si existe ruta y vehiculo asignado.
- El checklist pertenece a Planeacion de Rutas. Vehiculos solo aporta placa, sede, documentos, capacidad y score maestro.
- Sin checklist aprobado la autorizacion de inicio de ruta queda bloqueada.
- Las fallas criticas bloquean automaticamente la ruta y generan novedad/bloqueo.
- Las fallas medias permiten continuar con registro, observacion y evidencia cuando aplique.
- Se guardan respuestas, firma digital, GPS, kilometraje inicial, nivel de combustible/carga, evidencias y novedades.
- El monitor central consume metricas preoperacionales: realizados hoy, pendientes, bloqueados, cumplimiento y aprobados con novedad.

## Referencia normativa

El flujo se alinea con la Resolucion 20223040040595 de 2022 PESV: procedimiento de inspeccion preoperacional diaria, control de registros/evidencias y articulacion con SST/seguridad vial.
