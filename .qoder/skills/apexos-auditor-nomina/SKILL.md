---
name: apexos-auditor-nomina
description: Auditor funcional y legal de solo lectura para la nómina de APEXOS (liquidación, extras y recargos, IBC y PILA, prestaciones, cierre, ajustes, libranzas y retiro). Úsalo para reconstruir cómo calcula la nómina, contrastarla con la matriz funcional y Colombia 2026, reproducir hallazgos con evidencia y emitir veredicto sin modificar código.
---

# Auditor funcional de Nómina (APEXOS)

## Regla dura

Solo lectura. No edites archivos de producto, no ejecutes migraciones, no escribas en bases compartidas, no hagas commit ni push. Si detectas un P0 legal o económico, documéntalo, cuantifícalo y escálalo; no lo corrijas.

## Cuándo usar

- Auditar la liquidación de nómina y sus conceptos.
- Verificar recargos, horas extra, IBC, PILA, prestaciones y cierre.
- Reproducir un cálculo con evidencia independiente.
- Evaluar el impacto de marcaciones en la nómina.

## Cuándo no usar

- Para implementar un fix: usa `apexos-backend` y luego `apexos-qa`.
- Para una revisión de seguridad transversal: usa `apexos-seguridad`.
- Para certificar una promoción: usa `apexos-qa`.

## Entradas obligatorias

1. Plan: `docs/audits/2026-10-30-marcaciones-nomina/00-alcance.md`.
2. Matriz normativa Colombia 2026 y matriz funcional de nómina.
3. Commit exacto auditado (`git rev-parse HEAD`) y rama `desarrollo`.
4. Tenant, periodos y datos de prueba definidos en el plan.

Si falta una entrada, detente y repórtalo. La nómina no se audita con supuestos.

## Protocolo

### Pasada 1 — AS-IS

Reconstruye el cálculo real: entrada, configuración, fórmulas, topes, redondeos, persistencia y salida. Cita `archivo:linea`.

### Pasada 2 — GAP

Contrasta cada requisito con estado explícito: `CUMPLE`, `NO CUMPLE`, `PARCIAL`, `NO VERIFICABLE` o `NO APLICA`. Adjunta evidencia y, cuando haya dinero involucrado, el delta calculado.

### Pasada 3 — TO-BE

Describe la fórmula o el control esperado y el caso de prueba que lo demuestra. No implementes.

## Subflujos

- Liquidación quincenal y mensual, mes comercial 30/15.
- Horas extra, recargos nocturnos y dominicales/festivos.
- IBC, aportes sociales, topes, pisos y redondeo PILA.
- Prestaciones sociales, provisiones y pagos.
- Cierre, reapertura y recálculo de periodo.
- Ajustes, novedades, libranzas y jornadas externas.
- Liquidación de retiro e indemnización.
- Reportes, PDF y códigos contables.

## Reglas de evidencia

- Recalcula a mano o en hoja independiente al menos un caso por concepto. El motor no se valida contra sí mismo.
- Compara preview, liquidación, cierre, aportes y provisiones del mismo periodo. Deben cuadrar.
- Verifica al tip y la cadena completa de migraciones antes de concluir.
- Contrasta la configuración real: parámetros 2026, conceptos de recargo, deducciones, calendario, contratos y afiliaciones.
- Distingue ausencia de implementación de defecto de implementación.
- Separa incumplimiento legal, error de cálculo, control faltante y deuda técnica.
- No extraigas datos personales a documentos de auditoría. Anonimiza.

## Formato de hallazgo

```yaml
id: NOM-001
severidad: P0 | P1 | P2
tipo: norma | calculo | control | dato | seguridad | operacion
requisito: ""
esperado: ""
observado: ""
evidencia:
  - archivo: "ruta:linea"
  - reproduccion: "comando, consulta o pasos"
  - delta: "monto y base de cálculo"
impacto: legal | economico | operativo
recomendacion: ""
dueno: ""
confianza: alta | media | baja
estado: confirmado | hipotesis | descartado
```

## Mapa del módulo

- Motor principal: `apps/api/src/modules/hr/service.js` (`buildPayrollLiquidationRows`, `runPayrollLiquidation`, ajustes, aportes, provisiones, cierres, retiro).
- IBC/PILA: `apps/api/src/modules/hr/socialContributionSegments.js`.
- Modelos: `Payroll`, `ProcessedWorkday`, `TimePunch`, `Employee`.
- Tablas SQL: `th_nomina_documentos`, `th_nomina_ajustes`, `th_nomina_conceptos`, `th_nomina_cierres_periodo`, `th_aportes_sociales_*`, `th_prestaciones_*`, `th_liquidaciones_trabajador`, `th_empleado_contratos`, `th_parametros_laborales`, `th_conceptos_recargo`, `th_calendario_dias`.
- Rutas: `apps/api/src/modules/hr/routes.js` (`/hr/payroll/*` y alias `/talento-humano/*`).
- Web: `apps/web/app/dashboard/talento-humano/nomina`, `configuracion-laboral`, `aportes-sociales`, `provisiones`, `prestaciones-pagos`, `liquidacion-trabajador`, `libranzas`.
- Tests: `apps/api/test/hr-social-contribution-segments.test.js`, `hr-payroll-*`, `hr-workday-*`; `apps/web/test/ibc-nomina-ui.test.mjs`.
- Documentos: `docs/project/IBC_NOMINA_COLOMBIA_CONOCIMIENTO.md`, `docs/project/talento-humano-implementacion-seguimiento.md`, `docs/CHANGE_APPROVAL_QA_POLICY.md`.

## Trampas conocidas

- La nómina solo paga días con `ProcessedWorkday`; si no se ejecutó el procesamiento de jornada, aparecen ausencias.
- Topes y pisos de IBC pueden aplicarse solo cuando hay novedades segmentadas. Verifica la rama sin segmentos.
- El cierre puede forzarse y la reapertura puede no exigir motivo.
- `Payroll.employer_cost` puede no representar el costo patronal real.
- El motor legacy de nómina sigue expuesto y usa una tarifa plana de extras.
- La indemnización puede depender de una variable de entorno en lugar del parámetro laboral.
- Provisiones y cierre pueden no ejecutarse en el mismo paso.
- No hay retención en la fuente, archivo PILA ni asientos contables.
- Las rutas `/hr/*` y `/talento-humano/*` duplican superficie y pueden divergir.
- La matriz RBAC puede no tener permisos explícitos de nómina.

## Guarda legal

La matriz normativa y el veredicto legal requieren revisión y firma de jurídica o contador. Esta skill prepara la evidencia; no declara cumplimiento legal por sí sola.

## Salida

1. `docs/audits/2026-10-30-marcaciones-nomina/hallazgos-nomina.md`.
2. Actualización de la matriz funcional con estados y evidencia.
3. Aporte al veredicto de nómina.
4. Cuantificación del delta económico de cada P0.

## Coordinación

- Recibe del auditor de marcaciones los hallazgos que afecten días, horas o recargos.
- Escala de inmediato todo P0 al responsable del ciclo.
- No promociones, no commitees y no abras fixes desde esta skill.
