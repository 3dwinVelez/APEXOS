# Hallazgos — Marcaciones

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama | `desarrollo` |
| Commit | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Base | `03-matriz-funcional-marcaciones.md` (MAR-F01…F27) |
| Estado | F2 — verificación de código y migraciones; reproducción con datos pendiente |
| Modo | Solo lectura |

## Resumen

| ID | Título | Severidad | Tipo | Confianza | Estado |
|---|---|---|---|---|---|
| MAR-001 | Hora nocturna desfasada: 21:00 en lugar de 19:00 | P0-L / P0-E | calculo | alta | confirmado |
| MAR-002 | La jornada procesada no se genera automáticamente | P0-O | operacion | alta | confirmado |
| MAR-003 | Un solo horario global para todos los trabajadores | P0-O / P1 | control | alta | confirmado |
| MAR-004 | HEDD/HEND por debajo de la norma 2026-H2 | P0-E | calculo | alta | confirmado |
| MAR-005 | Topes de trabajo suplementario no aplicados | P0-L / P1 | norma | alta | confirmado |
| MAR-006 | Marca administrativa sin actor ni vínculo | P1 | control | alta | confirmado |
| MAR-007 | Sin aprobación de novedades de jornada | P0-L / P1 | control | alta | confirmado |
| MAR-008 | Procesamiento frágil sin horario activo | P1 | calculo | alta | confirmado |
| MAR-009 | Jornada partida no soportada | P1 | calculo | alta | confirmado |
| MAR-010 | Reporte de extras y nómina no cuadran | P0-E / P1 | calculo | alta | confirmado |
| MAR-011 | Fallback que vacía la vista | P1 | control | alta | confirmado |
| MAR-012 | Parametrización nocturna duplicada e inconsistente | P1 | control | alta | confirmado |

## Hallazgos

```yaml
id: MAR-001
severidad: P0-L / P0-E
tipo: calculo
requisito: "MAR-N01 — jornada nocturna 19:00–06:00 (Ley 2466/2025 art. 10)"
esperado: "Todo minuto entre 19:00 y 06:00 se clasifica como nocturno y recibe 35%."
observado: >-
  processDay pasa DEFAULT_PARAMS con night_start='21:00' y timeLogic usa 21:00 por defecto.
  policy.js define 19:00 pero splitDayNightSegments no se usa en el procesamiento HR.
  Además, DEFAULT_PAYROLL_CONFIG usa 19:00, de modo que la nómina y la marcación no comparten
  la misma hora de corte.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:13"
  - archivo: "apps/api/src/modules/hr/service.js:3613"
  - archivo: "apps/api/src/modules/hr/timeLogic.js:119"
  - archivo: "apps/api/src/modules/hr/policy.js:1-4"
  - archivo: "apps/api/src/modules/hr/service.js:20-44"
  - reproduccion: "Marcar 19:30 y 20:30 en un turno nocturno y revisar ordinary_night_minutes."
  - delta: "2 h/día sin recargo nocturno. Delta diario = 2 × 0.35 × hora ordinaria; con SMMLV 2026 y divisor 210, referencia $5.836/día por trabajador."
impacto: legal / economico
recomendacion: >-
  Unificar la hora nocturna en una sola fuente parametrizada (JORNADA_NOCTURNA_INICIO) y
  consumirla desde processDay y desde la nómina. Reproducir el turno 19:00–06:00 antes de
  cualquier promoción.
dueno: "Talento Humano / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-002
severidad: P0-O
tipo: operacion
requisito: "MAR-N17 — la jornada procesada se genera de forma completa y oportuna"
esperado: "Toda marcación cerrada del día produce ProcessedWorkday antes de liquidar."
observado: >-
  Solo existe POST /hr/workdays/process. No hay cron, cola, job ni llamada desde la UI.
  Si nadie ejecuta el endpoint, la nómina no encuentra días trabajados ni extras.
evidencia:
  - archivo: "apps/api/src/modules/hr/routes.js:113"
  - reproduccion: "Crear una marcación y buscar ProcessedWorkday sin invocar el endpoint manual."
  - delta: "100% de los días y extras del periodo quedan fuera de la liquidación."
impacto: operativo / economico
recomendacion: >-
  Definir el disparador (al cerrar la marcación de salida, job periódico o ambos) y registrar
  el resultado por empleado/día con idempotencia. Monitorear días marcados sin jornada procesada.
dueno: "Talento Humano / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-003
severidad: P0-O / P1
tipo: control
requisito: "MAR-N19 — cada trabajador tiene asignada su jornada aplicable (CST art. 158)"
esperado: "La jornada procesada usa el horario del trabajador."
observado: >-
  processDay carga todos los horarios activos y usa schedules[0]. Employee no tiene
  schedule_id y WorkSchedule no tiene relación con empleados. Los horarios individuales
  se pierden y todos se procesan con el primer horario global.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:3604"
  - archivo: "apps/api/src/modules/hr/service.js:3607"
  - archivo: "apps/api/prisma/schema.prisma:844-872"
  - archivo: "apps/api/prisma/schema.prisma:1081-1095"
  - reproduccion: "Procesar dos empleados con horarios distintos y comparar el corte de extras."
  - delta: "El corte ordinario/extra se calcula con el horario ajeno; el delta depende de la diferencia de jornada."
impacto: operativo / economico
recomendacion: >-
  Asignar horario por empleado (relación explícita o malla) y usar ese horario en processDay.
  Definir precedencia cuando existan horario individual, malla y horario global.
dueno: "Talento Humano / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-004
severidad: P0-E
tipo: calculo
requisito: "MAR-N05/N06 — HEDD 115% y HEND 165% en 2026-H2"
esperado: "HEDD = 2.15 × hora ordinaria; HEND = 2.65 × hora ordinaria."
observado: >-
  DEFAULT_PAYROLL_CONFIG y la semilla usan 105%/2.05 y 155%/2.55. La migración posterior
  solo cambia value_type a factor_total; no corrige percent ni factor.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:42-43"
  - archivo: "apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql:270-271"
  - archivo: "apps/api/prisma/migrations/20260919100000_hr_overtime_concept_value_type/migration.sql:6-9"
  - reproduccion: "Liquidar 1 h HEDD y 1 h HEND en un domingo de octubre 2026."
  - delta: "0.10 × hora ordinaria por cada hora HEDD/HEND. Con divisor 210 y SMMLV 2026, referencia $833,76/hora."
impacto: economico
recomendacion: >-
  Corregir percent/factor de HEDD y HEND con vigencia desde 01-jul-2026, conservando el
  histórico. Añadir prueba de regresión por concepto y fecha.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-005
severidad: P0-L / P1
tipo: norma
requisito: "MAR-N08 — máximo 2 h/día y 12 h/semana (Ley 2466/2025 art. 13)"
esperado: "El sistema bloquea o alerta al superar los topes."
observado: >-
  MAX_HE_DIARIO y MAX_HE_SEMANAL se siembran y se muestran en Configuración laboral,
  pero el API no los lee. No hay validación al marcar, procesar ni liquidar.
evidencia:
  - archivo: "apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql:253-258"
  - archivo: "apps/web/app/dashboard/talento-humano/configuracion-laboral/page.tsx:61-62"
  - reproduccion: "Registrar 3 h extra en un día y 13 h en una semana; verificar bloqueo o alerta."
  - delta: "No cuantificable hasta definir si el producto bloquea o solo alerta."
impacto: legal
recomendacion: >-
  Definir con jurídica si el control es bloqueo o alerta. Implementar la validación en el
  procesamiento de jornada, no solo en la UI, y registrar la excepción cuando exista.
dueno: "Talento Humano / Jurídica"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-006
severidad: P1
tipo: control
requisito: "MAR-N14 — la marcación administrativa identifica al operador"
esperado: "Toda marca creada por tercero conserva actor, motivo y vínculo con la marca original."
observado: >-
  TimePunch no tiene created_by, corrects_punch_id ni estado. createPunch no guarda el
  usuario que registra la marca. La novedad AJUSTE_MANUAL_MARCACION solo se crea si la
  marca es de un día anterior; una marca administrativa del día actual no deja traza.
evidencia:
  - archivo: "apps/api/prisma/schema.prisma:2285-2310"
  - archivo: "apps/api/src/modules/hr/service.js:2814-2885"
  - reproduccion: "Crear una marca administrativa de hoy y buscar el actor en TimePunch y en la bitácora."
  - delta: "No cuantificable; riesgo de no repudio."
impacto: operativo / legal
recomendacion: >-
  Agregar actor, motivo, estado y vínculo de corrección a TimePunch, y registrar la novedad
  para toda marca administrativa, incluida la del día actual.
dueno: "Backend / Talento Humano"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-007
severidad: P0-L / P1
tipo: control
requisito: "MAR-N20 — las novedades se revisan antes de afectar nómina"
esperado: "Una novedad pendiente no altera la liquidación sin aprobación."
observado: >-
  requires_approval existe en el catálogo, pero no hay endpoint de aprobación o rechazo.
  Las novedades se crean en estado pendiente y el motor de nómina las consume sin filtro
  de aprobación.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:379"
  - archivo: "apps/api/src/modules/hr/service.js:3946"
  - archivo: "apps/api/src/modules/hr/routes.js:115-116"
  - reproduccion: "Crear una novedad pendiente y liquidar; verificar si afecta el documento."
  - delta: "El ajuste completo de la novedad entra a nómina sin aprobación."
impacto: legal / economico
recomendacion: >-
  Implementar el ciclo pendiente → aprobada/rechazada con actor y motivo, y exigir estado
  aprobado para que la novedad afecte la liquidación.
dueno: "Talento Humano / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-008
severidad: P1
tipo: calculo
requisito: "MAR-N17 — procesamiento completo y robusto"
esperado: "Procesar un día sin horarios activos sin romper."
observado: >-
  splitPaidIntervals accede a schedule.lunch_start_time y processWorkday a schedule.id sin
  validar que schedule exista. Si el tenant no tiene horarios activos, processDay pasa
  undefined y el endpoint responde 500.
evidencia:
  - archivo: "apps/api/src/modules/hr/timeLogic.js:64"
  - archivo: "apps/api/src/modules/hr/timeLogic.js:172"
  - archivo: "apps/api/src/modules/hr/service.js:3607"
  - reproduccion: "Desactivar todos los horarios y llamar POST /hr/workdays/process."
  - delta: "El día completo queda sin procesar."
impacto: operativo
recomendacion: >-
  Validar la existencia de horario antes de procesar y devolver un error de negocio
  accionable, no un 500. Definir el comportamiento esperado sin horario.
dueno: "Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-009
severidad: P1
tipo: calculo
requisito: "MAR-N17 — la jornada refleja el trabajo real"
esperado: "Soportar dos bloques de entrada/salida en el día."
observado: >-
  processWorkday toma la primera entrada y la primera salida posterior; nextPunchType
  impide una segunda entrada. Una jornada partida se subestima.
evidencia:
  - archivo: "apps/api/src/modules/hr/timeLogic.js:164-177"
  - archivo: "apps/api/src/modules/hr/service.js:3503-3510"
  - reproduccion: "Registrar entrada 08:00, salida 12:00, entrada 14:00 y salida 18:00; comparar horas."
  - delta: "Se pierde el segundo bloque; el delta depende de la duración del bloque omitido."
impacto: economico
recomendacion: >-
  Modelar múltiples intervalos por día y sumar los minutos efectivos. Validar con un caso
  de jornada partida antes de promocionar.
dueno: "Talento Humano / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-010
severidad: P0-E / P1
tipo: calculo
requisito: "MAR-N09 — registro y reporte de trabajo suplementario consistente"
esperado: "El reporte de extras coincide con lo liquidado en nómina."
observado: >-
  El reporte suma TimePunch.extra_minutes, calculado contra route.end_time. La nómina usa
  los buckets overtime_* de ProcessedWorkday, calculados contra el horario y la jornada.
  Son dos fuentes de verdad para el mismo dinero.
evidencia:
  - archivo: "apps/web/app/dashboard/talento-humano/reportes/page.tsx:501"
  - archivo: "apps/api/src/modules/hr/service.js:5388-5402"
  - reproduccion: "Comparar el reporte de extras y la liquidación del mismo día."
  - delta: "|extra_minutes − buckets| × tarifa por hora; caso específico."
impacto: economico / legal
recomendacion: >-
  Unificar la fuente: el reporte debe leer los mismos buckets que la nómina o marcar
  explícitamente la diferencia. Añadir conciliación automática.
dueno: "Talento Humano / Frontend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-011
severidad: P1
tipo: control
requisito: "TRV-03 — las lecturas no caen a un almacén divergente en silencio"
esperado: "Si la API falla, el cliente informa y no sustituye datos."
observado: >-
  /hr/workdays y /hr/schedules devuelven [] en el fallback Supabase. /hr/attendance lee
  time_punches de otro modelo. La vista puede mostrar 'sin jornadas' o datos distintos
  sin error visible.
evidencia:
  - archivo: "apps/web/lib/api.ts:2438-2444"
  - archivo: "apps/web/lib/api.ts:2446-2530"
  - reproduccion: "Apagar la API y abrir las vistas de jornadas y asistencia."
  - delta: "La pantalla muestra 0 jornadas aunque existan en la base operativa."
impacto: operativo
recomendacion: >-
  Reemplazar el fallback silencioso por un estado de error explícito y una marca de origen
  de datos. No mezclar modelos en la misma vista.
dueno: "Frontend / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: MAR-012
severidad: P1
tipo: control
requisito: "Una sola fuente de verdad para la hora nocturna"
esperado: "La configuración visible en la UI cambia el cálculo."
observado: >-
  DEFAULT_PARAMS usa 21:00 para marcaciones; DEFAULT_PAYROLL_CONFIG usa 19:00 para nómina;
  policy.js usa 19:00 sin consumo; JORNADA_NOCTURNA_INICIO se muestra en Configuración
  laboral pero el API no la lee.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:13-18"
  - archivo: "apps/api/src/modules/hr/service.js:20-44"
  - archivo: "apps/api/src/modules/hr/policy.js:1-4"
  - archivo: "apps/web/app/dashboard/talento-humano/configuracion-laboral/page.tsx:59"
  - reproduccion: "Cambiar JORNADA_NOCTURNA_INICIO en la UI y reprocesar un turno nocturno."
  - delta: "El cambio de configuración no altera el cálculo."
impacto: operativo / legal
recomendacion: >-
  Eliminar los valores quemados y consumir el parámetro vigente en marcaciones y nómina.
  Si se conserva la UI, validar que el parámetro exista y tenga vigencia.
dueno: "Backend / Frontend"
confianza: alta
estado: confirmado
```

## Hallazgos transversales que afectan marcaciones

```yaml
id: MAR-013
severidad: P1
tipo: seguridad
requisito: "TRV-01/TRV-02 — aislamiento multi-tenant"
esperado: "Ninguna consulta devuelve filas de otro tenant."
observado: >-
  El middleware de Prisma inyecta tenant_id en los modelos declarados, pero las consultas
  $queryRaw dependen de que cada SQL incluya el filtro. No hay RLS en las tablas HR.
  Una consulta cruda sin tenant_id puede devolver filas de otro tenant; debe probarse en
  marcaciones y en el procesamiento de jornada.
evidencia:
  - archivo: "apps/api/src/core/prisma.js:102-116"
  - archivo: "apps/api/src/modules/hr/service.js:3599-3624"
  - reproduccion: "Consulta cruzada de dos tenants con y sin contexto ALS."
  - delta: "No cuantificable; exposición de datos personales."
impacto: legal / seguridad
recomendacion: >-
  Ejecutar la prueba cruzada de tenants en F2 y documentar el resultado. No promover
  consultas nuevas fuera de runWithTenant.
dueno: "Backend / Seguridad"
confianza: media
estado: hipotesis
```

## Reproducción pendiente (F2)

Para elevar los hallazgos de código a definitivos falta:

1. Tenant QA anonimizado y periodo de prueba definido.
2. Marcaciones de un turno 19:00–06:00, un domingo y un festivo.
3. Empleados con horarios distintos y con jornada partida.
4. Comparación reporte vs. liquidación para el mismo día.
5. Prueba de API caída para verificar el fallback.
6. Prueba cruzada de tenants.
7. Firma jurídica de la matriz normativa.

Ningún hallazgo de este documento se declara cumplido ni corregido: todos son de solo lectura.
