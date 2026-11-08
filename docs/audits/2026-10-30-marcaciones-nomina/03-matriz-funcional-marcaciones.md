# Matriz funcional — Marcaciones

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama | `desarrollo` |
| Commit | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Documento base | `02-matriz-normativa.md` (MAR-N01…N20) |
| Estado | F1/F2 — reconstrucción AS-IS con evidencia de código; reproducción con datos pendiente |
| Modo | Solo lectura |

## 1. Flujo real (AS-IS)

```text
Operario                API                         Persistencia
────────                ───                         ────────────
POST /hr/self/time-punches
  └─ createOwnPunch ──► assertOwnAssignedRoute
                        (tenant, ruta del día, ventana ±)
                        createPunch
                          ├─ advisory lock por empleado/ruta/día
                          ├─ idempotency_key
                          ├─ secuencia entrada→almuerzo→salida
                          ├─ extra_minutes por route.end_time
                          ├─ GPS ping (si hay coordenadas)
                          └─ WorkSession
                                                   TimePunch, GpsPing,
                                                   WorkSession

Administrador
POST /hr/time-punches ──► createPunch (mismo flujo, sin ventana)
POST /hr/workdays/process ► processDay
                            ├─ employees activos
                            ├─ schedules activos → schedules[0]
                            ├─ timePunch del día
                            ├─ DEFAULT_PARAMS (noche 21:00)
                            └─ processWorkday
                                                   ProcessedWorkday
                                                   (8 buckets de minutos)
Nómina
POST /hr/payroll/liquidations ► buildPayrollLiquidationRows
                                ├─ ProcessedWorkday del periodo
                                ├─ multiplicadores de th_conceptos_recargo
                                └─ líneas HED/HEN/HEDD/HEND/RECARGO/DOM_FEST
```

Hallazgo estructural: **la malla (`TimeRoute`) no alimenta el procesamiento de jornada**. `processDay` usa `WorkSchedule` y toma el primer horario activo global. `TimeRoute` solo se usa después, en nómina, para días de descanso y para el reporte operativo.

## 2. Matriz funcional

Estados: `CUMPLE`, `PARCIAL`, `NO CUMPLE`, `NO VERIFICABLE`, `GAP DE ALCANCE`. La columna `Reproducción` indica la prueba mínima para elevar el estado a definitivo.

| ID | Subflujo | Esperado | Observado | Evidencia | Estado | Sev. cand. | Reproducción |
|---|---|---|---|---|---|---|---|
| MAR-F01 | Clasificación nocturna | Noche desde 19:00 | `processDay` pasa `DEFAULT_PARAMS` con `night_start: "21:00"`; `timeLogic` usa 21:00 por defecto | `apps/api/src/modules/hr/service.js:13`, `:3613`; `apps/api/src/modules/hr/timeLogic.js:119` | NO CUMPLE | P0-L / P0-E | Marcar 19:30–20:30 y verificar bucket nocturno |
| MAR-F02 | Recargo nocturno | 35% adicional | Depende de `th_conceptos_recargo`; semilla 35%, pero solo se aplica a minutos clasificados después de 21:00 | `apps/api/src/modules/hr/service.js:4885`, `:5228`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:267` | PARCIAL | P0-E | Liquidar un turno 19:00–23:00 |
| MAR-F03 | Recargo dominical/festivo | 90% desde 01-jul-2026 | Semilla `DOM_FEST_DIURNO` 90% y `DOM_FEST_NOCTURNO` 125%; depende de la clasificación de día especial | Migración `20260917120000_hr_workday_novelties_foundation/migration.sql:267`; `timeLogic.js:118` | PARCIAL | P0-E | Liquidar un domingo diurno y uno nocturno |
| MAR-F04 | Horas extra diurnas/nocturnas | 25% / 75% | Semilla 25%/1.25 y 75%/1.75; migración posterior las marca `factor_total` | Migración `20260919100000_hr_overtime_concept_value_type/migration.sql:6`; `service.js:5228` | PARCIAL | P0-E | Liquidar 1 h HED y 1 h HEN |
| MAR-F05 | Hora extra dominical diurna | 115% en 2026-H2 | Configuración y semilla usan 105%/2.05 | `service.js:42`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:267` | NO CUMPLE | P0-E | Liquidar 1 h HEDD y comparar con 2.15 × hora |
| MAR-F06 | Hora extra dominical nocturna | 165% en 2026-H2 | Configuración y semilla usan 155%/2.55 | `service.js:43`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:267` | NO CUMPLE | P0-E | Liquidar 1 h HEND y comparar con 2.65 × hora |
| MAR-F07 | Divisor de hora ordinaria | 220 h hasta 14-jul-2026; 210 h después | Solo existe fila de 210 h desde 15-jul-2026; el código cae a 210 para todo periodo sin parámetro | Migración `20260919120000_hr_monthly_ordinary_hours_param/migration.sql:6`; `service.js:5218` | NO CUMPLE | P0-E | Liquidar un periodo de junio 2026 |
| MAR-F08 | Topes de extras | 2 h/día y 12 h/semana | Los parámetros se siembran y se muestran en la UI, pero el API no los lee ni bloquea | Migración `20260917120000_hr_workday_novelties_foundation/migration.sql:253`; búsqueda sin uso en `apps/api/src` | NO CUMPLE | P0-L / P1 | Marcar 3 h extra en un día y 13 h en una semana |
| MAR-F09 | Registro de trabajo suplementario | Registro con trabajador, actividad, horas y carácter diurno/nocturno | El reporte suma `TimePunch.extra_minutes` (calculado por `route.end_time`), no los buckets de jornada; no hay campo de actividad en el registro | `service.js:2783`; `apps/web/app/dashboard/talento-humano/reportes/page.tsx:501` | PARCIAL | P0-L / P1 | Comparar reporte de extras contra nómina |
| MAR-F10 | Trazabilidad de la marcación | Actor, fecha y motivo en toda marca | `TimePunch` no tiene `created_by`, `corrects_punch_id` ni estado; la marca administrativa del día actual no deja novedad | `apps/api/prisma/schema.prisma:2285`; `service.js:2876` | NO CUMPLE | P1 | Crear marca administrativa hoy y buscar el actor |
| MAR-F11 | Corrección con justificación y aprobación | Corrección motivada y aprobada | No hay endpoint de corrección/anulación de `TimePunch`; la corrección de jornada es un ajuste de nómina con `created_by`, sin aprobación | `service.js:6183`, `:6259`; rutas `apps/api/src/modules/hr/routes.js:110-116` | PARCIAL | P0-L / P1 | Corregir una marca y verificar el flujo |
| MAR-F12 | Inmutabilidad de la jornada | No alterar sin traza | No hay endpoint de actualización/borrado de marcas; el borrado físico de malla sí escribe `AuditLog`, pero las marcas no | `service.js:1619` (único `auditLog.create` en HR) | PARCIAL | P1 | Revisar bitácora de una marca |
| MAR-F13 | Autoservicio anclado al usuario | No marcar por otro | `ownOperationalInput` fuerza `employee_id` del usuario autenticado | `service.js:3068-3081`, `:3083-3087` | CUMPLE | — | Intento de suplantación |
| MAR-F14 | Actor en marca administrativa | Registrar quién marcó por otro | `createPunch` no guarda `user.id` en `TimePunch`; solo la novedad de día anterior lo hace | `service.js:2814-2864`, `:2876-2885` | NO CUMPLE | P1 | Marca administrativa misma fecha |
| MAR-F15 | Datos personales (GPS/evidencia) | Acceso restringido y retención definida | Acceso por tenant y rol; evidencia se guarda inline en base64; no hay política de retención | `service.js:178-199`; `schema.prisma:2285` | PARCIAL | P1 | Revisar retención y acceso |
| MAR-F16 | Offline e idempotencia | Sin duplicar ni perder | Cola en `localStorage`, `idempotency_key`, lock por empleado/ruta/día y reintentos | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx:88`, `:223`; `service.js:2689`, `:2721-2735` | CUMPLE | — | Replay y corte de red |
| MAR-F17 | Generación de jornada procesada | Automática y oportuna | Solo `POST /hr/workdays/process`; no hay cron, cola ni llamada desde la marcación ni desde la UI | `routes.js:113`; sin referencias en `apps/web` | NO CUMPLE | P0-O | Marcar y verificar si aparece `ProcessedWorkday` |
| MAR-F18 | Descanso y festivos | Calendario y descanso aplicados | `processDay` solo usa `input.holidays`; no lee `th_calendario_dias`; el descanso se resuelve en nómina vía `TimeRoute.kind='descanso'` | `service.js:3608`; `service.js:5259` | PARCIAL | P1 | Procesar un festivo sin enviar `holidays` |
| MAR-F19 | Jornada por trabajador | Horario asignado a cada persona | `Employee` no tiene `schedule_id`; `WorkSchedule` no tiene empleados; se usa `schedules[0]` | `schema.prisma:844-872`, `:1081-1095`; `service.js:3604`, `:3607` | NO CUMPLE | P0-O / P1 | Dos empleados con horarios distintos |
| MAR-F20 | Aprobación de novedades | Novedad pendiente no afecta nómina sin aprobación | `requires_approval` solo se siembra; no hay endpoint de aprobación/rechazo; las novedades se crean en estado `pendiente` | Migración `20260917120000_hr_workday_novelties_foundation/migration.sql:221-246`; `service.js:3946`; rutas solo GET | NO CUMPLE | P0-L / P1 | Crear novedad y buscar aprobación |
| MAR-F21 | Geocerca | Validar ubicación contra sede/ruta | No existe lógica de geocerca en el módulo HR; el GPS se almacena sin validación de radio | Búsqueda sin coincidencias en `apps/api/src/modules/hr` | GAP DE ALCANCE | P2 | Definir si el cliente lo exige |
| MAR-F22 | Jornada partida | Soportar dos bloques entrada/salida | `processWorkday` toma la primera entrada y la primera salida posterior; `nextPunchType` no permite una segunda entrada | `timeLogic.js:164-177`; `service.js:3503-3510` | NO CUMPLE | P1 | Marcar dos bloques en un día |
| MAR-F23 | Malla sin horario activo | No romper el procesamiento | `splitPaidIntervals` accede a `schedule.lunch_start_time` sin validar `schedule`; `processDay` pasa `undefined` si no hay horarios | `timeLogic.js:64`; `service.js:3607` | NO CUMPLE | P1 | Procesar un día sin horarios activos |
| MAR-F24 | Consistencia de reportes | Reporte y nómina deben cuadrar | Reporte usa `extra_minutes` por ruta; nómina usa buckets de `ProcessedWorkday`; pueden diferir | `reportes/page.tsx:501`; `service.js:5388-5402` | NO CUMPLE | P0-E / P1 | Comparar ambos para un mismo día |
| MAR-F25 | Fallback de lecturas | No sustituir datos en silencio | `/hr/workdays` y `/hr/schedules` devuelven `[]` en el fallback Supabase; `/hr/attendance` lee `time_punches` de otro modelo | `apps/web/lib/api.ts:2438-2444`, `:2446-2530` | NO CUMPLE | P1 | Apagar la API y abrir la vista |
| MAR-F26 | Permisos de marcación y nómina | Segregación de funciones | `requirePermission` permite bypass administrativo total; no hay SoD por acción | `apps/api/src/middleware/rbac.js:268`, `:305-307` | PARCIAL | P1 | Un admin marca, liquida y cierra |
| MAR-F27 | Cobertura de pruebas | Flujo marcación → jornada → nómina | No hay pruebas de `processDay` ni E2E del flujo; sí hay pruebas de concurrencia de marcación | Búsqueda sin coincidencias en `apps/api/test`; `apps/web/test` | NO CUMPLE | P1 | Inventario de pruebas |

## 3. Hallazgos consolidados de marcaciones

### MAR-001 — Hora nocturna desfasada 2 horas (P0-L / P0-E)

- **Esperado:** noche 19:00–06:00 (Ley 2466/2025 art. 10).
- **Observado:** `processDay` usa 21:00; `timeLogic` también usa 21:00 por defecto. `policy.js` define 19:00 pero no se usa en el procesamiento.
- **Impacto:** todo minuto entre 19:00 y 21:00 se paga como diurno. En un turno 19:00–06:00 se pierden 2 h de recargo nocturno por día.
- **Evidencia:** `service.js:13`, `:3613`; `timeLogic.js:119`; `policy.js:1-4`.
- **Confianza:** alta. **Estado:** confirmado en código; reproducción con datos pendiente.

### MAR-002 — La jornada procesada no se genera sola (P0-O)

- **Esperado:** toda marcación cerrada produce jornada procesada antes de nómina.
- **Observado:** solo el endpoint manual `POST /hr/workdays/process`; sin cron, cola ni llamada desde la UI.
- **Impacto:** si nadie llama el endpoint, la nómina paga ausencias o cero extras. Es un bloqueo operativo del flujo crítico.
- **Evidencia:** `routes.js:113`; sin referencias en `apps/web`; sin pruebas.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-003 — Un solo horario global para todos (P0-O / P1)

- **Esperado:** cada trabajador con su jornada.
- **Observado:** `schedules[0]` y `Employee` sin asignación de horario.
- **Impacto:** empleados con horarios distintos se procesan con el mismo corte ordinario/extra.
- **Evidencia:** `service.js:3604`, `:3607`; `schema.prisma:844-872`, `:1081-1095`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-004 — HEDD/HEND por debajo de la norma 2026-H2 (P0-E)

- **Esperado:** 115% y 165% → 2.15 y 2.65 × hora ordinaria.
- **Observado:** 105%/2.05 y 155%/2.55.
- **Impacto:** subpago de 10 puntos por cada hora extra en domingo/festivo desde 01-jul-2026.
- **Evidencia:** `service.js:42-43`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:267`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-005 — Topes de extras no aplicados (P0-L / P1)

- **Esperado:** máximo 2 h/día y 12 h/semana (Ley 2466/2025 art. 13).
- **Observado:** parámetros sembrados y visibles en UI, sin lectura en el API.
- **Impacto:** el sistema liquida y paga jornadas por encima del tope legal sin alerta ni bloqueo.
- **Evidencia:** migración `20260917120000_hr_workday_novelties_foundation/migration.sql:253-258`; búsqueda sin uso en `apps/api/src`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-006 — Marca administrativa sin actor ni vínculo (P1)

- **Esperado:** toda marca creada por tercero conserva actor, motivo y vínculo con la marca original.
- **Observado:** `TimePunch` sin `created_by`/`corrects_punch_id`; la novedad `AJUSTE_MANUAL_MARCACION` solo se registra si la marca es de un día anterior.
- **Impacto:** no hay no repudio para marcas del día actual; una corrección no se puede reconstruir.
- **Evidencia:** `schema.prisma:2285-2310`; `service.js:2814-2885`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-007 — Sin aprobación de novedades (P0-L / P1)

- **Esperado:** novedad revisada antes de afectar nómina.
- **Observado:** `requires_approval` en catálogo, sin flujo de aprobación; solo GET de novedades.
- **Impacto:** una novedad creada altera la liquidación sin control.
- **Evidencia:** `service.js:379`, `:3946`; `routes.js:115-116`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-008 — Procesamiento frágil sin horario (P1)

- **Esperado:** procesar sin horarios activos sin romper.
- **Observado:** `schedule.lunch_start_time` sin guarda; `schedule.id` sin guarda.
- **Impacto:** 500 en `processDay` si el tenant no tiene horarios activos.
- **Evidencia:** `timeLogic.js:64`, `:172`; `service.js:3607`.
- **Confianza:** alta. **Estado:** confirmado en código.

### MAR-009 — Jornada partida no soportada (P1)

- **Esperado:** dos bloques de entrada/salida en el día.
- **Observado:** solo la primera entrada y la primera salida posterior; secuencia impide segunda entrada.
- **Impacto:** se subestiman horas trabajadas en jornadas partidas.
- **Evidencia:** `timeLogic.js:164-177`; `service.js:3503-3510`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-010 — Reporte y nómina no cuadran (P0-E / P1)

- **Esperado:** el reporte de extras coincide con lo liquidado.
- **Observado:** el reporte suma `TimePunch.extra_minutes` por `route.end_time`; la nómina usa `ProcessedWorkday.overtime_*` por corte de jornada.
- **Impacto:** dos fuentes de verdad para el mismo dinero.
- **Evidencia:** `reportes/page.tsx:501`; `service.js:5388-5402`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-011 — Fallback que vacía la vista (P1)

- **Esperado:** informar el fallo, no sustituir datos.
- **Observado:** `/hr/workdays` y `/hr/schedules` devuelven `[]`; `/hr/attendance` lee `time_punches` de Supabase.
- **Impacto:** el usuario ve "sin jornadas" o datos de otro modelo sin error.
- **Evidencia:** `apps/web/lib/api.ts:2438-2444`, `:2446-2530`.
- **Confianza:** alta. **Estado:** confirmado.

### MAR-012 — Parametrización nocturna duplicada e inconsistente (P1)

- **Esperado:** una sola fuente de verdad para la hora nocturna.
- **Observado:** `DEFAULT_PARAMS` 21:00 para marcaciones; `DEFAULT_PAYROLL_CONFIG` 19:00 para nómina; `policy.js` 19:00 sin uso; `JORNADA_NOCTURNA_INICIO` visible en UI sin lectura.
- **Impacto:** la configuración que el usuario ve no cambia el cálculo.
- **Evidencia:** `service.js:13-18`, `:20-44`; `policy.js:1-4`; `apps/web/app/dashboard/talento-humano/configuracion-laboral/page.tsx:59`, `:171`.
- **Confianza:** alta. **Estado:** confirmado.

## 4. Pruebas mínimas para cerrar F2 (marcaciones)

1. Turno 19:00–06:00: verificar 2 h nocturnas adicionales y recargo 35%.
2. Domingo diurno y nocturno: verificar 90% y 125%.
3. Domingo con 2 h extra diurnas y 2 h extra nocturnas: verificar 115% y 165%.
4. Periodo de junio 2026: verificar divisor 220 h.
5. Tres horas extra en un día y 13 en una semana: verificar bloqueo o alerta.
6. Dos empleados con horarios distintos: verificar que cada uno usa su horario.
7. Marca administrativa del día actual: verificar actor y no repudio.
8. `processDay` sin horarios activos: verificar que no lanza 500.
9. Dos bloques de marcación en un día: verificar suma de horas.
10. Comparar reporte de extras contra liquidación del mismo día.
