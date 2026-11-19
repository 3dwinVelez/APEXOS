# Auditoría de producción — Monitor de marcaciones, horario #336

| Campo | Valor |
|---|---|
| Fecha | 2026-11-18 |
| Rama auditada | `desarrollo` |
| Commit auditado | `4f5a6e4b6c14fbaf34b9bc2ab387fad93bcbef56` |
| Ambiente de los datos | **Producción** (Supabase `jzbwzmkidfthknsohhnr`) y contraste con QA (`jbirkghkekuifgfsgquq`) |
| Tenant | `67a5dcb8-100b-4a44-b5db-d024f2e57450` (295 horarios, 1.799 marcaciones) |
| Caso | Horario #336, 2026-11-18, administrativa, 1 persona, Cerrado · 5 evento(s) |
| Modo | Solo lectura. Sin edición de producto, sin migraciones, sin escrituras, sin commit |
| Skill | `apexos-auditor-marcaciones` 2.0.0 |

## 1. Resumen ejecutivo

El fallo es real, es reproducible y **no es un problema de índice ni de motor de cálculo**. El monitor de marcaciones reconstruye bien los 5 eventos del horario #336: los datos están correctos en la base. Lo que falla es el viaje.

La pantalla del monitor repite cada 5 segundos una llamada a `GET /hr/operations-map` que, en producción, arrastra **aproximadamente 36 MB de JSON** porque dos columnas `jsonb` contienen la selfie en base64 incrustada y viajan sin proyectar:

| Qué viaja | Medido en producción, día 2026-11-18 |
|---|---|
| `TimePunch.metadata` (crudo, sin proyectar) | 49 filas → **20,3 MB** (media 414 KB, máximo 2,6 MB) |
| `GpsPing.metadata` (lectura de fila completa, sin ninguna proyección) | 218 filas → **16,1 MB**; leer 300 pings completos costó **5.004 ms** |
| El mismo día sin los blobs | **15 KB** |

Mientras esa petición está en vuelo, la pantalla no muestra un estado de carga: muestra **el vacío**. Y el vacío se dibuja con las mismas palabras que la ausencia real de datos («Sin eventos», «sin marcaciones»). Cuando la petición por fin resuelve —o cuando el reintento de los 5 segundos acierta— los eventos aparecen solos. De ahí la secuencia exacta que reportó el usuario: primero «no tiene marcaciones», luego el listado dice «5 eventos», al abrirlo sale vacío, y rato después aparecen las marcaciones y las evidencias.

El contador y el panel **no salen de la misma consulta**. El badge «5 evento(s)» viene de `/hr/routes/event-summaries` (rápida, ~1,3 s); la línea de tiempo del panel abierto viene de `/hr/operations-map` (lenta, megas). Son dos fuentes con tiempos distintos y la pantalla no tiene ni un indicador que lo advierta.

Y hay un tercer ingrediente: **todas las fallas de esas dos llamadas se tragan en silencio**. Un `catch` vacío, sin aviso, sin registro. Si la petición de 36 MB expira, el usuario no ve un error: ve un horario sin marcaciones.

## 2. Tabla de hallazgos

| ID | Título | Severidad | Tipo | Confianza | Estado |
|---|---|---|---|---|---|
| MAR-101 | El monitor transfiere ~36 MB cada 5 s por base64 inline sin proyectar | **P0-O** | dato / operacion | alta | confirmado |
| MAR-102 | La pantalla confunde «aún no llegó» con «no existe» | **P0-O** | control | alta | confirmado |
| MAR-103 | Falla de red del monitor silenciada en `catch {}` | **P0-O** | control | alta | confirmado |
| MAR-104 | `GpsPing.metadata` acepta la selfie sin pasar por la barrera de Storage | P1 | dato | alta | confirmado |
| MAR-105 | El rescate C.1 no cubrió `GpsPing`: 27 MB de selfies siguen inline en producción | P1 | dato | alta | confirmado |
| MAR-106 | La premisa de la proyección del 2026-11-17 («metadata = 532 B») está rota | P1 | dato | alta | confirmado |
| MAR-107 | Deriva de privilegios entre QA y Producción en 5 tablas de Talento Humano | P1 | seguridad | alta | confirmado |
| MAR-108 | `event_count` cae a 0 para rutas fuera del top-100, sin distinción | P2 | control | alta | confirmado (no aplica a #336) |
| MAR-109 | `processDay` y `listAttendance` leen el día completo sin proyectar (28 MB) | P2 | operacion | alta | confirmado |
| MAR-110 | `TimePunch.route_id` sin índice | P2 | dato | media | confirmado, costo hoy despreciable |

**Lo que NO se confirmó.** La hipótesis inicial del truncamiento del resumen como causa del caso #336 se descartó con datos: la ruta 336 ocupa la **posición 12** del `ORDER BY date DESC LIMIT 101` y sí está dentro del top-100. Sigue siendo un riesgo latente (MAR-108), pero no explicó este incidente.

## 3. Hallazgos

```yaml
id: MAR-101
severidad: P0-O
tipo: dato
requisito: "El monitor de marcaciones debe mostrar los eventos de un horario en un tiempo
  percibido aceptable y sin poner en riesgo la fiabilidad de la información en pantalla."
esperado: "La lectura del día transfiere solo lo que la pantalla pinta; la evidencia
  fotográfica se pide por referencia, bajo demanda."
observado: "GET /hr/operations-map arrastra ~36 MB de base64 inline en cada llamada y el
  cliente la repite cada 5 segundos mientras un horario está abierto. Leer 300 pings GPS
  completos tomó 5.004 ms. El mismo día, sin los blobs, son 15 KB."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:3409"
  - detalle: "getOperationsMap; línea 3429 y 3445 leen prisma.gpsPing.findMany sin `select`."
  - archivo: "apps/api/src/modules/hr/monitorEvidenceRows.js:190"
  - detalle: "readDayEvidencePunches emite \"TimePunch\".\"metadata\"::text sin proyectar."
  - reproduccion: |
      SELECT count(*), sum(pg_column_size(metadata)) FROM "TimePunch"
       WHERE date >= '2026-11-18' AND date < '2026-11-19';           -- 49 filas, 20,3 MB
      SELECT count(*), sum(pg_column_size(metadata)) FROM "GpsPing"
       WHERE captured_at >= '2026-11-18' AND captured_at < '2026-11-19';  -- 218, 16,1 MB
      SELECT * FROM "GpsPing" WHERE captured_at >= '2026-11-18' ... LIMIT 300;  -- 5.004 ms
impacto: operativo
recomendacion: "Proyectar identity_photo en readDayEvidencePunches (igual que ya hace
  readRoutePunchEvidence) y añadir una proyección de GpsPing a las lecturas del mapa."
dueno: "apexos-backend + apexos-performance"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-102
severidad: P0-O
tipo: control
requisito: "La pantalla debe distinguir entre «no hay datos todavía», «no hay datos» y
  «hubo un error al cargar»."
esperado: "Estado de carga explícito en el badge de eventos y en la línea de tiempo."
observado: "eventSummaries arranca en [] y forcejea event_count a 0; el badge imprime
  «Sin eventos» y la línea de tiempo imprime vacío. Ninguno de los dos es distinguible
  de la ausencia real de marcaciones. loadingMonitor solo hace girar el ícono del botón
  «Actualizar»; el panel abierto no tiene indicador."
evidencia:
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:426"
  - detalle: "useState<RouteEventSummary[]>([]) — estado inicial vacío."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:877"
  - detalle: "event_count: summary?.event_count || 0 — la ausencia de resumen se colapsa a 0."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:221"
  - detalle: "routeDisplayState devuelve «Sin eventos» cuando events === 0."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:1147"
  - detalle: "celda Estado: «{displayState.status} · {events} evento(s)»."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:886"
  - detalle: "punch_points viene de operations-map, no del resumen: dos fuentes, dos tiempos."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:575"
  - detalle: "openRouteMonitor abre el panel con el snapshot anterior y dispara loadMonitor."
impacto: operativo
recomendacion: "Diferenciar null (sin cargar) de 0 (sin eventos) en el contrato y en la UI."
dueno: "apexos-frontend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-103
severidad: P0-O
tipo: control
requisito: "Un fallo de carga debe ser visible para el usuario y trazable para operación."
esperado: "Aviso en pantalla y registro del error."
observado: "loadMonitor y loadEventSummaries terminan en un catch vacío. El comentario del
  propio código dice «Keep the last valid snapshot visible while the next refresh retries»:
  se confía en que el poll de 5 s lo remiende. Si la petición de 36 MB expira, el resultado
  es un horario que parece no tener marcaciones."
evidencia:
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:513-521"
  - detalle: "loadMonitor: try/catch vacío, sin seteo de error."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:525-532"
  - detalle: "loadEventSummaries: catch vacío, «Preserve the latest valid counters»."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:541"
  - detalle: "setInterval(refreshVisible, 5000) — el único mecanismo de recuperación."
impacto: operativo
recomendacion: "Estado de error visible + reintento con backoff + telemetría del fallo."
dueno: "apexos-frontend + apexos-qa"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-104
severidad: P1
tipo: dato
requisito: "Ninguna escritura debe dejar base64 dentro de una columna jsonb (barrera
  HR_EVIDENCE_STORAGE de la Fase D)."
esperado: "Todo camino que acepte identity_photo pasa por preparePunchEvidence."
observado: "createGpsPing y createOwnGpsPing construyen metadata con routeEventMetadata,
  que hace ...metadata sin filtrar, y no llaman a preparePunchEvidence. La selfie entra
  directa a GpsPing.metadata."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:3289"
  - detalle: "createGpsPing; línea 3330 hace ...routeEventMetadata(input, ...)."
  - archivo: "apps/api/src/modules/hr/service.js:441"
  - detalle: "routeEventMetadata devuelve { ...metadata } sin despojar identity_photo."
  - archivo: "apps/api/src/modules/hr/service.js:3155"
  - detalle: "preparePunchEvidence solo se invoca en createPunch, no en los escritores de GPS."
  - reproduccion: |
      SELECT count(*) FROM "GpsPing" WHERE position('identity_photo' in metadata::text) > 0;
      -- 44 filas en producción, 27,8 MB; 31 de ellas son del 2026-11-18 en adelante
impacto: economico
recomendacion: "Aplicar la misma barrera al escritor de GPS y rechazar base64 entrante."
dueno: "apexos-backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-105
severidad: P1
tipo: dato
requisito: "El rescate C.1 debe cubrir toda la evidencia inline antes de la purga C.2."
esperado: "QA y Producción sin base64 inline después del rescate."
observado: "El rescate de 2026-11-18 iteró TimePunch y ActivityEvidence. Nunca tocó
  GpsPing. En producción hay 44 selfies en GpsPing.metadata con 0 banderas de rescate y
  0 storage_path."
evidencia:
  - archivo: "scripts/hr-rescue-inline-base64-to-storage.js:243"
  - detalle: "fetchAll(\"TimePunch\", ...); no hay pasada por GpsPing."
  - reproduccion: |
      PRODUCCION  GpsPing: 6.522 filas | con_flag=0 | con_storage_path=0 | con_selfie=44 | 31 MB
      QA          GpsPing: 2.023 filas | con_flag=0 | con_storage_path=0 | con_selfie=44 | 2,7 MB
impacto: economico
recomendacion: "Extender el rescate a GpsPing con el mismo índice ligero y verificación
  SHA-256 antes de autorizar cualquier purga."
dueno: "apexos-db-nube"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-106
severidad: P1
tipo: dato
requisito: "La proyección del monitor debe sostenerse sobre la distribución real de
  producción, no sobre una medición puntual."
esperado: "metadata es pequeño y viaja crudo; la selfie vive solo en extra_evidence."
observado: "El comentario de monitorEvidenceRows.js fija «metadata mide 532 bytes de media»
  y por eso readDayEvidencePunches lo deja crudo. En producción metadata promedia 17 KB por
  fila del tenant y 414 KB en el día 2026-11-18, con máximo 2,6 MB, porque identity_photo
  vive ahí. readRoutePunchEvidence sí encoge identity_photo; su función hermana no."
evidencia:
  - archivo: "apps/api/src/modules/hr/monitorEvidenceRows.js:135-136"
  - detalle: "«mide 575 bytes de media» — premisa citada en el propio archivo."
  - archivo: "apps/api/src/modules/hr/monitorEvidenceRows.js:186"
  - detalle: "«metadata viaja cruda: mide 532 bytes de media»."
  - archivo: "apps/api/src/modules/hr/monitorEvidenceRows.js:151"
  - detalle: "readRoutePunchEvidence sí llama shrinkNested(..., 'identity_photo')."
  - reproduccion: |
      SELECT key, count(*), max(pg_column_size(metadata->key)) FROM "TimePunch",
             LATERAL jsonb_object_keys(metadata) key GROUP BY key ORDER BY 3 DESC;
      -- identity_photo: 46 filas, 2.636 KB máximo, 28.997 KB suma
impacto: operativo
recomendacion: "Proyectar identity_photo también en readDayEvidencePunches y fijar un
  guard que falle si la media real supera el umbral asumido."
dueno: "apexos-backend + apexos-performance"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-107
severidad: P1
tipo: seguridad
requisito: "QA y Producción deben tener el mismo contrato de privilegios para que una
  prueba en QA signifique algo en Producción."
esperado: "Paridad de grants service_role entre ambientes."
observado: "En producción service_role NO tiene SELECT sobre TimeRoute, WorkActivity,
  Employee, WorkSchedule ni Tenant; en QA sí. TimePunch y ActivityEvidence sí están
  concedidos en ambos. Cualquier lectura por PostgREST con service role contra esas cinco
  tablas devuelve 403 en producción y 200 en QA."
evidencia:
  - reproduccion: |
      GET /rest/v1/TimeRoute?select=*&limit=1   ->  QA 200 | PROD 403 (42501)
      GET /rest/v1/WorkActivity?select=*&limit=1 -> QA 200 | PROD 403
      GET /rest/v1/Employee?select=*&limit=1    ->  QA 200 | PROD 403
      GET /rest/v1/WorkSchedule?select=*&limit=1 -> QA 200 | PROD 403
      GET /rest/v1/Tenant?select=*&limit=1      ->  QA 200 | PROD 403
      SELECT relname, has_table_privilege('service_role', oid, 'SELECT') FROM pg_class ...
  - detalle: "RLS está activo en las siete tablas en ambos ambientes; la diferencia es de
    grant, no de política."
impacto: operativo
recomendacion: "Decidir el contrato correcto y alinearlo con migración versionada. No
  asumir que la ruta de respaldo por service role funciona en producción."
dueno: "apexos-db-nube + apexos-seguridad"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-108
severidad: P2
tipo: control
requisito: "Un listado truncado no debe presentarse como un horario sin marcaciones."
esperado: "Rutas fuera del resumen no reciben un 0 absoluto."
observado: "listRouteEventSummaries toma las 100 rutas más recientes por date DESC y el
  cliente convierte la ausencia de resumen en event_count 0 y badge «Sin eventos». Con 295
  rutas del tenant y 11 con fecha futura, la corteza ya está activa: el propio aviso en
  pantalla lo dice. Para la #336 no aplicó (posición 12), pero es la misma clase de fallo
  silencioso a un paso de dispararse."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:897"
  - detalle: "const SUMMARY_LIMIT = 100; orderBy date desc, take SUMMARY_LIMIT + 1."
  - archivo: "apps/web/app/dashboard/talento-humano/rutas/page.tsx:877"
  - detalle: "event_count: summary?.event_count || 0."
  - reproduccion: |
      WITH ordered AS (SELECT id, row_number() OVER (ORDER BY date DESC) rn FROM "TimeRoute"
                       WHERE tenant_id = '67a5dcb8-...')
      SELECT rn FROM ordered WHERE id = 336;   -- 12, dentro del top-100
      SELECT count(*) FROM (SELECT id FROM "TimeRoute" WHERE tenant_id='67a5dcb8-...'
                            ORDER BY date DESC LIMIT 100) t
      WHERE NOT EXISTS (SELECT 1 FROM "TimePunch" p WHERE p.route_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM "WorkActivity" a WHERE a.route_id = t.id);  -- 12 rutas
impacto: operativo
recomendacion: "Devolver event_count: null para rutas fuera del resumen y pintarlo como
  «sin dato», o acotar el resumen al rango de fechas que la pantalla ya está mostrando."
dueno: "apexos-backend + apexos-frontend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-109
severidad: P2
tipo: operacion
requisito: "Los procesos de cierre de jornada y reportes no deben pagar el costo del
  base64 que no consumen."
esperado: "Lectura proyectada."
observado: "processDay hace prisma.timePunch.findMany del día sin select y sin límite;
  listAttendance igual sobre el rango. Medido: 28 MB para el 2026-11-18."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:3804"
  - detalle: "processDay; línea 3811, findMany sin proyección."
  - archivo: "apps/api/src/modules/hr/service.js:3712"
  - detalle: "listAttendance; línea 3717, findMany sin proyección."
  - reproduccion: |
      SELECT count(*), sum(pg_column_size(extra_evidence)+pg_column_size(metadata))
      FROM "TimePunch" WHERE date >= '2026-11-18' AND date < '2026-11-19';  -- 49 / 28 MB
impacto: operativo
recomendacion: "Aplicar SELF_PUNCH_SELECT a ambos caminos."
dueno: "apexos-backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-110
severidad: P2
tipo: dato
requisito: "Las consultas por ruta deben estar indexadas."
esperado: "Índice sobre TimePunch.route_id."
observado: "No existe. EXPLAIN muestra Seq Scan, pero con 290 bloques en caché y 1,079 ms
  de ejecución porque el scan no detoastea. Hoy no es el cuello de botella; con más volumen
  y sin la proyección, lo será."
evidencia:
  - reproduccion: |
      SELECT indexdef FROM pg_indexes WHERE tablename='TimePunch';
      -- pkey, (tenant_id,date), (tenant_id,date,punched_at), (tenant_id,employee_id,date),
      -- (tenant_id,idempotency_key) unique, (tenant_id,user_name,date).  Ninguno con route_id.
      EXPLAIN ANALYZE SELECT route_id,count(*) FROM "TimePunch"
      WHERE route_id = ANY(ARRAY[...100 ids]) GROUP BY route_id;  -- 1,079 ms, Seq Scan
impacto: operativo
recomendacion: "Índice (tenant_id, route_id) junto con la proyección, no antes."
dueno: "apexos-db-nube"
confianza: media
estado: confirmado
```

## 4. Contexto de remediación heredado

Conforme a la regla dura 11 de la skill, se declara el estado de los cortes previos:

- **Auditoría 2026-10-30 (R-01..R-05):** implementados en `desarrollo`. `main` no contiene el motor corregido. No aplica a este incidente pero no se asume cumplimiento.
- **Corte 2026-11-17 (`5e45dac8`, «el monitor deja de arrastrar selfies»):** está en las tres ramas. Cerró la fuga de `extra_evidence` en `readRoutePunchEvidence` y en el lote del monitor. **Dejó abierta `metadata` por una premisa que hoy está rota (MAR-106) y no tocó `GpsPing` (MAR-101).** Este incidente es en gran parte la otra mitad de ese corte.
- **Corte 2026-11-18 (Fase D, `2f8907af`):** solo en `desarrollo`. `evidenceStorage.js` no existe en `main` ni en `develop`. La barrera de escritura no está desplegada y la purga C.2 está aplazada por diseño.

### Paridad del lector entre ramas

| Archivo | main | develop | desarrollo |
|---|---|---|---|
| `monitorEvidenceRows.js` | `86af38ac` | `86af38ac` | `86af38ac` |
| `service.js` | `28fc09cf` | `28fc09cf` | `23cac8df` |
| `punchEvidence.js` | `0c570a85` | `0c570a85` | `56646ca6` |
| `mobile-identity.js` | `163aa577` | `163aa577` | `58c431fc` |
| `evidenceStorage.js` | **ausente** | **ausente** | `1aee722b` |

### Estado de la evidencia inline

| Ambiente | Tabla | Filas | Con bandera de rescate | Con `storage_path` | **Sigue con base64** | Bytes inline |
|---|---|---|---|---|---|---|
| Producción | `TimePunch` | 2.349 | 270 extra / 38 identity | 297 | 46 meta + 277 extra | 241 MB extra + 29 MB meta |
| Producción | `GpsPing` | 6.522 | **0** | **0** | **44** | **27,8 MB** |
| Producción | `ActivityEvidence` | 136 | 124 | — | 124 | 72 MB |
| QA | `TimePunch` | 938 | 2 extra | 83 | 7 | — |
| QA | `GpsPing` | 2.023 | **0** | **0** | **56** | 2,7 MB |
| QA | `ActivityEvidence` | 154 | 70 | — | 0 (purgado) | 154 B |

QA ya fue purgado en `ActivityEvidence`; producción no. Es la deriva que el plan de choque dejó a medias y que este incidente agrava.

## 5. Plan de corrección por ambientes

Orden deliberado: primero se corta el dolor del cliente, luego se cierra la llave, luego se alinea, y solo al final se purga. Ninguna fase de despliegue o promoción está autorizada por este documento.

### Fase 1 — Cortar el viaje (P0, `desarrollo`, sin nube)

1. `readDayEvidencePunches`: aplicar `shrinkNested('"TimePunch"."metadata"', 'identity_photo')`, igual que su función hermana `readRoutePunchEvidence`.
2. Nueva proyección para `GpsPing` en `getOperationsMap`, `getRouteTracking`, `listActiveGps` y `listGpsHistory`: `metadata` sin la rama `identity_photo`.
3. Guard de presupuesto: reutilizar `scripts/certifications/performance-budget-guard-local.cjs` y `screen-loading-real-local.cjs` para fijar un techo de bytes por llamada del monitor.

Salida esperada: la misma pantalla con ~15 KB en lugar de ~36 MB.

### Fase 2 — Que el vacío se llame vacío (P0, `desarrollo`)

4. El contrato devuelve `event_count: null` cuando la ruta no está en el resumen; la pantalla pinta «sin dato» en lugar de «Sin eventos».
5. `eventSummaries` arranca en `null`, no en `[]`; el badge muestra «Cargando…» hasta la primera resolución.
6. La línea de tiempo del panel abierto tiene su propio indicador de carga y su propio estado de error, no solo el girito del botón «Actualizar».
7. Los `catch {}` de `loadMonitor` y `loadEventSummaries` pasan a registrar y mostrar el fallo.

### Fase 3 — Cerrar la llave (P1, `desarrollo`)

8. `createGpsPing` y `createOwnGpsPing` pasan por `preparePunchEvidence`; `routeEventMetadata` despoja `identity_photo` con base64. Sin Storage configurado, se rechaza la escritura en vez de guardarla inline.

### Fase 4 — Rescatar lo que el C.1 no vio (P1, nube, **requiere autorización**)

9. Extender `scripts/hr-rescue-inline-base64-to-storage.js` a `GpsPing` con el índice ligero y la verificación SHA-256 que ya usó en `TimePunch`. Dry-run primero en QA, luego en Producción.

### Fase 5 — Alinear privilegios (P1, nube, **requiere autorización**)

10. Decidir el contrato de `service_role` sobre `TimeRoute`, `WorkActivity`, `Employee`, `WorkSchedule` y `Tenant`, y llevarlo a una migración versionada que deje QA y Producción idénticos. Hasta ahí, ninguna certificación en QA que dependa de PostgREST con service role vale para Producción.

### Fase 6 — Desplegar y purgar (bloqueado por promoción)

11. Promover la Fase D más Fases 1-3 a `develop` y `main`. Esta es la compuerta que hoy tiene la purga C.2 aplazada: sin el lector desplegado, borrar el inline deja al cliente sin historial.
12. Con el lector desplegado y verificado: purga C.2 en QA y Producción, luego `VACUUM FULL` de `TimePunch`, `ActivityEvidence` y `GpsPing`.
13. Índice `(tenant_id, route_id)` sobre `TimePunch`, después de la purga, no antes.

### Fase 7 — Saldar las lecturas restantes (P2)

14. `processDay` y `listAttendance` con `SELF_PUNCH_SELECT`.

### Puerta de certificación

Ninguna fase se cierra con pruebas unitarias. La certificación exigida es el flujo completo del incidente: abrir el horario #336 en un navegador real contra el build desplegado, con red limitada, y demostrar que (a) el panel nunca dice «sin marcaciones» mientras hay datos por llegar, (b) un fallo de red se ve, y (c) la llamada del monitor baja de orden de magnitud en bytes. Eso le corresponde a `apexos-qa`, con manifiesto de alcance propio para cada promoción.

## 6. No verificable

- **Latencia de extremo a extremo del endpoint desplegado.** No se autenticó contra la API de producción con credenciales de un usuario real; la medición es de base de datos y de serialización del viaje. El orden de magnitud (36 MB por llamada) es sólido, el número exacto de milisegundos percibidos por el navegador queda por confirmar en la certificación.
- **Causa de la escritura de `identity_photo` en `GpsPing`.** Se confirmó que el servidor la acepta y cuánto pesa; no se identificó qué versión del cliente móvil la envía ni desde qué fecha. Requiere el registro del cliente.
- **Gráfica de consumo de Supabase por período.** El dashboard de la organización no es accesible desde este puesto.

## 7. Cierre medido del paquete 1 (2026-11-19, `desarrollo`)

Este apartado lo escribe la intervención corrective, no la auditoría: el cuerpo de hallazgos de arriba queda
como el momento del dictamen. Evidencia: `docs/qa/evidence/hr-monitor-evidence-by-reference-20261118/` y
brief `docs/briefs/2026-11-18-monitor-marcaciones-evidencia-por-referencia.md`.

| Hallazgo | Estado tras el paquete 1 | Medición que lo cierra |
|---|---|---|
| MAR-101 | **CERRADO** — `readDayEvidencePunches` proyecta `metadata` con la misma guarda que `readRoutePunchEvidence`, ahora una sola función compartida por las cinco lecturas (`evidenceFreeMetadata`). | PROD, día 2026-11-18 del tenant del cliente: 22.752.445 B → 50.735 B, 7.743 ms → 941 ms, 53 ids idénticos, 27 evidencias contadas antes y después, 0 filas con base64 largo. |
| MAR-102 | **CERRADO** — la premisa «`metadata` mide 532/575 B» se retiro del archivo y la columna sale cruda solo si `pg_column_size` esta bajo el umbral; el contador `has_extra_evidence` sigue sin abrir `extra_evidence`. | `projection-sql.txt`: las cinco lecturas con `proyecta_metadata=true`, `extra_evidence` con una sola referencia y esa es `pg_column_size`. |
| MAR-104 | **CERRADO, pero por otro mecanismo.** La recomendación («aplicar la barrera de subida al escritor de GPS») **no se implemento**: se retiro del contrato. Una marcación es la unica fila duena del sustento visual; las seis escrituras derivadas (`gpsPing`, `activityGps`, `activityPings`, `createGpsPing`, `createOwnGpsPing`, `WorkSession.start_location`) dejan de copiar `identity_photo`/`extra_evidence`/`photo`. | `hr-gps-metadata-projection.test.js` (6/6): con una selfie de 4 KB en las tres ramas, `createGpsPing` no persiste ninguna y conserva `route_code`, `employee_code`, `gps_required` e identidades. `[{ owner: true }]` aparece una sola vez y dentro del bloque `tx.timePunch.create`. |
| MAR-105 | **CAMBIADO DE ENFOQUE — el rescate de `GpsPing` ya no hace falta.** Se verifico el binario de las 45 filas con selfie: es **copia exacta** de la que ya subio la marcación duena (2.699.051 B del ping = 2.699.051 B de su marcación). Subirlo otra vez al bucket duplicaria el objeto para despues borrarlo. La purga se hace por emparejamiento SHA-256 contra `TimePunch`, sin subida. | `gpsping-metadata-selfie`: 45 filas, 29,3 MB, `filas_con_esta_marcacion: 45`, `sin_binario_inalcanzable: 0`. |
| MAR-106 | **CERRADO con la puerta que el propio hallazgo pedia.** El umbral `METADATA_SHRINK_MIN_BYTES = 8192` queda en la constante y en la prueba de presupuesto (debe caer entre 4.761 B y 75.000 B: el peor caso medido por debajo del umbral no detoastearia). | Presupuesto de respuesta del lote: `produccion-antes-despues-dia.json`. |
| MAR-108 | **CERRADO** — la difusion ya no depende de que cada escritor recuerde despojar la selfie; el filtro vive en `routeEventMetadata` y `ActivityEvidence` queda como unica tabla con `storage_path` propio. | Diff del contrato en `service.js:442-462`; suite HR 262/262. |
| MAR-103 | **CERRADO** — ver §8: los dos `catch {}` del monitor se vuelven estado del dato con hora de ultima lectura, el panel distingue *cargando* / *sin lectura* / *sin eventos* y los contadores conservan `null` cuando ninguna fuente afirmo. | `apps/web/test/hr-monitor-stale-read.test.mjs` (7/7) + `docs/qa/evidence/hr-monitor-byte-budget-20261118/suites-y-medicion.txt`. |
| MAR-107 | **ABIERTO** — paridad de grants `service_role`; paquete 4 con su propia autorización de nube. | — |
| MAR-109 | **CERRADO** — ver §8: `listAttendance` y `processDay` leen `readPunchRowsProjected` y `getRouteTracking` pasa a `SELF_PUNCH_SELECT`; el aviso `has_extra_evidence` + `publicPunchMetadata` conserva el conteo y la apertura por id. | PROD, mismo dia y tenant del cliente: 31.366 KB → 78 KB (400,5x), 2.916 ms → 736 ms (4x), 53 ids iguales, selfies 27=27, soporte 9=9, 0 filas con binario. `rango-production-2026-11-18.json`. |

### Correcciones al cuerpo de este documento

1. **MAR-105 decia 44 filas / 27,8 MB; la medida del 2026-11-19 da 45 filas / 29,3 MB.** La diferencia es el trafico del dia siguiente, no un error de conteo. La conclusion no cambia: ninguna bandera de rescate en `GpsPing` en ningun ambiente.
2. **No existio nunca `gpsIngest.js`.** El brief de esta intervención lo citaba como si este documento lo nombrara en MAR-109. Cero coincidencias en el repo. El camino real por el que el GPS recibio la selfie es `routeEventMetadata` sin filtro, ya cerrado arriba.
3. **La hipotesis del `storage_path` fantasma en `ActivityEvidence` queda descartada.** Se contrasto fila por fila: 106 de 106 con binario inline tienen bandera de rescate y su objeto existe en Storage con la misma longitud de bytes (muestra: ids 40/42/44, 2.494.899 B inline = 2.494.899 B en el objeto). Lo que pesa ahi es la **copia** que el rescate no borro, no una referencia falsa. Por eso el corte `NOT VALID` de la tabla si puede ir por bandera, y el de `GpsPing` no.
4. **El numero que manda en disco es `TimePunch.extra_evidence`, no `metadata`:** 242,1 MB del total de 374,3 MB con binario. El paquete 1 ataca el viaje, no el disco; la purga C.2 sigue aplazada hasta que el lector este desplegado.

## 8. Cierre medido de los paquetes 2 y 3 (2026-11-19, `desarrollo`)

Igual que el apartado anterior: lo escribe la intervención corrective sobre el tip publicado de `desarrollo`, no la auditoría. Evidencia en `docs/qa/evidence/hr-monitor-byte-budget-20261118/`.

### MAR-109 — las dos lecturas que quedaban

El reporte de asistencia (`listAttendance`), el cierre de jornada (`processDay`) y el seguimiento de ruta (`getRouteTracking`) pedian la fila cruda. Ahora pasan por el mismo lector proyectado que el monitor, y el aviso que ve la pantalla se arma en el servicio (`announceProjectedPunchEvidence` + `publicPunchMetadata`), no en la pantalla.

Medido en **producción**, el mismo día, el mismo tenant y la misma ventana de 24 horas, con el código del producto en los dos lados (`scripts/performance/timepunch-range-read-probe.js`, tres muestras, mediana):

| Lado | Filas | Bytes de la respuesta | ms | Selfies contadas | Soportes contados | Filas con base64 largo |
|---|---|---|---|---|---|---|
| Crudo (comportamiento anterior) | 53 | 32.119.048 (31.366 KB) | 2.916 | 27 | 9 | 27 |
| Proyectado (comportamiento actual) | 53 | 80.193 (78 KB) | 736 | 27 | 9 | **0** |

Factor medido: **400,5x menos bytes y 4x menos tiempo**, con los 53 ids idénticos. La sonda **aborta** si la proyección pierde ids, selfies o soportes, así que el número no se puede publicar incompleto: la primera corrida de la puerta produjo exactamente ese aborto (`27 -> 0`) y obligó a medir con el lector real y no con el texto del SQL, que es como se habría colado el reporte en «Sin evidencia fotográfica».

### Paquete 2 — la puerta de presupuesto, con rojo demostrado

`npm run certify:hr-monitor-budget:selftest` fija tres topes (4 MiB por listado, p95 de 3.000 ms, ningún `data:…;base64,` de más de 8 KB dentro de un listado) y demuestra los dos sentidos sin red: el listado gordo del incidente cae en rojo por volumen y por binario inline (`46.556.774 bytes`, `2.097.175 caracteres`), uno lento cae en rojo por p95, y el listado anunciado por referencia pasa en verde. Salida versionada en `selftest-gate.txt`.

La corrida contra el ambiente desplegado (`certify:hr-monitor-budget:qa` / `:production`, con `--fixture` de la certificación E2E) sigue pendiente: no existe evidencia de navegador ni de API desplegada hasta los paquetes 6 y P-A/P-B, y así queda declarado en el brief.

### Paquete 3 — el contrato de estados en `apps/web`

- `loadMonitor` y `loadEventSummaries` dejan de terminar en `catch {}`: registran la hora de la última lectura válida y marcar el intento fallido, y la banda `role="alert"` dice «lo que se muestra es la lectura de las HH:mm» o «aún no hay lectura de este día», con el reintento automático que ya existía.
- El panel vacío pasa de tres estados: *cargando* (primera lectura del día), *sin lectura reciente* (el último intento no respondió) y *sin eventos* (la fuente afirmó cero). El vacío deja de afirmarse como ausencia de marcaciones.
- Los contadores conservan `null` cuando ninguna fuente respondió por el horario (`punch_count`/`event_count`/`evidence_count` nulos en el tipo, `?? null` en la fusión, etiqueta «sin lectura» en la pantalla) y `0` solo cuando la fuente lo afirmó. Pruebas: `apps/web/test/hr-monitor-stale-read.test.mjs` (7/7).

### Lo que esta medición todavía no dice

El número de arriba es de base de datos y serialización con el lector del producto, no del navegador contra el build desplegado: el `delay` percibido por el usuario se certifica en QA (paquete 6) y en producción (P-B). La latencia del endpoint de evidencia por id (`/hr/monitor-evidence/:source/:id`) se sigue midiendo en la certificación E2E, y la purga del binario ya rescatado (`extra_evidence` 235,9 MB + `metadata` 21,9 MB + `ActivityEvidence` 72,5 MB) conserva su dependencia del lector desplegado.
