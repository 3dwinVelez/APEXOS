# Hallazgos — Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama | `desarrollo` |
| Commit | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Base | `04-matriz-funcional-nomina.md` (NOM-F01…F30) |
| Estado | F2 — verificación de código y migraciones; reproducción con datos pendiente |
| Modo | Solo lectura |

## Resumen

| ID | Título | Severidad | Tipo | Confianza | Estado |
|---|---|---|---|---|---|
| NOM-001 | IBC sin topes ni pisos cuando no hay novedades segmentadas | P0-E | calculo | alta | confirmado |
| NOM-002 | HEDD/HEND por debajo de la norma 2026-H2 | P0-E | calculo | alta | confirmado |
| NOM-003 | No existe el divisor de 220 horas | P0-E | calculo | alta | confirmado |
| NOM-004 | El cierre no provisiona y reporta provisiones en cero | P0-O / P1-E | control | alta | confirmado |
| NOM-005 | La libranza se descuenta dos veces al relicitar | P1-E | calculo | alta | confirmado |
| NOM-006 | El auxilio de transporte entra en la base de prestaciones | P1-E | calculo | alta | confirmado |
| NOM-007 | Auxilio y provisión sin marcaciones | P1-E | control | alta | confirmado |
| NOM-008 | `employer_cost` no representa el costo patronal | P1 | calculo | alta | confirmado |
| NOM-009 | La indemnización de retiro ignora el parámetro legal | P1-E / P0-E | calculo | alta | confirmado |
| NOM-010 | Cierre forzable y reapertura sin motivo | P1 | control | alta | confirmado |
| NOM-011 | Conceptos con vigencia 2026-09-01 | P1-E | dato | alta | confirmado |
| NOM-012 | Documentos sin aprobación ni pago | P1 | control | alta | confirmado |
| NOM-013 | Retención, PILA y contabilidad fuera de alcance | P1 | alcance | alta | gap |
| NOM-014 | Anulación de ajustes sin actor ni motivo | P2 | control | alta | confirmado |
| NOM-015 | Sin segregación de funciones en nómina | P1 | control | alta | confirmado |
| NOM-016 | Sin pruebas del motor de nómina | P1 | control | alta | confirmado |
| NOM-017 | Código de prestaciones muerto | P2 | tecnico | alta | confirmado |
| NOM-018 | Aportes sin documento usan salario mensual completo | P1-E | calculo | alta | confirmado |

## Hallazgos

```yaml
id: NOM-001
severidad: P0-E
tipo: calculo
requisito: "NOM-N04/N05 — IBC entre 1 y 25 SMMLV (Ley 100/1993 art. 18)"
esperado: "Topes y pisos se aplican siempre, con o sin novedades."
observado: >-
  buildPayrollLiquidationRows solo ejecuta calculateSocialContributionSegments cuando
  payrollSegmentAdjustments.length > 0. Sin novedades segmentadas, las deducciones usan
  salaryBaseForDeductions y los aportes usan baseIbc sin cap ni floor.
  En buildSocialContributionRows, la rama sin segmento calcula ibc = baseIbc + ibcDelta
  sin topes. IBC_TOPE_SMMLV e IBC_CAPS_FLOORS no tienen semilla; el default del código
  es 25 SMMLV.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5537-5541"
  - archivo: "apps/api/src/modules/hr/service.js:5581-5592"
  - archivo: "apps/api/src/modules/hr/service.js:6993-7013"
  - archivo: "apps/api/src/modules/hr/service.js:7159"
  - reproduccion: "Liquidar un salario de 30 SMMLV y otro de 0,8 SMMLV sin novedades."
  - delta: >-
      Salario S sobre 25 SMMLV: exceso E = S − 43.772.625. Sobrecotización mínima =
      8% E (empleado) + 20,5% E (salud y pensión empleador) = 28,5% E, más ARL y
      parafiscales. Bajo 1 SMMLV: subcotización sobre la diferencia hasta el piso.
impacto: economico / legal
recomendacion: >-
  Aplicar capsFloors en ambas ramas y sembrar IBC_TOPE_SMMLV/IBC_CAPS_FLOORS para que la
  configuración sea visible y versionada. Probar los cuatro extremos.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-002
severidad: P0-E
tipo: calculo
requisito: "NOM-N09 — HEDD 115% y HEND 165% en 2026-H2"
esperado: "2.15 y 2.65 × hora ordinaria."
observado: >-
  DEFAULT_PAYROLL_CONFIG y la semilla usan 105%/2.05 y 155%/2.55. La migración que
  convierte HED/HEN/HEDD/HEND a factor_total no corrige percent ni factor.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:42-43"
  - archivo: "apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql:270-271"
  - archivo: "apps/api/prisma/migrations/20260919100000_hr_overtime_concept_value_type/migration.sql:6-9"
  - reproduccion: "Liquidar HEDD y HEND en octubre 2026 y comparar con 2.15/2.65."
  - delta: "0,10 × hora ordinaria por hora. Con divisor 210 y SMMLV 2026: $833,76/hora."
impacto: economico
recomendacion: >-
  Corregir la tarifa con vigencia desde 01-jul-2026 y conservar el histórico. Es el mismo
  defecto de MAR-004; una sola corrección debe cubrir marcaciones y nómina.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-003
severidad: P0-E
tipo: calculo
requisito: "NOM-N10 — divisor 220 h hasta 14-jul-2026; 210 h después (Ley 2101/2021)"
esperado: "El divisor cambia por vigencia del periodo."
observado: >-
  Solo se siembra HORAS_MENSUALES_ORDINARIAS=210 desde 2026-07-15. Para periodos
  anteriores no hay fila y el código usa 210 por defecto. Tampoco hay fila de 220.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5218"
  - archivo: "apps/api/prisma/migrations/20260919120000_hr_monthly_ordinary_hours_param/migration.sql:5-7"
  - reproduccion: "Liquidar junio 2026 y comparar la hora ordinaria con S/220."
  - delta: >-
      Hora calculada con 210 en lugar de 220: sobrepago de 4,76% en todo concepto por hora.
      Con SMMLV 2026: $8.337,64 vs $7.958,66; +$378,98 por hora.
impacto: economico
recomendacion: >-
  Sembrar 220 h con vigencia 2026-01-01 y 210 h desde 2026-07-15, y validar que el motor
  rechace periodos sin parámetro vigente en lugar de asumir 210.
dueno: "Nómina / Datos"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-004
severidad: P0-O / P1-E
tipo: control
requisito: "NOM-N16 — el cierre consolida nómina, aportes y provisiones"
esperado: "Cierre con provisión calculada y totales coherentes."
observado: >-
  closePayrollPeriod ejecuta runPayrollLiquidation y runSocialContributions, pero no
  runSocialBenefitProvisions. provisionTotalFromPayrollDocuments lee doc.total_provisions,
  columna que no existe en th_nomina_documentos, por lo que total_provisions siempre es 0.
  El source_summary declara el paso 'provisiones' sin ejecutarlo.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:7368-7369"
  - archivo: "apps/api/src/modules/hr/service.js:7674-7715"
  - archivo: "apps/api/prisma/migrations/20260918140000_hr_payroll_liquidation_documents/migration.sql:21-45"
  - archivo: "apps/api/prisma/migrations/20260918180000_hr_payroll_period_closures/migration.sql:14"
  - reproduccion: "Cerrar un periodo y comparar total_provisions y th_prestaciones_saldos."
  - delta: >-
      Provisión mensual no reportada ≈ cesantías S/12 + prima S/12 + intereses S/1.200
      + vacaciones S/24 ≈ 20,92% del salario mensual por trabajador.
impacto: operativo / economico
recomendacion: >-
  Invocar runSocialBenefitProvisions dentro del cierre y calcular el total desde
  th_prestaciones_saldos o desde las líneas de provisión, no desde una columna inexistente.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-005
severidad: P1-E
tipo: calculo
requisito: "NOM-N18 — no liquidar dos veces sin control"
esperado: "Repetir la liquidación no altera saldos de libranza."
observado: >-
  runPayrollLiquidation sin recalculate actualiza el documento por clave única, pero
  applyPayrollLibranzaMovements vuelve a leer el saldo ya reducido y lo reduce otra vez.
  El movimiento se actualiza, pero balance_amount queda descontado dos veces.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:4584-4613"
  - archivo: "apps/api/src/modules/hr/service.js:5646-5676"
  - reproduccion: "Liquidar dos veces el mismo periodo con una libranza activa y comparar balance_amount."
  - delta: "Segundo descuento igual a la cuota aplicada, acotado por el saldo disponible."
impacto: economico
recomendacion: >-
  Hacer idempotente el movimiento por documento/periodo y recalcular el saldo desde la
  suma de movimientos aplicados, no restando sobre el saldo actual. Exigir recalculate
  explícito para volver a aplicar.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-006
severidad: P1-E
tipo: calculo
requisito: "NOM-N02 — el auxilio no es salario ni base de prestaciones (CST art. 128; Ley 1/1967)"
esperado: "El auxilio queda fuera de la base de prima, cesantías e intereses."
observado: >-
  La semilla de AUX_TRANSPORTE marca include_in_social_benefits_base: true.
  socialBenefitBaseFromLines incluye la línea porque ese flag tiene prioridad sobre
  salary_constitutive === false. Las vacaciones sí quedan protegidas por
  include_in_vacation_base: false.
evidencia:
  - archivo: "apps/api/prisma/migrations/20260918150000_hr_payroll_concepts_detail/migration.sql:34"
  - archivo: "apps/api/src/modules/hr/service.js:4928-4931"
  - archivo: "apps/api/src/modules/hr/service.js:4980-4991"
  - reproduccion: "Liquidar con auxilio y revisar base_prestaciones_sociales y la provisión."
  - delta: >-
      Mes completo con auxilio A=249.095: cesantías + prima = 2 × A × 30/360 = $41.515,83;
      intereses = (A × 30/360) × 30 × 12%/360 = $207,58; total ≈ $41.723,41/mes por
      trabajador que califica.
impacto: economico
recomendacion: >-
  Corregir la semilla a include_in_social_benefits_base: false y añadir prueba de que el
  auxilio no integra la base de prestaciones ni la de aportes.
dueno: "Nómina / Datos"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-007
severidad: P1-E
tipo: control
requisito: "NOM-N24 — solo se pagan días con soporte de jornada, descanso o novedad"
esperado: "Sin marcaciones no hay auxilio ni causación de prestaciones."
observado: >-
  El salario usa paidBaseDays y queda en 0 sin días cubiertos, pero liquidationDays =
  daysWorked || periodDays alimenta el auxilio y la base de prestaciones. Sin jornadas
  procesadas se pagan 15 días de auxilio y se provisiona sobre el salario completo.
  El cierre no lo bloquea porque SIN_MARCACIONES es advertencia, no error.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5410-5432"
  - archivo: "apps/api/src/modules/hr/service.js:5516-5533"
  - archivo: "apps/api/src/modules/hr/service.js:4980-4991"
  - archivo: "apps/api/src/modules/hr/service.js:5629-5633"
  - reproduccion: "Liquidar un empleado activo sin ProcessedWorkday en la quincena."
  - delta: >-
      Por quincena vacía: auxilio $124.547,50 + provisión ≈ 10,44% del salario mensual
      (cesantías S/24 + prima S/24 + vacaciones S/48 + intereses S/4.800).
impacto: economico
recomendacion: >-
  Usar los días pagados/descanso para auxilio y prestaciones, no los días del periodo.
  Elevar SIN_MARCACIONES a error bloqueante salvo justificación aprobada.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-008
severidad: P1
tipo: calculo
requisito: "NOM-N25 — el costo patronal refleja aportes y provisiones"
esperado: "employer_cost = devengo + aportes patronales + provisiones."
observado: "employer_cost: gross en el motor nuevo y en el legacy."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5613"
  - archivo: "apps/api/src/modules/hr/service.js:4853"
  - reproduccion: "Comparar employer_cost con el costo patronal calculado a mano."
  - delta: "Subestima al menos 20,5% de aportes empleador sobre el IBC, más ARL, parafiscales y provisiones."
impacto: economico / gerencial
recomendacion: >-
  Calcular el costo patronal desde los aportes y provisiones del periodo y exponerlo
  separado del devengo. No usar gross como costo.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-009
severidad: P1-E / P0-E
tipo: calculo
requisito: "NOM-N20 — liquidación de retiro con salario y norma vigentes (CST art. 64)"
esperado: "Salario ≥ 10 SMMLV usa 20 días el primer año y 15 por año adicional."
observado: >-
  indemnizationDaysForTermination usa process.env.SMLV_CO. La variable no está definida
  en el repositorio ni en la configuración; highSalary siempre es falso y todo retiro
  usa 30/20 días.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5074-5081"
  - reproduccion: "Liquidar un retiro con salario de 12 SMMLV y servicio de 300 días."
  - delta: >-
      Servicio ≤ 360 días: 10 días de más × salario/30 = salario/3.
      Servicio > 360: 5 días de más por año × salario/30 = salario/6 por año.
impacto: economico / legal
recomendacion: >-
  Reemplazar la variable de entorno por el parámetro laboral SMMLV vigente y probar el
  régimen de alto salario en la liquidación de retiro.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-010
severidad: P1
tipo: control
requisito: "NOM-N17/N27 — reapertura y cierre forzado con traza"
esperado: "Motivo, actor y autorización en ambos eventos."
observado: >-
  input.force salta la validación de cierre; el cierre guarda validation_summary y actor,
  pero no el motivo ni la marca de forzamiento. reopenPayrollPeriod solo recibe period_key
  y guarda actor/fecha, sin motivo ni autorización adicional.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:7683"
  - archivo: "apps/api/src/modules/hr/service.js:7717-7729"
  - archivo: "apps/api/src/modules/hr/schema.js:708-731"
  - reproduccion: "Forzar un cierre y reabrir; buscar motivo y autorización."
  - delta: "No cuantificable; riesgo de control interno."
impacto: operativo / legal
recomendacion: >-
  Exigir motivo y autorización en el esquema, registrar el forzamiento en el cierre y
  notificar al responsable. No permitir force sin justificación.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-011
severidad: P1-E
tipo: dato
requisito: "NOM-N09 — tarifas vigentes en todo periodo liquidable"
esperado: "Todo periodo encuentra sus conceptos de recargo y extra."
observado: >-
  th_conceptos_recargo y th_nomina_conceptos se siembran con valid_from 2026-09-01.
  Para periodos anteriores, activeSurchargeConcepts devuelve vacío y
  surchargeMultiplierFor retorna 1. Ese factor no corresponde a ningún concepto:
  sobrepaga el recargo nocturno y el dominical diurno, subpaga el dominical nocturno
  y las horas extra.
evidencia:
  - archivo: "apps/api/prisma/migrations/20260917120000_hr_workday_novelties_foundation/migration.sql:262-275"
  - archivo: "apps/api/prisma/migrations/20260918150000_hr_payroll_concepts_detail/migration.sql:27-40"
  - archivo: "apps/api/src/modules/hr/service.js:4885-4902"
  - archivo: "apps/api/src/modules/hr/service.js:5228-5237"
  - reproduccion: "Liquidar julio 2026 con recargo nocturno, domingo y horas extra."
  - delta: >-
      Recargo nocturno: paga 1,00 en lugar de 0,35 → sobrepago de 0,65 × hora.
      HED/HEN: paga 1,00 en lugar de 1,25/1,75 → subpago de 0,25/0,75 × hora.
      HEDD/HEND: paga 1,00 en lugar de 2,15/2,65 → subpago de 1,15/1,65 × hora.
impacto: economico
recomendacion: >-
  Corregir la vigencia de los maestros o bloquear la liquidación de periodos sin conceptos
  vigentes. Nunca usar 1 como fallback silencioso.
dueno: "Nómina / Datos"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-012
severidad: P1
tipo: control
requisito: "NOM-N26/N28 — ciclo de vida y auditoría del documento"
esperado: "Aprobación y pago separados de la liquidación, con traza."
observado: >-
  runPayrollLiquidation escribe status 'draft' en creación y actualización. No hay rutas
  de aprobación, pago o contabilización y no hay transición de estado.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:5661-5662"
  - archivo: "apps/api/src/modules/hr/routes.js:187-222"
  - reproduccion: "Buscar endpoint o cambio de estado distinto de draft."
  - delta: "No cuantificable; el documento no sirve como soporte formal de pago."
impacto: operativo / legal
recomendacion: >-
  Definir el ciclo draft → aprobado → pagado, con actor, fecha y permiso por transición.
  Integrar el pago con tesorería o contabilidad.
dueno: "Nómina / Producto"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-013
severidad: P1
tipo: alcance
requisito: "NOM-N21/N22/N23 — retención, PILA y contabilidad"
esperado: "Retención cuando aplica, archivo PILA y asiento contable."
observado: >-
  No hay cálculo de retención en la fuente ni UVT en HR. No hay exportación de archivo
  plano PILA. Los conceptos y libranzas llevan códigos contables, pero no existe póliza
  ni asiento generado.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:4918-4937"
  - archivo: "apps/api/src/modules/hr/service.js:4305-4325"
  - reproduccion: "Buscar generador de retención, PILA y asiento."
  - delta: "Cierre tributario y contable manual; riesgo de error y retrabajo."
impacto: operativo / legal
recomendacion: >-
  Confirmar alcance contractual. Si está en alcance, planificar retención (UVT 2026),
  archivo PILA y asiento como módulos separados con certificación propia.
dueno: "Producto / Contabilidad"
confianza: alta
estado: gap
```

```yaml
id: NOM-014
severidad: P2
tipo: control
requisito: "NOM-N19 — ajustes con soporte y actor"
esperado: "Toda anulación conserva actor y motivo."
observado: "deletePayrollAdjustment cambia status a 'anulado' sin usuario ni justificación."
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:6387-6398"
  - reproduccion: "Anular un ajuste y revisar la fila y la bitácora."
  - delta: "No cuantificable; riesgo de no repudio."
impacto: operativo
recomendacion: >-
  Agregar anulado_by, anulado_at y motivo; registrar el evento en auditoría.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-015
severidad: P1
tipo: control
requisito: "NOM-N26 — segregación de funciones (COSO)"
esperado: "Liquidar, aprobar y pagar con roles distintos."
observado: >-
  requirePermission permite bypass administrativo total y no existe SoD por acción de
  nómina. Un administrador puede liquidar, cerrar y reabrir sin segundo actor.
evidencia:
  - archivo: "apps/api/src/middleware/rbac.js:268"
  - archivo: "apps/api/src/middleware/rbac.js:305-307"
  - reproduccion: "Ejecutar liquidación y cierre con un único rol administrativo."
  - delta: "No cuantificable; riesgo de fraude y error no detectado."
impacto: legal / operativo
recomendacion: >-
  Definir permisos explícitos de nómina y una regla de SoD para las acciones críticas.
  Probar con dos roles separados.
dueno: "Seguridad / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-016
severidad: P1
tipo: control
requisito: "TRV-07 — certificación E2E del flujo"
esperado: "Pruebas por concepto, cierre, retiro y prestaciones."
observado: >-
  Existen pruebas de marcación, novedades, aportes y ajustes, pero no hay prueba dedicada
  de buildPayrollLiquidationRows, cierre, retiro ni provisiones.
evidencia:
  - archivo: "apps/api/test/hr-payroll-adjustment-lock.test.js"
  - archivo: "apps/api/test/hr-payroll-adjustment-permission.test.js"
  - archivo: "apps/api/test/hr-payroll-social-contributions-bulk.test.js"
  - archivo: "apps/api/test/hr-social-contribution-segments.test.js"
  - archivo: "apps/api/test/hr-workday-novelties-contract.test.js"
  - archivo: "apps/api/test/hr-marking-concurrency.test.js"
  - archivo: "apps/api/test/payroll-module-alias.test.js"
  - archivo: "apps/web/test/ibc-nomina-ui.test.mjs"
  - reproduccion: "Inventario de pruebas y cobertura por concepto."
  - delta: "Los defectos P0-E no tienen red de seguridad."
impacto: operativo
recomendacion: >-
  Crear pruebas de tabla por concepto y fecha, más un E2E marcación → jornada → nómina
  → cierre → aportes → provisión. Certificar antes de promover.
dueno: "QA / Nómina"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-017
severidad: P2
tipo: tecnico
requisito: "Una sola vía de causación de prestaciones"
esperado: "La liquidación y la provisión usan el mismo motor."
observado: >-
  addSocialBenefitLines está definido y nunca se invoca. La provisión vive en un módulo
  separado que el cierre no llama.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:4994"
  - reproduccion: "Buscar llamadas a addSocialBenefitLines."
  - delta: "Deuda técnica; induce a creer que la liquidación causa prestaciones."
impacto: operativo
recomendacion: >-
  Eliminar el código muerto o integrarlo en una única vía de causación. Documentar cuál
  es el motor oficial.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

```yaml
id: NOM-018
severidad: P1-E
tipo: calculo
requisito: "NOM-N05 — aportes sobre el IBC del periodo"
esperado: "Sin documento de nómina no se causan aportes sobre un mes completo."
observado: >-
  En buildSocialContributionRows, si no hay documentos, reportedBaseIbc queda en 0 y
  baseIbc cae al salario mensual completo del empleado, incluso en una quincena o en un
  periodo sin trabajo. Los aportes se calculan sobre ese valor.
evidencia:
  - archivo: "apps/api/src/modules/hr/service.js:7095"
  - archivo: "apps/api/src/modules/hr/service.js:7159"
  - reproduccion: "Previsualizar aportes de una quincena sin documentos de nómina."
  - delta: >-
      Aportes calculados sobre S en lugar de S/2: sobrecotización de 50% del periodo
      (8% empleado + 20,5% empleador sobre el exceso), más ARL y parafiscales.
impacto: economico
recomendacion: >-
  No usar el salario mensual como fallback silencioso. Exigir documento de nómina o
  calcular la base desde días soportados, y marcar el caso como error de configuración.
dueno: "Nómina / Backend"
confianza: alta
estado: confirmado
```

## Hallazgos compartidos con marcaciones

- **MAR-001 / NOM-002**: la hora nocturna de 21:00 y la tarifa HEDD/HEND afectan tanto el procesamiento de jornada como la liquidación. La corrección debe ser única y verificarse en ambos módulos.
- **MAR-004**: el defecto de HEDD/HEND está registrado en marcaciones y se repite aquí como NOM-002 para trazabilidad económica.
- **MAR-010**: la divergencia reporte vs. nómina impide conciliar extras; cualquier corrección de tarifas debe incluir la conciliación.

## Reproducción pendiente (F2)

Para elevar los hallazgos a definitivos falta:

1. Tenant QA anonimizado y periodos de prueba (junio, julio, octubre 2026).
2. Empleados en los cuatro extremos de IBC y en el régimen de alto salario.
3. Casos con y sin novedades segmentadas.
4. Casos con libranza, ajuste anulado y retiro.
5. Cierre completo con provisión y comparación de totales.
6. Confirmación de la configuración real por tenant.
7. Firma jurídica/contable de la matriz normativa.

Ningún hallazgo de este documento se declara corregido: todos son de solo lectura.
