# Auditoría funcional y legal — Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama de trabajo | `desarrollo` |
| Estado | F0 aprobado; ejecución de F1 pendiente |
| Alcance del ciclo | Diagnóstico y plan (F0–F3), sin cambios de código |
| Marco de referencia | Colombia 2026, con validación final de jurídica/contador |
| Datos | Seed local + QA anonimizado, solo lectura |
| Auditores | Skills versionados `apexos-auditor-marcaciones` y `apexos-auditor-nomina` |

## 1. Objetivo

Determinar con evidencia reproducible si los módulos de marcaciones y nómina operan conforme a los estándares funcionales y legales aplicables, y producir:

1. Un veredicto explícito por módulo y por subflujo.
2. Un inventario de hallazgos priorizado por riesgo legal, económico y operativo.
3. Un plan de remediación por lotes, listo para convertirse en briefs y manifiestos de alcance.

## 2. No objetivos de este ciclo

- No se corrige código ni se ejecutan migraciones.
- No se escriben datos en QA ni en producción.
- No se certifica cumplimiento legal definitivo: la matriz la firma una persona.
- No se auditan a profundidad generación de PILA/XML, retención en la fuente, contabilización ni dispersión bancaria. Se registran como gaps; si el cliente los exige, se abre un ciclo aparte.

## 3. Módulos y subflujos en alcance

### Marcaciones

- Autoservicio y marcación offline.
- Marcación administrativa con empleado declarado.
- Secuencia, idempotencia, concurrencia y correcciones.
- Mallas, horarios, turnos y jornada procesada.
- GPS, geocercas y evidencias.
- Reportes de asistencia y alertas.
- Integración marcación → jornada procesada → nómina.

### Nómina

- Liquidación de periodo (quincenal/mensual) y novedades.
- Horas extra, recargos nocturnos y dominicales/festivos.
- IBC, aportes sociales y PILA (cálculo, no archivo plano).
- Prestaciones sociales, provisiones y pagos.
- Cierre, reapertura y recálculo de periodo.
- Ajustes, libranzas y jornadas externas.
- Liquidación de retiro.
- Reportes, PDF y códigos contables (sin asientos).

## 4. Auditores y responsabilidades

| Rol | Mandato | Entregable principal |
|---|---|---|
| Auditor de Marcaciones | Reconstruir el flujo real y contrastarlo con la matriz funcional y legal | `hallazgos-marcaciones.md` |
| Auditor de Nómina | Reconstruir el cálculo real y contrastarlo con la matriz funcional y legal | `hallazgos-nomina.md` |
| Auditor Normativo | Mantener la matriz requisito→norma→criterio→prueba y la vigencia 2026 | `02-matriz-normativa.md` |
| Auditor de Datos | Aislamiento multi-tenant, ALS, doble almacén, idempotencia y trazabilidad | Hallazgos de integridad |
| Auditor de Control Interno | Segregación de funciones y no repudio: marcar, corregir, aprobar, cerrar y pagar | Matriz de riesgos de control |
| Auditor E2E | Recorrer flujos completos con evidencia versionada en API y navegador | Certificación de flujos |

Todos operan en modo lectura. Ninguno corrige durante la auditoría.

## 5. Fases y puertas

| Fase | Duración estimada | Contenido | Puerta de salida |
|---|---|---|---|
| F0 Preparación | 0.5 día | Alcance, decisiones, líneas base, muestreo, plantillas, accesos | Este documento aprobado |
| F1 Deber ser | 1.5–2 días | Matriz normativa Colombia 2026 y matrices funcionales por módulo | Matriz revisada por el responsable funcional y jurídica |
| F2 Verificación | 2–3 días | Auditoría paralela read-only, reproducciones, E2E | Todo hallazgo con evidencia o degradado a hipótesis |
| F3 Consolidación | 1 día | Deduplicación, severidad, veredicto y backlog | Veredicto por módulo y plan de remediación |
| F4 Remediación | Posterior | Brief, manifiesto de alcance, certificación y pre-QA por lote | `npm run qa:preqa:evidence -- <manifiesto>` en verde |

## 6. Artefactos

```text
docs/audits/2026-10-30-marcaciones-nomina/
├── 00-alcance.md
├── 01-inventario.md
├── 02-matriz-normativa.md
├── 03-matriz-funcional-marcaciones.md
├── 04-matriz-funcional-nomina.md
├── hallazgos-marcaciones.md
├── hallazgos-nomina.md
├── 05-plan-remediacion.md
├── 06-veredicto.md
└── evidencia/
```

## 7. Formato obligatorio de hallazgo

```yaml
id: MAR-001 | NOM-001
severidad: P0 | P1 | P2
tipo: norma | calculo | control | dato | seguridad | operacion
requisito: ""
esperado: ""
observado: ""
evidencia:
  - archivo: "ruta:linea"
  - reproduccion: "comando, consulta o pasos"
impacto: legal | economico | operativo
recomendacion: ""
dueno: ""
confianza: alta | media | baja
estado: confirmado | hipotesis | descartado
```

Una afirmación sin `archivo:línea` verificado al tip y sin reproducción es **hipótesis**, no hallazgo.

## 8. Severidad

| Nivel | Definición |
|---|---|
| P0-L | Incumple norma laboral, tributaria o de protección de datos; expone sanción, demanda o nulidad |
| P0-E | Paga mal (subpago o sobrepago), pierde dinero o impide liquidar correctamente |
| P0-O | Impide operar el flujo crítico, por ejemplo nómina sin jornadas procesadas |
| P1 | Cálculo o control incorrecto con mitigación manual; riesgo relevante pero no inmediato |
| P2 | Deuda técnica, usabilidad o documentación sin impacto directo en dinero o derecho |

## 9. Reglas de la auditoría

- Solo lectura en F0–F3: sin ediciones de producto, migraciones, escrituras en BD compartida, commits ni push.
- Validar contra el tip de `desarrollo`, la cadena completa de migraciones y los datos del tenant. No contra un archivo aislado.
- Si un hallazgo no se reproduce, se degrada a hipótesis o se descarta y se registra el motivo.
- Separar siempre: incumplimiento legal, defecto funcional, control faltante y deuda técnica.
- No usar datos personales sin anonimizar. No extraer PII a documentos de auditoría.
- No declarar "cumple" sin evidencia ejecutada.
- Todo P0 se escala de inmediato; no se corrige dentro de la auditoría.
- La matriz normativa y el veredicto legal requieren firma humana.

## 10. Evidencia y certificación de la remediación

La fase F4 sigue el flujo `desarrollo → develop → main` de `AGENTS.md` y la política `docs/CHANGE_APPROVAL_QA_POLICY.md`:

- Brief de alcance por lote.
- Manifiesto `scope_schema_version: 2` con inventario exacto A/M/D.
- Capacidades protegidas con evidencia.
- Certificación local y `npm run qa:preqa:evidence -- <manifiesto>`.
- Evidencia de navegador real en QA para los flujos tocados.

## 11. Línea base verificada (candidatos, no conclusiones)

| ID | Observación | Evidencia | Estado | Severidad candidata |
|---|---|---|---|---|
| MAR-01 | `processDay` procesa con `DEFAULT_PARAMS` (noche 21:00) y el primer horario activo global, mientras la configuración de nómina usa 19:00 | `apps/api/src/modules/hr/service.js:3599`, `:13`, `:20`; `apps/api/src/modules/hr/timeLogic.js:118` | Confirmado en código; falta resolver la hora legal 2026 | P0-L / P0-E |
| MAR-02 | La jornada procesada solo se genera por `POST /hr/workdays/process`; no hay cron, cola ni llamada desde la marcación | `apps/api/src/modules/hr/routes.js:113` | Confirmado en código; falta medir impacto operativo | P0-O |
| MAR-03 | `JORNADA_NOCTURNA_INICIO`, `MAX_HE_DIARIO` y `MAX_HE_SEMANAL` están sembrados pero no se leen en `apps/api/src` | Búsqueda sin coincidencias en el código; semilla en migración fundacional | Confirmado en código | P0-L |
| MAR-04 | `requires_approval` se siembra en `true`, pero no existe flujo que apruebe o rechace extras | `apps/api/src/modules/hr/service.js:379`, `:3946` | Confirmado en código | P0-L / P1 |
| NOM-01 | El multiplicador paga solo `percent/100` para `porcentaje_adicional`, pero una migración posterior corrige HED/HEN/HEDD/HEND a `factor_total` | `apps/api/src/modules/hr/service.js:5233`; `apps/api/prisma/migrations/20260919100000_hr_overtime_concept_value_type/migration.sql:6` | **Descartado como defecto**; validar datos por tenant | — |
| COV-01 | Cobertura fuerte en concurrencia de marcación e IBC; nula en cálculo de nómina, recargos, cierre, prestaciones y flujo marcación→nómina | Inventario de `apps/api/test` y `apps/web/test` | Confirmado; falta inventario exhaustivo en F1 | P1 |

Hipótesis adicionales a verificar en F2, sin severidad asignada todavía:

- Topes y pisos de IBC aplicados solo cuando hay novedades segmentadas.
- Cierre de periodo forzable y reapertura sin motivo.
- `Payroll.employer_cost = gross` no representa costo patronal.
- Auditoría de dominio noop cuando Redis está apagado.
- Corrección de marcación sin actor, sin vínculo al registro original y sin anulación.
- Fallback de lecturas HR a Supabase con modelo divergente.
- Ausencia de retención en la fuente, archivo PILA y contabilización.

## 12. Muestreo y datos

- **Local:** tenant semilla con al menos dos empleados diurnos, dos nocturnos, uno con extras, uno con contrato inferior al mes y uno con libranza. Un periodo quincenal y uno mensual; un cierre y una reapertura.
- **QA anonimizado:** al menos dos tenants en solo lectura. Contrastar parámetros laborales, conceptos de recargo, calendario, horarios y cierres reales sin extraer PII.
- Cada P0 debe reproducirse en local antes de reportarse.

## 13. Supuestos y decisiones abiertas

- La validación jurídica se agenda en F1; sin ella el veredicto legal queda condicionado.
- El procedimiento de anonimización de QA debe aprobarse antes de F2.
- Si el cliente espera PILA exportable, retención o contabilización, se registran como gaps de alcance y se abre un ciclo separado.
- La muestra de tenants puede ampliarse si F2 encuentra divergencias de configuración.

## 14. Criterios de salida de F3

- 100% de requisitos P0 y P1 con veredicto: cumple, no cumple, parcial, no verificable o no aplica.
- Cero P0 sin dueño, plan y reproducción.
- Veredicto explícito por módulo y subflujo: apto, apto con condiciones o no apto.
- Backlog de remediación priorizado por riesgo legal y económico.

## 15. Registro de decisiones

| Decisión | Valor aprobado |
|---|---|
| Alcance del ciclo | Diagnóstico y plan, sin cambios de código |
| Marco legal | Colombia 2026 con validación de jurídica/contador |
| Datos | Seed local + QA anonimizado |
| Auditores | Skills versionados en `.qoder/skills/` |

## 16. Checklist F0

- [x] Decisiones de alcance registradas.
- [x] Skills de auditoría creados.
- [x] Línea base inicial verificada y un falso positivo descartado.
- [ ] Acceso a QA y procedimiento de anonimización.
- [ ] Muestra de tenants y periodos definida.
- [ ] Revisión de la matriz normativa con jurídica/contador.
- [ ] Plantillas de hallazgo y veredicto validadas con el responsable funcional.
