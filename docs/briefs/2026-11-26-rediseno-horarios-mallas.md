# Brief — Rediseño de Horarios y mallas (línea de tiempo, tabla y ventana de detalle)

- **ID**: `2026-11-26-rediseno-horarios-mallas`
- **Fecha**: `2026-11-26`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "ayudame a implementar esta mejora para el modulo de talento humano en la aplicacion de mallas y horarios, procede con la implementacion en desarrollo y develop realiza el despliegue de manera correcta y segura no estas autorizado a llevarlo a produccion "main" hasta tener autorizacion explicita" (adjunto: `Rediseno_Horarios_y_mallas.pdf`)

## 1. Objetivo

Que el tablero de **Talento Humano → Horarios y mallas** se lea de un vistazo: seis indicadores compactos en una fila, una barra de filtros con selector de vista, y una **línea de tiempo 06:00–22:00** donde cada jornada se dibuja como una franja en su horario real. La ventana de detalle se abre **desde la franja** (y desde la fila de la tabla), con la tira de métricas arriba, la tarjeta de la persona con su progreso de cuatro pasos y la traza cronológica filtrable.

No es un cambio de datos: los endpoints, el contrato de contadores, el sondeo del monitor y la evidencia por referencia quedan intactos. Es un cambio de superficie.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/dashboard/talento-humano/rutas/page.tsx` | Retrointegra a `desarrollo` el árbol que ya sirve Producción (commit exclusivo `7f742e4d`, blob idéntico a `origin/develop` y `origin/main`) y luego aplica el rediseño: indicadores compactos (`auto-fit`), barra de filtros con selector Línea de tiempo / Tabla, eje horario 06:00–22:00 con franjas por estado, fila de tabla clicable con punto de color y menú «⋯», ventana de detalle con tira de métricas, progreso de cuatro pasos y fondo desenfocado |
| `A` | `apps/web/test/hr-schedule-timeline-view.test.mjs` | Contrato estático de la vista nueva (11 pruebas): vista por defecto, matemática del eje ejecutada y no adivinada, accesibles nombrados, señales con tokens del sistema y cero hexadecimales, y supervivencia de los anclajes del monitor |
| `M` | `scripts/certifications/hr-punch-mobile-evidence-local.js` | Ejercicio de navegador reescrito para la interacción nueva: abre el detalle pulsando la franja, comprueba la tabla y su menú, recorre el tema claro/oscuro por el control real de la app y mide el teléfono (toque ≥ 40 px, scroll horizontal, ventana a ancho completo) |
| `A` | `docs/briefs/2026-11-26-rediseno-horarios-mallas.md` | Este brief |
| `A` | `docs/qa/certifications/rediseno-horarios-mallas-20261126.md` | Certified change: qué se corrió, qué se midió y qué queda pendiente |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/certification.json` | Evidencia de la corrida local (seis chequeos) |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/medidas-linea-de-tiempo.json` | Píxeles y contrastes que la corrida del navegador registró por sí sola (no copiados de una cuenta sobre el CSS) |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/control-mutacion-contrato.json` | Control de mutación del contrato: tres mutantes, cuatro pruebas Rojas y blob restaurado |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/control-mutacion-arnes-pantalla-anterior.json` | Control de mutación del arnés: la corrida contra el árbol anterior a la vista nueva |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/artefacto-produccion.json` | Censo de marcadores en el artefacto de `next build` |
| `A` | `docs/qa/evidence/rediseno-horarios-mallas-20261126/{timeline,timeline-dark,timeline-phone,table-row-detail,table-row-menu,detail-phone}.png` | Seis capturas decisivas (escritorio claro, escritorio oscuro, teléfono, fila→detalle, menú «⋯», ventana en teléfono) |
| `M` | `docs/design/APEXOS_COMPONENT_CATALOG.md` | Nueva fila de referencia: «Línea de tiempo dentro de un listado» con lo que hay que homologar |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Reglas 65 y 66 (2.50.0 → 2.51.0) |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Reglas 149 y 150 (2.135.0 → 2.136.0) |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | Regla 88 (2.76.0 → 2.77.0) |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Regla 127 (2.112.0 → 2.113.0): el brief se reconcilia contra el árbol y el registro ejecutados |
| `M` | `.qoder/skills/apexos-git-guardian/SKILL.md` | Regla 63 (2.45.0 → 2.46.0): restauración post-build verificada por hash y mensaje de commit releído crudo |
| `M` | `agents/registry.json` | Versiones, `updated_at`, `sha256` y controles nuevos de los cinco agentes |
| `M` | `agents/CHANGELOG.md` | Entrada del frente |
| `M` | `agents/apexos-{frontend,qa,brief,git-guardian}/SKILL.md` y `agents/equipo-apexos/SKILL.md` | Espejo escrito por `npm run agents:sync` |

### Módulos (`change_intent.modules`)

- `talento-humano`
- `frontend-web`
- `qa-certificaciones`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- **API y esquema**: ningún endpoint nuevo ni modificado; `apps/api/**` queda intacto. La pantalla consume lo que ya existía (`/hr/operations-map`, `/hr/routes/event-summaries`, `/hr/monitor-evidence/*`, `/talento-humano/empleados?active=true`).
- **`apps/api/src/modules/hr/**`, `apps/api/test/hr-*.test.js`**: hay un frente ajeno trabajando ahí sin commitear (`hr/service.js`, `monitorAggregateRows.js`, `monitorMapRows.js`). No se tocan, no se commitean, no se citan como propios.
- **`apps/web/lib/hrScheduleMonitor.ts`, `apps/web/app/dashboard/talento-humano/page.tsx`, `lib/moduleFunctions.ts`**: traen trabajo del frente de unificación que `desarrollo` no retrointegró y contradicen pruebas locales de `desarrollo`. Traerlo habría revertido o roto contratos de otro frente.
- **App móvil instalada** (`apps/mobile` no existe aquí; el `sw.js` del portal): la franja nueva es del portal web, no altera el envío de marcaciones.
- **`develop -> main`**: prohibido por orden expresa del dueño.

## 4. Restricciones

- Rama: solo `desarrollo` para implementar; push permitido únicamente a `origin/desarrollo` al cierre. `develop` entra por portón con manifiesto de alcance v2 + pre-QA, con la autorización del prompt. Prohibido `main`, force push, merge de rama entera, migración remota y cambios en Railway/Supabase.
- Aislamiento multi-tenant, RBAC/ABAC y la lectura de evidencia **por referencia** (no por bytes en línea) intactos.
- Cero hexadecimales y cero colores arbitrarios en la pantalla: el PDF trae una paleta de referencia y se tradujo a los tokens del sistema.
- Sin secretos ni credenciales en el brief, la evidencia ni el diff.

## 5. Criterios de aceptación

1. `node --test apps/web/test/hr-schedule-timeline-view.test.mjs` → **11/11**.
2. `node --test test/hr-*.test.mjs` (desde `apps/web`) → sin rojos nuevos; el único rojo es `hr-offline-marking` contra `lib/api.ts`, preexistente y ajeno a esta pantalla.
3. `npm --workspace apps/web run typecheck` y `npm run lint` → limpios para las rutas tocadas.
4. `next build` → exit 0 y los marcadores `Línea de tiempo`, `Abrir detalle del horario` y `Trazabilidad cronológica` presentes en los *chunks* estáticos servidos.
5. `node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js` (navegador real, base aislada, API real) → **6/6**: la vista por defecto es la línea de tiempo, pulsar la franja abre el detalle con sus seis imágenes de evidencia, la tabla abre el mismo detalle por la fila y esconde Editar/Clonar tras «⋯», el tema oscuro aplicado desde «Mi cuenta → Tema» cambia fondo/superficie/tinta y el texto de la franja conserva AA en los dos temas (**12,39:1** claro y **14,49:1** oscuro), y en 390 px la franja mide **46 px** de toque, la pista desborda con scroll, los indicadores caen a **2** columnas y la ventana ocupa el ancho (**390 de 390 px**).
6. Control de mutación del contrato: tres mutantes (vista por defecto a tabla, eje dividido en 24, hexadecimal literal) encienden cuatro pruebas Rojas y el blob queda restaurado idéntico.
7. Control de mutación del arnés: correr el mismo ejercicio contra el árbol anterior (sin línea de tiempo) debe ponerlo Rojo en la primera comprobación de navegador.
8. PDF verificado punto por punto: indicadores 6→1 fila adaptable, filtros en una barra + selector de vista, vista nueva por defecto, tabla con punto de color y menú, ventana con métricas/pasos/traza, y responsive sin barras verticales nuevas.
9. **Control ANTES del destino** (agregado al ejecutar la promoción, no estaba en el brief original): restituidos los dos blobs de `origin/develop@baf47021` sobre el árbol del candidato, el arnés fusionado queda **ROJO** —**3** de **10** patas y timeout de **90 s** en la cuarta—. Se versiona en `candidato-develop/antes-develop.json` y prueba que la pata caída no la introdujo el carry.
10. **Certificación del candidato sobre `develop`**: **10/10** en base aislada propia (`apexos_cert_hr_assoc_1795728022773`), `source_database_modified:false` y **0** `5xx` inesperados; el contrato de eje re-ejecutado en ese árbol, **11/11**.
11. **Paridad por blob**: `promotion-migration-check` **11/11** contra `e3b2046d` y su `--selftest` rojo en los **3** mutantes (el portón puede fallar).
12. **Compuertas del flujo**: `qa:promotion:scope` → `ALCANCE DE PROMOCION VALIDO` (**12** rutas, **0** borrados, **1** waiver) y `qa:preqa:evidence` → `AUTORIZACION PRE-QA VALIDA`, más el portón de gobernanza con `APEXOS_PROMOTION_AUTH`.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/web/test/hr-schedule-timeline-view.test.mjs`, suite HR `test/hr-*.test.mjs`, suite web completa.
- Certificación: `node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js`. El entrypoint canónico crea su propia base aislada (`apexos_cert_hr_assoc_1795724187592`, esquema volcado con `pg_dump --schema-only` desde `apexos` en el contenedor local, nunca `db push`), levanta la API real y el `next dev` del propio certificador en `CERT_BROWSER_PORT` (3317 por defecto) y deja `isolated-certification.json` con `source_database_modified:false` y los 5xx inesperados vacíos. La salida cae en `.local/hr-punch-mobile-evidence/` y se copia a la carpeta de evidencia.
- Artefactos: `certification.json`, `isolated-certification.json`, `medidas-linea-de-tiempo.json`, `control-mutacion-contrato.json`, `control-mutacion-arnes-pantalla-anterior.json`, `artefacto-produccion.json` y seis capturas en `docs/qa/evidence/rediseno-horarios-mallas-20261126/`.
- `certification_status` esperado: `local_passed_qa_pending` hasta que el despliegue de QA sirva el candidato y se verifique por artefacto.

## 7. Capacidades protegidas

- **Aislamiento de tenant** — la corrida deja dos tenant (`QA fotos movil` y `QA fotos aisladas`) y un tercero sin permisos: el lote del monitor responde 401 sin token, 404 con el tenant ajeno y 403 sin permiso.
- **Evidencia por referencia** — `summary` y el lote del monitor no arrastran `;base64,`; el detalle sigue leyendo la foto en la ruta de una marcación.
- **Contadores de tres estados** — los contadores del monitor conservan `number | null` y su texto «sin lectura»; el contrato los exige (`counterText`, `["marca", \`Marcaciones (${monitorMarcaCount})\`]`).
- **Sondeo y refresco del monitor** — `ROUTES_BACKSTOP_POLL_MS = 30_000` y `EVIDENCE_FETCH_CONCURRENCY = 4` siguen en el archivo y los pide el contrato.
- **Maestro de empleados** — `/api/v1/talento-humano/empleados?active=true` con su aviso de fallo y su banner de error, intactos.
- **Censo de portales** — `createPortal(` sigue en exactamente 3 ocurrencias; el menú «⋯» se resolvió como revelado en línea (precedente `components/ui/data-table.tsx`) y no como un portal nuevo, porque el contenedor con `overflow-x-auto` recortaría un flotante.

## 8. Riesgos y rollback

- Riesgo: pintar 60+ franjas en el DOM de una jornada grande → Mitigación: tope `TIMELINE_MAX_ROWS = 60` con aviso honesto y sugerencia de fijar la fecha → Rollback: revert de los dos commits (`7f742e4d` y el del rediseño), no reset.
- Riesgo: el eje 06:00–22:00 recorta turnos nocturnos → Mitigación: la franja que se sale se dibuja como resto en el borde y su `title` lo dice («la jornada se sale de la franja visible»); nunca desaparece → Rollback: mismo revert.
- Riesgo: tocar la interacción certificada (abrir por «Abrir») rompa evidencia previa → Mitigación: «Abrir» sigue existiendo en la tabla y el contrato prohíbe perder los anclajes del monitor; el arnés cubre las dos puertas (franja y fila).
- Riesgo de entorno: la corrida local usa el árbol de trabajo, que trae el frente ajeno sin commitear en `apps/api/src/modules/hr/service.js`. Las dos patas de API de esta certificación (`summary` y `single/batch`) ya existían y pasan; las patas que prueban el rediseño son de navegador y no leen ese archivo. Aun así, la pata autoritativa es la verificación del artefacto desplegado en QA (sección 6 del `certified change`).

## 9. Supuestos y decisiones declaradas

- Supuesto: el PDF fija intención visual, no valores literales. Se usan los tokens del repositorio; los hexadecimales del documento no entran al código.
- Desviación declarada 1: el orden de acciones de la cabecera de la ventana conserva el actual (Actualizar, Editar, Eliminar, Mapa, ⋯) en lugar del orden del PDF, porque reordenar rompe el músculo de quien opera y la retrocompatibilidad con el arnés anterior.
- Desviación declarada 2: el ancho máximo de la ventana sigue en `md:max-w-6xl` (1152 px) en lugar de 1080 px; la pantalla ya estaba homologada así.
- Desviación declarada 3: la tabla conserva la `<table>` propia de la pantalla en vez de migrar a `SmartDataTable`; migrarla sería otro frente (cambia orden, paginación y selección) y ampliaría el alcance sin pedido.
- Desviación declarada 4: el eje recorta fuera de 06:00–22:00 (decisión del PDF) y lo anuncia; un turno nocturno se ve como resto en el borde.
- Desviación declarada 5: el objetivo táctil de 40 px del PDF se cumple donde se toca con el dedo —**46 px medidos en 390 px de ancho**—; en escritorio la franja mide **30 px** por densidad de tablero (está sobre los 24 px de WCAG 2.5.8 y el mismo acceso lo dan el nombre y la fila completa). Se conserva la densidad del tablero a propósito.
- Pregunta abierta (producto, no bloquea esta promoción): **la pantalla crea un horario y no lo muestra**. El listado está fijado a un día (`dateFilter` arranca en `initialDate`, viaja como `&date=` y filtra en cliente) y el asistente crea la jornada en la fecha que se le pida, así que al guardar un horario de otro día el `POST` responde **200**, la ventana se cierra y la lista sigue mostrando hoy: quien opera no ve lo que acaba de crear. Es comportamiento anterior a este rediseño y la orden del dueño no lo toca, por lo que no se cambió; el arnés hoy lo comprueba moviendo el filtro y asertando **cero** filas antes. Queda para que el dueño decida si la pantalla debe mover el filtro a la fecha creada o avisarlo. Dueño: `apexos-frontend`.

## 10. Autorizaciones requeridas

- [x] Implementar en `desarrollo` y promover a `develop` (orden del prompt).
- [x] `git push origin desarrollo` al cierre (autorización permanente acotada de `AGENTS.md`).
- [x] Desplegar el candidato en QA: autorizada en la misma orden —*«procede con la implementacion en desarrollo y develop realiza el despliegue de manera correcta y segura»*—. Se interpretó como el mínimo que eso pide: subir el candidato a `develop` y verificar que el ambiente sirva ese commit; nada de `main`, ni migraciones, ni tocar el servicio del API (el diff no trae rutas de `apps/api`).
- [ ] **`develop -> main`: NO autorizado.** Queda bloqueado hasta autorización expresa.

## 11. Documentación, agentes y publicación

- **Preflight de agentes**: `npm run agents:preflight -- --paths "<las 12 rutas del inventario>"` → veredicto `OK_CON_ADVERTENCIAS` con las rutas declaradas una por una (el barrido sin `--paths` se lleva los archivos sin seguimiento de otros frentes). Ruteo medido: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-frontend`, `apexos-qa` — cinco dueños, no tres; `agents/**` y `docs/briefs/**` arrastran a `brief` y a `git-guardian` por contrato.
- **Agentes consultados**: `apexos-frontend`, `apexos-qa`, `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`.
- **Documentación a actualizar**: este brief, `docs/qa/certifications/rediseno-horarios-mallas-20261126.md`, `docs/design/APEXOS_COMPONENT_CATALOG.md`, `agents/CHANGELOG.md`.
- **Agentes actualizados (primera ronda, cierre en `desarrollo`)**: `apexos-frontend` 2.50.0 → **2.51.0** (reglas 65 y 66); `apexos-qa` 2.135.0 → **2.136.0** (reglas 149 y 150); `equipo-apexos` 2.76.0 → **2.77.0** (regla 88); `apexos-brief` 2.112.0 → **2.113.0** (regla 127); `apexos-git-guardian` 2.45.0 → **2.46.0** (regla 63). Este párrafo se re-escribió contra `agents/registry.json` después del cierre: la primera versión del brief anunciaba 2.52.0 y 2.137.0, que eran el plan y no lo publicado, y omitía los dos agentes que el preflight añade. Es el defecto que la regla 127 de `apexos-brief` corta de raíz.
- **Agentes actualizados (segunda ronda, al certificar el candidato de `develop`)**: `apexos-qa` 2.136.0 → **2.137.1** (regla 151: el rojo del carry se atribuye midiendo el destino con sus propios blobs, y un rojo sin artefacto queda como inferencia); `apexos-frontend` 2.51.0 → **2.52.0** (regla 67: una pantalla que crea un registro fuera del rango visible de su filtro calla, y las aserciones de ausencia se prueban abriendo la vista que las contiene); `apexos-brief` 2.113.0 → **2.114.0** (regla 128: un brief que promete una promoción exige el control ANTES del destino como criterio de aceptación). Controles nuevos en `registry.json`: `antes-contra-los-blobs-del-destino`, `registro-fuera-del-rango-visible-se-declara`, `brief-exige-el-antes-del-destino`.
- **Registro**: `agents/registry.json` con `version`, `updated_at`, `sha256` y los controles nuevos; entrada en la sección más reciente de `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage -- --paths "<las de arriba>"` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
