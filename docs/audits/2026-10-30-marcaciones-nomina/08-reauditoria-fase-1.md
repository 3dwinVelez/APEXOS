# Reauditoría Fase 1 — Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 |
| Rama de trabajo | `desarrollo` (candidato reconstruido sobre `develop`) |
| Commit base de la auditoría original | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Commit reauditado | `49394010` (candidato: `0dadb09f` + `9df206b6` + `49394010` sobre `beff5132`) |
| Alcance | Fase 1 del plan de remediación: R-01 a R-10A |
| Insumos | `05-plan-remediacion.md`, `06-veredicto.md`, `07-ejecucion-remediacion.md`, certificación E2E local |
| Veredicto | **Fase 1 APTA para promoción; Fase 2+ sigue pendiente** |
| Vigencia | Aplica al commit reauditado; cualquier cambio posterior exige nueva reauditoría |

## 1. Objetivo y método

La auditoría del 2026-10-30 dejó un veredicto **NO APTO** sobre el commit `e25e177f` y un plan
por fases. Esta reauditoría responde una sola pregunta: **¿está cerrada la Fase 1 —los P0
legal/económicos— en el commit candidato?**

No se releyó el código como en la primera auditoría. Se ejecutó el flujo completo contra
PostgreSQL local y la API HTTP real, sin mocks: marcación → jornada → liquidación → aportes →
cierre. Cada paquete de la Fase 1 tiene al menos una aserción monetaria o de estado contra el
valor legal esperado.

## 2. Resultado por paquete

| Paquete | Hallazgos | Estado | Evidencia |
|---|---|---|---|
| R-01 Hora nocturna 19:00 | MAR-001, MAR-012, NOM-011 | **Cerrado** | Turno 19:00–22:00 clasifica 120 min nocturnos ordinarios + 60 extra nocturnos; `processDay` lee `JORNADA_NOCTURNA_INICIO` por tenant |
| R-02 HEDD/HEND 115%/165% | MAR-004, NOM-002 | **Cerrado** | HEDD = 2,15 × hora y HEND = 2,65 × hora en septiembre 2026; H1 conserva 105/155 |
| R-03 Divisor 220/210 | NOM-003 | **Cerrado** | 220 h hasta 14-jul-2026 y 210 h desde 15-jul-2026, con fila por tenant |
| R-04 Topes y pisos IBC | NOM-001, NOM-018 | **Cerrado** | Tope de 25 SMMLV, piso de 1 SMMLV prorrateado por día; aportes rechaza el salario como respaldo (`409 IBC_REPORTADO_REQUERIDO`) |
| R-05 Cierre con provisiones | NOM-004, NOM-017 | **Cerrado** | El cierre provisiona 4 conceptos, guarda `total_provisions > 0` y la secuencia `validacion → nomina → provisiones → aportes_sociales → cierre` |
| R-06 Libranza idempotente | NOM-005 | **Cerrado** | Doble liquidación con `recalculate` deja un solo movimiento y saldo 800.000 sobre 1.000.000 |
| R-07 Auxilio fuera de prestaciones | NOM-006, NOM-007 | **Cerrado** | Auxilio de 9 días fuera de la base (2.900.000 sin auxilio); sin marcaciones la liquidación responde 422 y la justificación trazable la degrada |
| R-08 Indemnización con SMMLV del periodo | NOM-009 | **Cerrado** | La liquidación de retiro declara `smmlv_referencia_indemnizacion`; no usa `SMLV_CO` |
| R-09 Una sola vía de liquidación | NOM-008 | **Cerrado** | `POST /hr/payroll/process` genera documentos auditables; no queda la tarifa plana 1,25 |
| R-10 Conciliación reporte/nómina | MAR-010 | **Cerrado** | Las 9 jornadas del periodo y las 7 h extra coinciden entre `/hr/workdays`, las líneas HED/HEN/HEDD/HEND y el resumen del documento |
| R-10A Topes de trabajo suplementario | MAR-005 | **Cerrado en modo alerta** | 4 h en un día superan el tope de 2 h; la traza queda en `source_summary` y la validación emite advertencia, no error |

## 3. Defectos que solo aparecieron al ejecutar el flujo

La prueba unitaria cubría fórmulas, pero no el recorrido completo. La certificación E2E encontró
dos defectos reales, ya corregidos en el commit `49394010`:

1. **La línea de libranza perdía su metadata.** `payrollLine` construía una lista fija de campos y
   descartaba `metadata`, de modo que `applyPayrollLibranzaMovements` no encontraba
   `libranza_id`, no insertaba el movimiento del periodo y el saldo nunca se derivaba de los
   movimientos. El desprendible también imprimía ceros. R-06 estaba implementado pero **no se
   ejecutaba**. Ahora la línea persiste la metadata que la identifica.
2. **El reporte de extras leía una fuente distinta a la nómina.** `/hr/workdays` devolvía solo
   jornadas procesadas con `POST /hr/workdays/process`, mientras la nómina liquida desde la
   proyección de marcaciones. Un periodo liquidado podía aparecer con cero horas extra en el
   reporte. El endpoint ahora proyecta con el mismo cargador que la nómina y conserva las
   jornadas procesadas que no tienen marcaciones.

Ninguno de los dos se detectaba con la evidencia de la primera tanda. Su corrección es la prueba
de que R-06 y R-10 necesitaban el recorrido completo, no solo la aserción unitaria.

## 4. Evidencia ejecutada

| Control | Resultado |
|---|---|
| Suite HR (`node --test apps/api/test/hr-*.test.js`) | **236/236** |
| Suite API completa (`apps/api/test/*.test.js`) | **1105 pasan, 4 fallan, 2 omitidas** |
| Fallos de la suite API | Los 4 se reproducen idénticos en el baseline `beff5132` (`accounting-routes-contract`, `authorization-status-codes`, `offline-bootstrap`, `transport-tms-foundation`): dependen de `REDIS_URL`/`.env` y no tocan HR |
| Certificación E2E local (`scripts/certifications/hr-nomina-legal-2026-local.js`) | **11/11** (R-01, R-02/R-03/R-07, R-04, R-10A, R-07, R-06, R-09/R-08, R-05, R-04 aportes, R-10, RBAC/aislamiento) |
| Evidencia | `docs/qa/evidence/nomina-legal-2026-20261113/certification-local.json` |
| Migraciones `20261030120000`, `20261030130000` y `20261113120000` | Aplicadas en PostgreSQL 16 local; la de IBC y la de nómina se ejecutaron dos veces sin duplicar filas |
| Typecheck web | Sin errores |

La certificación cubre además RBAC (401 sin token, 403 sin permiso) y aislamiento: otro tenant
consulta el mismo periodo y no ve los documentos ajenos.

## 5. Lo que la Fase 1 no cierra

Estos puntos siguen abiertos y son la razón por la que el veredicto es **Fase 1 apta**, no
"módulo apto":

| Hallazgo | Fase | Situación tras la Fase 1 |
|---|---|---|
| MAR-002 (sin generación automática de jornada) | 3 (R-17) | La nómina y el reporte ya no dependen de `ProcessedWorkday`: ambos proyectan las marcaciones. Persiste la falta de job/disparador y del monitoreo de días sin procesar |
| MAR-003 (horario único `schedules[0]`) | 3 (R-16) | Sin cambio: no hay asignación de horario por trabajador |
| MAR-006, MAR-007 (actor y aprobación de novedades) | 2 (R-11, R-12) | Sin cambio: una novedad afecta la nómina sin ciclo de aprobación |
| MAR-008, MAR-009, MAR-011, MAR-013 (fallback silencioso, jornada partida, corrección) | 3 (R-18, R-19) | Sin cambio |
| NOM-010, NOM-012, NOM-014, NOM-015 (cierre forzado, ciclo draft→pagado, SoD) | 2 (R-14, R-15) | Sin cambio: el documento sigue naciendo en `draft` y no hay aprobación/pago |
| NOM-013 (retención, PILA, contabilidad) | 4 (R-21…R-23) | Decisión contractual pendiente |
| Firma jurídica/contable de la matriz normativa | — | **Pendiente** |
| Migraciones en la base de nube | — | **No aplicadas**; requieren autorización independiente |

El control de topes de trabajo suplementario quedó en **modo alerta**. La Ley 2466/2025 fija el
tope; convertir la alerta en bloqueo es una decisión jurídica que no se tomó en esta fase y queda
documentada como pendiente.

## 6. Veredicto

**La Fase 1 del plan de remediación está cerrada en el commit `49394010`.** Los catorce
bloqueadores P0 que el veredicto del 2026-10-30 marcó como legal/económicos tienen corrección en
el motor, migración con vigencia y una aserción monetaria que la demuestra en el flujo completo.

Esto **no** declara el módulo apto para producción:

- La Fase 2 (control y trazabilidad) y la Fase 3 (estructura de jornada) siguen abiertas.
- La Firma jurídica y contable no existe.
- Las migraciones no están aplicadas en la base productiva.
- La certificación es local; la QA funcional desplegada y su aprobación son la compuerta
  siguiente del flujo `desarrollo → develop → main`.

El veredicto original se mantiene como historia: aplicaba al commit `e25e177f`. Desde este
documento, el estado es **"Fase 1 apta, Fase 2+ pendiente"**, y la promoción a `main` solo
procede con la aprobación QA del paquete y la declaración explícita de la migración pendiente en
la nube.
