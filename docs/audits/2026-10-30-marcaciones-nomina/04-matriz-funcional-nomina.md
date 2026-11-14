# Matriz funcional — Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama | `desarrollo` |
| Commit | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Documento base | `02-matriz-normativa.md` (NOM-N01…N28) |
| Estado | F1/F2 — reconstrucción AS-IS con evidencia de código; reproducción con datos pendiente |
| Modo | Solo lectura |

> Los estados de esta matriz describen el **código y las migraciones del commit auditado**. La configuración real de cada tenant (parámetros, conceptos, afiliaciones y ajustes) no se consultó; por eso varios estados quedan como `PARCIAL` o `NO VERIFICABLE` hasta ejecutar F2 con datos QA anonimizados.

## 1. Flujo real (AS-IS)

```text
Configuración                 Motor de liquidación                    Persistencia
─────────────                 ────────────────────                    ────────────
th_parametros_laborales  ──►  activeLaborParameterValues(start)
th_conceptos_recargo     ──►  activeSurchargeConcepts(start)
th_nomina_conceptos      ──►  activePayrollConcepts(start)
th_nomina_deducciones    ──►  activeLaborDeductions(start)
th_aportes_parametros    ──►  activeSocialContributionParameters(start)
                                      │
ProcessedWorkday (periodo) ──────────►├─ días, buckets de minutos, extras
th_nomina_ajustes (activos) ─────────►├─ correcciones, novedades, externos
th_libranza_empleados ───────────────►├─ descuentos
                                      ▼
                          buildPayrollLiquidationRows
                            ├─ salario = salario/30 × días pagados
                            ├─ extras = minutos/60 × hora × factor
                            ├─ auxilio de transporte
                            ├─ deducciones empleado (4% / 4%)
                            ├─ IBC segmentado SOLO si hay novedades segmentadas
                            └─ empleador: costo = gross
                                      │
                                      ▼
                          runPayrollLiquidation (status "draft")
                                      │
                                      ▼
                          th_nomina_documentos + Payroll
                                      │
Cierre ──────────────────────────────►├─ runPayrollLiquidation(recalculate)
                                      ├─ runSocialContributions(recalculate)
                                      ├─ NO ejecuta provisiones
                                      └─ total_provisions = 0
                                      ▼
                          th_nomina_cierres_periodo (estado "cerrado")
```

Notas estructurales:

1. **El divisor de hora ordinaria y los factores de recargo dependen de la fecha de inicio del periodo** (`activeLaborParameterValues(start)`, `activeSurchargeConcepts(start)`).
2. **El IBC solo pasa por topes y pisos cuando existen novedades segmentadas.** Sin novedades, la base se toma en bruto.
3. **El cierre no provisiona prestaciones.** El paso "provisiones" aparece en `source_summary.steps`, pero `runSocialBenefitProvisions` no se invoca y `total_provisions` se lee de una columna que no existe en `th_nomina_documentos`.
4. **Los documentos de nómina nacen y permanecen en `draft`.** No hay transición a aprobado, pagado o contabilizado.

## 2. Matriz funcional

Estados: `CUMPLE`, `PARCIAL`, `NO CUMPLE`, `NO VERIFICABLE`, `GAP DE ALCANCE`. La columna `Reproducción` indica la prueba mínima para elevar el estado a definitivo.

| ID | Requisito | Esperado | Observado | Evidencia | Estado | Sev. cand. | Reproducción |
|---|---|---|---|---|---|---|---|
| NOM-F01 | NOM-N01 — salario mínimo y auxilio 2026 | Devengo mínimo de $2.000.000 con auxilio para quien califica | Fallbacks 2026 correctos ($1.750.905 y $249.095) y semilla con vigencia 2026-01-01; el parámetro es editable por tenant | `apps/api/src/modules/hr/service.js:4963-4968`, `:5214-5215`; migración `20260918190000_hr_social_contribution_exoneration_parameters/migration.sql:5-10` | CUMPLE (código) | — | Liquidar salario mínimo y comparar con $2.000.000 |
| NOM-F02 | NOM-N02 — auxilio no salarial ni base de aportes | Auxilio fuera de IBC y de prestaciones | `affects_ibc=false` correcto, pero la semilla marca `include_in_social_benefits_base: true`; `socialBenefitBaseFromLines` lo incluye en la base de prima, cesantías e intereses | `service.js:4928-4931`, `:4980-4991`; migración `20260918150000_hr_payroll_concepts_detail/migration.sql:34` | PARCIAL | P1-E | Liquidar con auxilio y revisar `base_prestaciones_sociales` |
| NOM-F03 | NOM-N03 — elegibilidad del auxilio hasta 2 SMMLV | Solo quien gana hasta 2 SMMLV; proporcional a días | Compara `salaryBase` contra 2 SMMLV; ignora `transport_allowance_enabled`; los días salen de `daysWorked || periodDays`, no de los días pagados | `service.js:5208-5218`, `:5516-5533` | PARCIAL | P1-E | Liquidar en el límite y un periodo sin marcaciones |
| NOM-F04 | NOM-N04 — IBC con piso 1 y techo 25 SMMLV | Topes y pisos siempre, con o sin novedades | La segmentación solo se ejecuta si `payrollSegmentAdjustments.length > 0`; sin novedades el IBC es `baseIbc + ibcDelta` sin cap ni floor | `service.js:5537-5541`, `:7159`; `configuredSegmentRules` `:6993-7013` | NO CUMPLE | P0-E | Liquidar sin novedades un salario > 25 SMMLV y uno < 1 SMMLV |
| NOM-F05 | NOM-N05 — aportes salud y pensión sobre IBC correcto | 4% empleado; 8.5%/12% empleador sobre IBC topado | En la rama segmentada usa el IBC segmentado; en la rama sin novedades usa la base bruta. Empleado y empleador comparten el mismo defecto de F04 | `service.js:5581-5592`, `:7024-7240` | PARCIAL | P0-E | Comparar aportes contra cálculo manual en ambos extremos |
| NOM-F06 | NOM-N06 — exoneración solo con elegibilidad y soporte | Sin soporte no se exonera | Exige `exoneration_eligible`, soporte, tope de 10 SMMLV y parámetro de empresa elegible; la rama sin segmentos usa valores por defecto del empleado | `service.js:5558-5575`, `:7160-7168`; migración `20260918190000_hr_social_contribution_exoneration_parameters/migration.sql:7` | PARCIAL | P1 | Probar con y sin soporte |
| NOM-F07 | NOM-N07 — fondo de solidaridad por rangos | Tarifa por rango de IBC mensual | Calcula sobre `salaryBaseForDeductions` del documento; en quincena el rango se evalúa sobre media base y no sobre el IBC mensual | `service.js:5586-5597`, `:6867-6886` | PARCIAL | P1-E | Liquidar 6 SMMLV en quincenas y en mes |
| NOM-F08 | NOM-N08 — redondeo PILA | Regla del anexo técnico | `pilaRoundAmount` existe y se aplica a parafiscales y al total sin segmento; no hay archivo PILA que permita verificar el resultado completo | `service.js:7015-7023`, `:7206-7236` | PARCIAL | P1 | Comparar aporte liquidado contra regla manual |
| NOM-F09 | NOM-N09 — tarifas de extras y recargos del periodo | HED 25%, HEN 75%, HEDD 115%, HEND 165% (2026-H2) | HED/HEN correctos; HEDD/HEND en 105%/155%. La semilla de recargos tiene vigencia 2026-09-01, así que periodos anteriores no encuentran concepto y el multiplicador cae a 1 | `service.js:5228-5237`, `:5457-5463`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:262-275`; `20260919100000_hr_overtime_concept_value_type/migration.sql:6-9` | NO CUMPLE | P0-E | Liquidar un domingo con extras en julio y en octubre |
| NOM-F10 | NOM-N10 — divisor de hora ordinaria por vigencia | 220 h hasta 14-jul-2026; 210 h después | Solo se siembra 210 h con vigencia 2026-07-15; para periodos anteriores no hay fila y el código usa 210 por defecto | `service.js:5218`; migración `20260919120000_hr_monthly_ordinary_hours_param/migration.sql:5-7` | NO CUMPLE | P0-E | Liquidar junio 2026 y comparar hora ordinaria |
| NOM-F11 | NOM-N11 — prima de servicios | 30 días por semestre, proporcional | Fórmula `base × días / 360` en el motor de provisiones; no se causa en la liquidación (`addSocialBenefitLines` no se invoca) | `service.js:7372-7389`, `:4994` | PARCIAL | P1 | Provisionar un semestre completo y uno parcial |
| NOM-F12 | NOM-N12 — cesantías | 30 días por año, proporcional | Misma fórmula `base × días / 360`; depende de `base_prestaciones_sociales` que hoy incluye el auxilio (F02) | `service.js:7372-7389`; `:4980-4991` | PARCIAL | P1-E | Provisionar un año y comparar |
| NOM-F13 | NOM-N13 — intereses a las cesantías | 12% anual proporcional | `cesantías × días × 12% / 360`, recalculado sobre el acumulado del periodo | `service.js:7377`, `:7420-7427` | PARCIAL | P1 | Provisionar un mes y comparar |
| NOM-F14 | NOM-N14 — vacaciones | 15 días hábiles por año, proporcional | `base_vacaciones × días / 720`; la base de vacaciones excluye el auxilio | `service.js:7379`, `:7372-7389` | PARCIAL | P1 | Provisionar un año y comparar |
| NOM-F15 | NOM-N15 — provisión separada del pago | Provisión periódica con saldo por trabajador | `runSocialBenefitProvisions` escribe `th_prestaciones_saldos`, pero no se ejecuta desde el cierre ni desde la liquidación | `service.js:7442-7478`, `:7674-7715` | PARCIAL | P1 | Cerrar un periodo y buscar el saldo provisionado |
| NOM-F16 | NOM-N16 — el cierre consolida nómina, aportes y provisiones | Cierre con los tres componentes y totales coherentes | El cierre liquida nómina y aportes, pero no provisiones. `provisionTotalFromPayrollDocuments` lee `doc.total_provisions`, columna inexistente en `th_nomina_documentos`, por lo que el total siempre es 0 | `service.js:7368-7369`, `:7692-7709`; migración `20260918140000_hr_payroll_liquidation_documents/migration.sql`; `20260918180000_hr_payroll_period_closures/migration.sql:14` | NO CUMPLE | P0-O / P1-E | Cerrar un periodo y verificar `total_provisions` y los saldos |
| NOM-F17 | NOM-N17 — reapertura con motivo, actor y autorización | No se reabre sin traza | Guarda `reopened_by` y `reopened_at`, pero el esquema solo recibe `period_key`; no hay motivo ni autorización adicional | `service.js:7717-7729`; `apps/api/src/modules/hr/schema.js:723-731` | NO CUMPLE | P1 | Reabrir y buscar el motivo |
| NOM-F18 | NOM-N18 — no liquidar dos veces sin control | Idempotencia o recálculo explícito | El documento se actualiza por clave única, pero una segunda liquidación sin `recalculate` vuelve a aplicar libranzas: el movimiento se actualiza y el saldo se reduce otra vez | `service.js:5646-5676`, `:4584-4613`; `applyPayrollLibranzaMovements` | PARCIAL | P1-E | Liquidar dos veces con libranza y comparar saldo |
| NOM-F19 | NOM-N19 — ajustes y libranzas con soporte y actor | Cada ajuste con concepto, periodo y actor | La creación guarda `created_by`; la anulación (`DELETE`) marca `anulado` sin actor ni motivo; las libranzas se revierten al recalcular | `service.js:6074-6100`, `:6387-6398`, `:4615-4630` | PARCIAL | P1 | Anular un ajuste y revisar la traza |
| NOM-F20 | NOM-N20 — liquidación de retiro con norma vigente | Indemnización y prestaciones con parámetros vigentes | La condición de alto salario usa `process.env.SMLV_CO`, variable que no se configura en ningún archivo del repositorio; por defecto todo retiro usa 30/20 días | `service.js:5074-5081`; búsqueda de `SMLV_CO` sin otras referencias | NO CUMPLE | P0-E | Liquidar un retiro con salario ≥ 10 SMMLV |
| NOM-F21 | NOM-N21 — retención en la fuente | Procedimiento 1 o 2 con UVT vigente | No existe cálculo ni concepto de retención en el módulo HR | Búsqueda sin coincidencias de `retencion_en_la_fuente`/`UVT` en `apps/api/src/modules/hr` | GAP DE ALCANCE | P1 | Confirmar alcance contractual |
| NOM-F22 | NOM-N22 — archivo PILA | Archivo generado y cuadrado con la liquidación | Solo hay cálculo conceptual y redondeo; no hay exportación de archivo plano | Rutas `apps/api/src/modules/hr/routes.js:187-222`; sin generador | GAP DE ALCANCE | P1 | Confirmar alcance contractual |
| NOM-F23 | NOM-N23 — asiento contable por concepto | Cada línea con código y asiento | Los conceptos y libranzas llevan `debit_account_code`/`credit_account_code`, pero no existe póliza ni asiento | `service.js:4918-4937`, `:4305-4325`; sin módulo de posting | GAP DE ALCANCE | P1 | Confirmar alcance contractual |
| NOM-F24 | NOM-N24 — solo pagar días con soporte | Ausencia no justificada no se paga; descanso sí | El salario usa `paidBaseDays` (correcto), pero auxilio y base de prestaciones usan `daysWorked || periodDays`: sin marcaciones se paga auxilio y se provisiona sobre salario completo | `service.js:5410-5432`, `:5516-5533`, `:4980-4991` | PARCIAL | P1-E | Liquidar un empleado sin marcaciones |
| NOM-F25 | NOM-N25 — costo patronal real | Devengo + aportes patronales + provisiones | `employer_cost: gross` en el motor nuevo y en el legacy | `service.js:5613`, `:4853` | NO CUMPLE | P1 | Comparar con costo manual |
| NOM-F26 | NOM-N26 — segregación de funciones | Liquidar, aprobar y pagar con roles distintos | `requirePermission` permite bypass administrativo; no hay SoD por acción de nómina ni estados de aprobación | `apps/api/src/middleware/rbac.js:268`, `:305-307`; `service.js:5646-5676` | NO CUMPLE | P1 | Un admin liquida y cierra sin segundo actor |
| NOM-F27 | NOM-N27 — cierre forzado con excepción registrada | El forzamiento exige motivo y actor | `input.force !== true` salta la validación; el cierre guarda `validation_summary` pero no el motivo ni la marca de forzamiento | `service.js:7683`; `schema.js:708-721` | NO CUMPLE | P1 | Forzar un cierre y buscar la excepción |
| NOM-F28 | NOM-N28 — auditoría de cálculo con actor y parámetros | Bitácora de liquidación y versión de parámetros | Guarda `created_by` y un resumen de parámetros en `source_summary`; las actualizaciones no registran actor ni versión, y no hay `AuditLog` de nómina | `service.js:5658-5676`, `:5613-5616`; único `auditLog.create` en HR `:1619` | PARCIAL | P1 | Recalcular y comparar la traza |
| NOM-F29 | Control adicional — estado del documento y aprobación/pago | Documento con ciclo aprobado → pagado | El estado se escribe siempre como `draft`; no hay endpoint de aprobación, pago ni contabilización | `service.js:5661-5662`; rutas `routes.js:187-222` | NO CUMPLE | P1 | Buscar transición de estado |
| NOM-F30 | Control adicional — cobertura de pruebas del motor | Casos por concepto y E2E | Existen pruebas de marcación, novedades, aportes y ajustes, pero no hay prueba dedicada de `buildPayrollLiquidationRows`, cierre, retiro ni provisiones | `apps/api/test/hr-payroll-*`, `hr-social-contribution-segments.test.js`, `hr-workday-novelties-*`, `hr-marking-*`; `apps/web/test/ibc-nomina-ui.test.mjs` | NO CUMPLE | P1 | Inventario de pruebas |

## 3. Hallazgos consolidados de nómina

### NOM-001 — IBC sin topes ni pisos cuando no hay novedades segmentadas (P0-E)

- **Esperado:** todo IBC entre 1 y 25 SMMLV (Ley 100/1993 art. 18), con o sin novedades.
- **Observado:** `payrollSegmentAdjustments.length` decide si se ejecuta la segmentación; sin novedades, las deducciones y los aportes usan la base bruta. En `buildSocialContributionRows` ocurre lo mismo: `ibc = baseIbc + ibcDelta` sin cap.
- **Impacto:** un salario superior a 25 SMMLV genera aportes calculados sobre el excedente; un salario bajo el piso genera aportes por debajo del mínimo.
- **Evidencia:** `service.js:5540-5541`, `:5581-5592`, `:7159`; `configuredSegmentRules` `:6993-7013`.
- **Confianza:** alta. **Estado:** confirmado en código; delta depende del salario del caso QA.

### NOM-002 — HEDD/HEND por debajo de la norma 2026-H2 (P0-E)

- **Esperado:** 115% y 165% (2.15 y 2.65 × hora ordinaria).
- **Observado:** 105% / 2.05 y 155% / 2.55 en `DEFAULT_PAYROLL_CONFIG` y en la semilla.
- **Impacto:** 10 puntos de subpago por cada hora extra en domingo o festivo desde 01-jul-2026.
- **Evidencia:** `service.js:42-43`; migración `20260917120000_hr_workday_novelties_foundation/migration.sql:270-271`.
- **Confianza:** alta. **Estado:** confirmado; es el mismo defecto de `MAR-004`.

### NOM-003 — No existe el divisor de 220 horas (P0-E)

- **Esperado:** 220 h para el periodo 01-ene a 14-jul-2026; 210 h desde 15-jul-2026.
- **Observado:** solo se siembra 210 h con vigencia 2026-07-15; el motor cae a 210 para cualquier periodo sin parámetro.
- **Impacto:** toda hora ordinaria, extra y recargo de periodos anteriores al 15-jul-2026 se calcula con un divisor menor, inflando el valor hora.
- **Evidencia:** `service.js:5218`; migración `20260919120000_hr_monthly_ordinary_hours_param/migration.sql:5-7`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-004 — El cierre no provisiona y reporta provisiones en cero (P0-O / P1-E)

- **Esperado:** el cierre consolida nómina, aportes y provisiones.
- **Observado:** `closePayrollPeriod` ejecuta nómina y aportes, no `runSocialBenefitProvisions`; `provisionTotalFromPayrollDocuments` lee `doc.total_provisions`, columna que no existe en `th_nomina_documentos`, así que siempre devuelve 0. El `source_summary.steps` declara "provisiones" sin ejecutarlas.
- **Impacto:** el reporte de cierre muestra provisión cero y los saldos de prestaciones no se generan en el flujo normal.
- **Evidencia:** `service.js:7368-7369`, `:7692-7709`; migraciones `20260918140000_hr_payroll_liquidation_documents/migration.sql`, `20260918180000_hr_payroll_period_closures/migration.sql:14`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-005 — La libranza se descuenta dos veces al relicitar sin recalcular (P1-E)

- **Esperado:** una liquidación repetida no altera el saldo de la libranza.
- **Observado:** el movimiento tiene clave única y se actualiza, pero `balance_amount` se calcula con el saldo ya reducido y se vuelve a restar.
- **Impacto:** doble descuento del saldo de libranza al pulsar "liquidar" dos veces; el empleado queda con saldo menor al real.
- **Evidencia:** `service.js:4584-4613`, `:5646-5676`.
- **Confianza:** alta. **Estado:** confirmado en código; reproducción con datos pendiente.

### NOM-006 — El auxilio de transporte entra en la base de prestaciones (P1-E)

- **Esperado:** auxilio no salarial, excluido de prima, cesantías e intereses (CST art. 128; Ley 1/1967).
- **Observado:** la semilla marca `include_in_social_benefits_base: true`; `socialBenefitBaseFromLines` incluye la línea porque el flag tiene prioridad sobre `salary_constitutive === false`.
- **Impacto:** sobreprovisión de prima, cesantías e intereses por el valor del auxilio.
- **Evidencia:** migración `20260918150000_hr_payroll_concepts_detail/migration.sql:34`; `service.js:4928-4931`, `:4980-4991`.
- **Confianza:** alta. **Estado:** confirmado; el delta depende del auxilio del periodo.

### NOM-007 — Auxilio y provisión sin marcaciones (P1-E)

- **Esperado:** sin días soportados no hay auxilio ni causación de prestaciones.
- **Observado:** el salario usa `paidBaseDays`, pero `liquidationDays = daysWorked || periodDays`; sin jornadas procesadas se pagan 15 días de auxilio y se provisiona sobre el salario completo.
- **Impacto:** pago y provisión sin soporte de jornada; además el cierre no lo bloquea porque `SIN_MARCACIONES` es solo advertencia.
- **Evidencia:** `service.js:5410-5432`, `:5516-5533`, `:4980-4991`, `:5629-5633`.
- **Confianza:** alta. **Estado:** confirmado en código.

### NOM-008 — `employer_cost` no representa el costo patronal (P1)

- **Esperado:** devengo + aportes patronales + provisiones.
- **Observado:** `employer_cost: gross` en el motor nuevo y en el legacy.
- **Impacto:** el costo de nómina subestima aportes y prestaciones; cualquier reporte gerencial basado en ese campo queda corto.
- **Evidencia:** `service.js:5613`, `:4853`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-009 — La indemnización de retiro ignora el parámetro legal (P1-E / P0-E según caso)

- **Esperado:** el régimen de alto salario (≥ 10 SMMLV) reduce los días de indemnización.
- **Observado:** la condición usa `process.env.SMLV_CO`, variable no configurada; por defecto `highSalary` es falso.
- **Impacto:** retiros con salario ≥ 10 SMMLV liquidan 30/20 días en lugar de 20/15.
- **Evidencia:** `service.js:5078`; búsqueda de `SMLV_CO` sin otra referencia.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-010 — Cierre forzable y reapertura sin motivo (P1)

- **Esperado:** el forzamiento y la reapertura dejan motivo, actor y autorización.
- **Observado:** `force` salta la validación; el cierre guarda actor y resumen, no el motivo. La reapertura solo recibe `period_key` y guarda actor/fecha.
- **Impacto:** no se puede reconstruir quién forzó ni por qué; el control de periodo queda débil.
- **Evidencia:** `service.js:7683`, `:7717-7729`; `schema.js:708-731`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-011 — Conceptos con vigencia 2026-09-01 (P1-E)

- **Esperado:** todo periodo liquidable encuentra sus conceptos y recargos.
- **Observado:** `th_conceptos_recargo` y `th_nomina_conceptos` se siembran con `valid_from = 2026-09-01`; para periodos anteriores `activeSurchargeConcepts` devuelve vacío y `surchargeMultiplierFor` retorna 1.
- **Impacto:** una liquidación retroactiva de enero a agosto de 2026 paga extras y recargos sin factor.
- **Evidencia:** migración `20260917120000_hr_workday_novelties_foundation/migration.sql:262-275`; `20260918150000_hr_payroll_concepts_detail/migration.sql:27-40`; `service.js:4885-4902`, `:5228-5237`.
- **Confianza:** alta. **Estado:** confirmado; depende de si el cliente liquida periodos históricos.

### NOM-012 — Documentos sin ciclo de aprobación ni pago (P1)

- **Esperado:** aprobación y pago separados de la liquidación.
- **Observado:** `runPayrollLiquidation` escribe `status: "draft"` en creación y actualización; no hay rutas de aprobación, pago o contabilización.
- **Impacto:** no existe control de aprobación ni estado de pago; el documento no sirve como soporte formal.
- **Evidencia:** `service.js:5661-5662`; rutas `routes.js:187-222`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-013 — Retención, PILA y contabilidad fuera de alcance (GAP)

- **Esperado:** retención en la fuente cuando aplica, archivo PILA y asiento contable.
- **Observado:** no hay cálculo de retención, no hay archivo plano PILA y no hay póliza; solo existen códigos contables en metadatos.
- **Impacto:** el módulo no cierra el ciclo tributario ni contable por sí solo.
- **Evidencia:** búsqueda sin coincidencias; `service.js:4918-4937`.
- **Confianza:** alta. **Estado:** gap de alcance; requiere confirmación contractual.

### NOM-014 — Anulación de ajustes sin actor ni motivo (P2)

- **Esperado:** toda anulación conserva actor y motivo.
- **Observado:** `deletePayrollAdjustment` cambia a `anulado` sin registrar usuario ni justificación.
- **Impacto:** no hay no repudio sobre ajustes que afectan dinero.
- **Evidencia:** `service.js:6387-6398`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-015 — Sin segregación de funciones en nómina (P1)

- **Esperado:** liquidar, aprobar y pagar con roles distintos.
- **Observado:** `requirePermission` permite bypass administrativo total y no hay SoD por acción.
- **Impacto:** un administrador puede liquidar, cerrar y reabrir sin segundo actor.
- **Evidencia:** `rbac.js:268`, `:305-307`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-016 — Sin pruebas del motor de nómina (P1)

- **Esperado:** pruebas por concepto, cierre, retiro y prestaciones.
- **Observado:** solo hay pruebas de ajustes, aportes y alias; el motor de liquidación no tiene prueba dedicada.
- **Impacto:** los defectos P0-E no tienen red de seguridad.
- **Evidencia:** `apps/api/test/hr-payroll-*`, `hr-social-contribution-segments.test.js`; `apps/web/test/ibc-nomina-ui.test.mjs`.
- **Confianza:** alta. **Estado:** confirmado.

### NOM-017 — Código de prestaciones muerto (P2)

- **Esperado:** una sola vía de causación de prestaciones.
- **Observado:** `addSocialBenefitLines` está definido y nunca se invoca; la provisión vive en un módulo separado que el cierre no llama.
- **Impacto:** confusión de mantenimiento y expectativa falsa de que la liquidación causa prestaciones.
- **Evidencia:** `service.js:4994`; sin llamadas.
- **Confianza:** alta. **Estado:** confirmado.

## 4. Pruebas mínimas para cerrar F2 (nómina)

1. Salario mínimo 2026: devengo total $2.000.000 con auxilio.
2. Auxilio en el límite de 2 SMMLV: elegibilidad y proporcionalidad.
3. IBC en los cuatro extremos (bajo 1 SMMLV, entre 1 y 25, sobre 25, con y sin novedades).
4. Aportes salud/pensión contra cálculo manual en los cuatro extremos.
5. Fondo de solidaridad en 4, 16 y 20 SMMLV, en mes y en quincena.
6. HED/HEN/HEDD/HEND en julio y en octubre de 2026.
7. Divisor 220 h en junio y 210 h en agosto.
8. Prima, cesantías, intereses y vacaciones de un semestre completo y uno parcial.
9. Cierre de un periodo: nómina + aportes + provisiones + totales.
10. Doble liquidación con libranza: saldo antes y después.
11. Retiro con salario ≥ 10 SMMLV: días de indemnización.
12. Empleado sin marcaciones: salario, auxilio y provisión.
13. Reapertura y cierre forzado: motivo, actor y autorización.
14. Comparar `employer_cost` contra costo patronal manual.
15. Verificar que no existan documentos en estado distinto de `draft`.

## 5. Criterio de cierre de F1/F2 (nómina)

- [x] Requisitos NOM-N01…N28 traducidos a observación con evidencia.
- [x] Defectos P0-E identificados y acotados a código/migración.
- [x] Brechas de alcance separadas de defectos.
- [ ] Reproducción con datos QA anonimizados (bloquea el delta económico).
- [ ] Confirmación de configuración real por tenant (parámetros, conceptos, afiliaciones).
- [ ] Firma jurídica/contable de la matriz normativa.
