# Plan de remediación — Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama de trabajo | `desarrollo` (exclusivamente) |
| Commit base de la auditoría | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Insumos | `02-matriz-normativa.md`, `03-matriz-funcional-marcaciones.md`, `04-matriz-funcional-nomina.md`, `hallazgos-marcaciones.md`, `hallazgos-nomina.md` |
| Estado | Fase 1 en ejecución: R-01, R-02 y R-03 implementados en `desarrollo` (ver `07-ejecucion-remediacion.md`); sin commit ni promoción |
| Regla | La auditoría no modificó producto; la remediación autorizada se ejecuta solo en `desarrollo` |

## 1. Principios de remediación

1. **Una sola fuente de verdad legal.** Hora nocturna, divisor, topes, tarifas y SMMLV salen de `th_parametros_laborales`/`th_conceptos_recargo` con vigencia; no de constantes ni de variables de entorno.
2. **Corregir el dato, no maquillar el cálculo.** Las semillas y migraciones históricas se corrigen con migraciones nuevas y vigencia explícita; no se editan migraciones aplicadas.
3. **El motor no se valida contra sí mismo.** Cada paquete exige cálculo manual independiente y prueba automatizada por concepto y fecha.
4. **Bloquear antes que pagar mal.** Falta de parámetro vigente, falta de concepto, falta de jornada o falta de soporte deben ser errores accionables, no fallbacks silenciosos.
5. **Trazabilidad de dinero.** Toda operación que afecte nómina, provisión o saldo de libranza conserva actor, motivo, periodo y versión de parámetros.
6. **Sin promotion implícita.** Cada paquete se certifica en `desarrollo` y sigue `desarrollo -> develop -> main` con los manifiestos de alcance y QA del repositorio.

## 2. Secuencia y dependencias

```text
Fase 0  Línea base y datos QA
   │
   ├─► Fase 1  P0 legal/económico (bloquea producción)
   │        │
   │        ├─► Fase 2  Control y trazabilidad
   │        │        │
   │        │        ├─► Fase 3  Estructura de jornada
   │        │        │        │
   │        │        │        └─► Fase 4  Alcance tributario/contable (decisión)
   │        │        │
   │        │        └─► Certificación E2E y QA funcional
   │        │
   │        └─► Firma jurídica/contable
   │
   └─► Congelamiento de promociones de marcaciones/nómina hasta cerrar Fase 1
```

## 3. Fase 0 — Línea base y datos de prueba

**Objetivo:** poder reproducir cada hallazgo con datos anonimizados y medir el delta económico antes de tocar el motor.

| Entregable | Criterio de aceptación |
|---|---|
| Tenant QA anonimizado | Empleados, contratos, afiliaciones, parámetros y conceptos identificados sin PII |
| Periodos de prueba | Junio 2026 (divisor 220), julio 2026 (transición), octubre 2026 (vigente) |
| Casos de nómina | Salario mínimo, 2 SMMLV, 4/16/20 SMMLV, >25 SMMLV; con y sin novedades |
| Casos de marcación | Turno 19:00–06:00, domingo, festivo, jornada partida, dos horarios, sin horario |
| Línea base económica | Delta calculado por hallazgo antes de corregir |
| Inventario de configuración | Parámetros y conceptos reales por tenant, con vigencia |

**Gate:** no se inicia Fase 1 sin línea base económica y casos reproducibles.

## 4. Fase 1 — P0 legal/económico

### R-01. Unificar hora nocturna en 19:00

- **Hallazgos:** MAR-001, MAR-012, NOM-011.
- **Cambio:** una sola fuente `JORNADA_NOCTURNA_INICIO`; `processDay` y nómina la consumen; eliminar 21:00 y los valores duplicados.
- **Pruebas:** turno 19:00–06:00; 2 h nocturnas adicionales; 35% sobre hora ordinaria.
- **Aceptación:** el cambio de parámetro altera el cálculo en marcaciones y nómina; no quedan constantes 21:00 en HR.
- **Riesgo:** reprocesar periodos históricos cambia documentos ya emitidos; definir corte y comunicación.

### R-02. Corregir tarifas HEDD/HEND a 115%/165%

- **Hallazgos:** MAR-004, NOM-002.
- **Cambio:** nueva migración con vigencia 2026-07-01; conservar histórico anterior.
- **Pruebas:** 1 h HEDD y 1 h HEND en domingo de octubre; comparación con 2.15/2.65.
- **Aceptación:** factor y percent coinciden con la norma y con el cálculo manual.

### R-03. Sembrar divisor 220 h y bloquear periodos sin parámetro

- **Hallazgos:** NOM-003, MAR-007.
- **Cambio:** fila 220 h desde 2026-01-01 y 210 h desde 2026-07-15; error si no hay divisor vigente.
- **Pruebas:** junio y agosto 2026; comparación de hora ordinaria.
- **Aceptación:** el divisor usado coincide con la fecha de inicio del periodo.

### R-04. Aplicar topes y pisos de IBC en ambas ramas

- **Hallazgos:** NOM-001, NOM-018.
- **Cambio:** ejecutar caps/floors también sin novedades segmentadas; no usar salario mensual como fallback de IBC; sembrar `IBC_TOPE_SMMLV` y `IBC_CAPS_FLOORS`.
- **Pruebas:** 0,8 / 1 / 25 / 30 SMMLV, con y sin novedades; quincena sin documentos.
- **Aceptación:** IBC y aportes dentro de rango en los ocho casos; delta manual reproducido.

### R-05. Cerrar con provisiones reales

- **Hallazgos:** NOM-004, NOM-017.
- **Cambio:** invocar `runSocialBenefitProvisions` en el cierre; calcular `total_provisions` desde saldos/líneas; eliminar el paso declarado que no se ejecuta.
- **Pruebas:** cierre de un mes; suma de provisiones = saldos por empleado; total del cierre ≠ 0.
- **Aceptación:** nómina + aportes + provisiones cuadran y son trazables.

### R-06. Hacer idempotente la libranza

- **Hallazgos:** NOM-005.
- **Cambio:** recalcular saldo desde movimientos aplicados; no volver a descontar al relicitar; exigir `recalculate` para reaplicar.
- **Pruebas:** doble liquidación con libranza; saldo antes/después idéntico.
- **Aceptación:** el saldo solo cambia una vez por periodo/documento.

### R-07. Sacar el auxilio de la base de prestaciones

- **Hallazgos:** NOM-006, NOM-007.
- **Cambio:** corregir semilla `include_in_social_benefits_base: false`; usar días soportados (marcación, descanso, licencia) para auxilio y prestaciones; elevar `SIN_MARCACIONES` a error bloqueante salvo justificación aprobada.
- **Pruebas:** mes completo, quincena sin marcaciones, empleado en el tope de 2 SMMLV.
- **Aceptación:** auxilio fuera de prima/cesantías/intereses; sin marcaciones no hay auxilio ni provisión no soportada.

### R-08. Corregir indemnización de retiro

- **Hallazgos:** NOM-009.
- **Cambio:** reemplazar `process.env.SMLV_CO` por el SMMLV vigente del periodo.
- **Pruebas:** retiro ≤360 días y >360 días con salario ≥10 SMMLV.
- **Aceptación:** días de indemnización coinciden con CST art. 64.

### R-09. Resolver el motor legacy

- **Hallazgos:** NOM-008 (legacy), riesgo de doble motor.
- **Cambio:** retirar o aislar `POST /hr/payroll/process` con tarifa plana 1.25; impedir que escriba documentos oficiales.
- **Pruebas:** intento de uso del endpoint legacy; verificar bloqueo o marca de no oficial.
- **Aceptación:** una sola vía oficial de liquidación.

### R-10. Conciliar reporte de extras con nómina

- **Hallazgos:** MAR-010.
- **Cambio:** el reporte lee los buckets de `ProcessedWorkday` o muestra diferencia explícita; prueba de conciliación.
- **Pruebas:** mismo día en reporte y liquidación.
- **Aceptación:** diferencia = 0 o justificada y visible.

### R-10A. Aplicar topes de trabajo suplementario

- **Hallazgos:** MAR-005.
- **Cambio:** leer `MAX_HE_DIARIO` y `MAX_HE_SEMANAL` en el procesamiento/liquidación; definir con jurídica si el control es bloqueo o alerta; registrar la excepción cuando exista.
- **Pruebas:** 3 h extra en un día y 13 h en una semana; verificar bloqueo o alerta y traza.
- **Aceptación:** el sistema no paga horas por encima del tope sin control ni registro.
- **Riesgo:** la norma fija el tope, no la sanción interna; la decisión debe quedar documentada.

## 5. Fase 2 — Control y trazabilidad

### R-11. Actor, motivo y vínculo en marcas

- **Hallazgos:** MAR-006.
- **Cambio:** `created_by`, `corrects_punch_id`, estado y motivo en `TimePunch`; novedad para toda marca administrativa, incluida la del día.
- **Pruebas:** marca administrativa hoy; corrección; anulación; consulta de bitácora.
- **Aceptación:** toda marca de tercero es reconstruible y no repudiable.

### R-12. Aprobación de novedades

- **Hallazgos:** MAR-007.
- **Cambio:** ciclo pendiente → aprobada/rechazada con actor y motivo; la nómina solo consume aprobadas.
- **Pruebas:** novedad pendiente no afecta; aprobada afecta; rechazada no afecta.
- **Aceptación:** no hay novedad sin aprobación en documentos oficiales.

### R-13. Corrección y anulación de marcas

- **Hallazgos:** MAR-011 (flujo), MAR-006.
- **Cambio:** endpoints de corrección/anulación con motivo, actor y vínculo; inmutabilidad del original.
- **Pruebas:** corregir una marca y reconstruir la cadena.
- **Aceptación:** no se borra ni sobrescribe sin traza.

### R-14. Cierre y reapertura con motivo

- **Hallazgos:** NOM-010, MAR-007.
- **Cambio:** `force_reason`, autorización y actor; reapertura con motivo; notificación al responsable.
- **Pruebas:** cierre forzado y reapertura; consulta de la traza.
- **Aceptación:** no hay cierre forzado ni reapertura sin motivo registrado.

### R-15. Ciclo de vida del documento de nómina

- **Hallazgos:** NOM-012, NOM-015.
- **Cambio:** estados draft → aprobado → pagado; permisos por transición; SoD para liquidar/aprobar/pagar.
- **Pruebas:** un rol no puede completar todo el ciclo.
- **Aceptación:** cada transición tiene actor, fecha y permiso.

## 6. Fase 3 — Estructura de jornada

### R-16. Horario por trabajador

- **Hallazgos:** MAR-003.
- **Cambio:** asignación explícita de horario/malla por empleado; `processDay` usa el horario del empleado.
- **Pruebas:** dos empleados con horarios distintos.
- **Aceptación:** cada uno se procesa con su horario.

### R-17. Generación automática de jornada

- **Hallazgos:** MAR-002.
- **Cambio:** disparador al cerrar la marcación de salida y/o job periódico; idempotencia por empleado/día; monitoreo de días marcados sin procesar.
- **Pruebas:** marcar y verificar `ProcessedWorkday` sin llamada manual; reintento y duplicado.
- **Aceptación:** no hay día marcado sin jornada procesada en el flujo normal.

### R-18. Jornada partida

- **Hallazgos:** MAR-009.
- **Cambio:** múltiples intervalos por día; suma de minutos efectivos.
- **Pruebas:** dos bloques entrada/salida.
- **Aceptación:** horas y extras coinciden con el cálculo manual.

### R-19. Robustez sin horario y fallback

- **Hallazgos:** MAR-008, MAR-013.
- **Cambio:** validar horario antes de procesar; reemplazar fallback `[]` por error explícito; no mezclar modelos.
- **Pruebas:** sin horarios activos; API caída; consulta cruzada de tenants.
- **Aceptación:** error accionable, sin 500 y sin datos de otro tenant.

### R-20. Decidir geocerca

- **Hallazgos:** MAR-F21 (GAP).
- **Cambio:** decisión de producto: implementar validación de radio o declarar fuera de alcance.
- **Pruebas:** según decisión.
- **Aceptación:** decisión documentada y aprobada.

## 7. Fase 4 — Alcance tributario y contable (decisión)

| Paquete | Hallazgo | Decisión requerida |
|---|---|---|
| R-21 Retención en la fuente | NOM-013 | ¿Está en alcance contractual? UVT 2026 y procedimiento 1/2 |
| R-22 Archivo PILA | NOM-013 | ¿Se genera o se integra con operador? |
| R-23 Asiento contable | NOM-013 | ¿Nómina genera póliza o la recibe contabilidad? |

Sin decisión de producto y firma contable, estos paquetes no se implementan.

## 8. Trazabilidad hallazgo → paquete

| Hallazgo | Paquete | Fase |
|---|---|---|
| MAR-001 | R-01 | 1 |
| MAR-002 | R-17 | 3 |
| MAR-003 | R-16 | 3 |
| MAR-004 | R-02 | 1 |
| MAR-005 | R-10A | 1 |
| MAR-006 | R-11 | 2 |
| MAR-007 | R-12 | 2 |
| MAR-008 | R-19 | 3 |
| MAR-009 | R-18 | 3 |
| MAR-010 | R-10 | 1 |
| MAR-011 | R-19 | 3 |
| MAR-012 | R-01 | 1 |
| MAR-013 | R-19 | 3 |
| NOM-001 | R-04 | 1 |
| NOM-002 | R-02 | 1 |
| NOM-003 | R-03 | 1 |
| NOM-004 | R-05 | 1 |
| NOM-005 | R-06 | 1 |
| NOM-006 | R-07 | 1 |
| NOM-007 | R-07 | 1 |
| NOM-008 | R-05 / R-15 | 1-2 |
| NOM-009 | R-08 | 1 |
| NOM-010 | R-14 | 2 |
| NOM-011 | R-01 | 1 |
| NOM-012 | R-15 | 2 |
| NOM-013 | R-21…R-23 | 4 |
| NOM-014 | R-11 / R-15 | 2 |
| NOM-015 | R-15 | 2 |
| NOM-016 | Certificación transversal | 2-3 |
| NOM-017 | R-05 | 1 |
| NOM-018 | R-04 | 1 |

## 9. Evidencia y certificación

Cada paquete debe entregar:

1. Migración nueva (nunca edición de migración aplicada) y rollback documentado.
2. Prueba automatizada por concepto y fecha.
3. Cálculo manual independiente con delta antes/después.
4. Evidencia de UI cuando aplique.
5. Certificación E2E del flujo afectado.
6. Manifiesto de alcance con inventario exacto `A/M/D`.
7. `npm run qa:preqa:evidence -- <manifest>` antes de promover a `develop`.
8. `npm run qa:approval:evidence -- <manifest>` y aprobación funcional antes de `main`.

**Ningún paquete se considera cerrado por lint, build, test unitario o respuesta 200.**

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reprocesar periodos históricos cambia documentos ya emitidos | Definir fecha de corte; conservar documentos históricos; recalcular solo con autorización |
| La corrección de semillas no aplica a tenants con datos propios | Auditar configuración por tenant antes de migrar; migración idempotente |
| El motor legacy sigue escribiendo documentos | Bloquear o marcar como no oficial antes de Fase 2 |
| Pruebas E2E inestables por concurrencia | Usar el arnés y los patrones de certificación del repositorio; repetir con datos fijos |
| Falta de firma legal bloquea el cierre | Congelar promociones; escalar a jurídica/contador desde Fase 0 |

## 11. Criterio de salida de F3

- [x] Hallazgos P0/P1 documentados con evidencia y delta.
- [x] Plan por fases con dependencias y aceptación.
- [ ] Línea base económica con datos QA.
- [ ] Firma jurídica/contable.
- [x] Autorización explícita para iniciar Fase 1 (2026-10-30: R-01 a R-03).
- [ ] Certificación E2E de los paquetes implementados.

Este documento no autoriza cambios: es la propuesta para que el responsable del ciclo decida el arranque de Fase 0/1.
