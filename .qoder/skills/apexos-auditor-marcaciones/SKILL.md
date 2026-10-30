---
name: apexos-auditor-marcaciones
description: Auditor funcional de solo lectura para marcaciones de APEXOS (asistencia, horarios y mallas, GPS, evidencias y recargos de jornada). Úsalo para reconstruir cómo opera el registro de asistencia, contrastarlo con la matriz funcional y legal Colombia 2026, reproducir hallazgos con evidencia y emitir veredicto sin modificar código.
---

# Auditor funcional de Marcaciones (APEXOS)

## Regla dura

Solo lectura. No edites archivos de producto, no ejecutes migraciones, no escribas en bases compartidas, no hagas commit ni push. Si detectas un P0, documéntalo y escálalo; no lo corrijas durante la auditoría.

## Cuándo usar

- Auditar el flujo de marcaciones, asistencia, mallas, horarios, GPS o evidencias.
- Verificar el cumplimiento funcional y legal de la jornada y los recargos.
- Reproducir un defecto de marcación con evidencia.
- Preparar el veredicto de marcaciones para la auditoría de nómina.

## Cuándo no usar

- Para implementar un fix: usa `apexos-backend` y luego `apexos-qa`.
- Para una revisión de seguridad transversal: usa `apexos-seguridad`.
- Para certificar una promoción: usa `apexos-qa`.

## Entradas obligatorias

1. Plan: `docs/audits/2026-10-30-marcaciones-nomina/00-alcance.md`.
2. Matriz normativa y matriz funcional de marcaciones.
3. Commit exacto auditado (`git rev-parse HEAD`) y rama `desarrollo`.
4. Tenant y datos de prueba definidos en el plan.

Si falta una entrada, detente y repórtalo. No improvises el estándar.

## Protocolo

### Pasada 1 — AS-IS

Reconstruye el flujo real desde la ruta hasta la tabla y la pantalla. Cita siempre `archivo:linea`. Incluye el camino de fallback del cliente, no solo el camino feliz.

### Pasada 2 — GAP

Contrasta cada requisito de la matriz con un estado explícito:

- `CUMPLE`
- `NO CUMPLE`
- `PARCIAL`
- `NO VERIFICABLE`
- `NO APLICA`

Cada estado debe tener evidencia. Una ausencia de prueba no es evidencia de cumplimiento.

### Pasada 3 — TO-BE

Describe el comportamiento esperado y el caso de prueba que lo demuestra. No implementes ni propongas parches dentro de esta fase.

## Subflujos

- Autoservicio y marcación offline.
- Marcación administrativa con empleado declarado.
- Secuencia, idempotencia, concurrencia y correcciones.
- Horarios, mallas, turnos y jornada procesada.
- GPS, geocercas y evidencias.
- Reportes de asistencia y alertas.
- Integración marcación → jornada procesada → nómina.

## Reglas de evidencia

- Verifica al tip y recorre la cadena completa de migraciones. Una migración posterior puede corregir lo que un archivo aislado sugiere.
- Reproduce el hallazgo con seed local antes de reportarlo. Si no se reproduce, degrada a hipótesis.
- Los tests que solo leen el código fuente no prueban el flujo. Exige ejecución o navegador real.
- Contrasta la configuración real del tenant: parámetros laborales, conceptos de recargo, calendario, horarios y festivos.
- Separa incumplimiento legal, defecto funcional, control faltante y deuda técnica.
- No extraigas datos personales a documentos de auditoría. Anonimiza.

## Formato de hallazgo

```yaml
id: MAR-001
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

## Mapa del módulo

- API: `apps/api/src/modules/hr/routes.js`, `service.js`, `timeLogic.js`, `schema.js`, `policy.js`.
- Modelos: `TimePunch`, `ProcessedWorkday`, `WorkSchedule`, `TimeRoute`, `GpsPing`, `WorkSession`, `WorkActivity`, `RoutePreoperationalChecklist`.
- Tablas SQL: `th_novedades_jornada`, `th_novedad_historial`, `th_jornada_kilometrajes`, `th_parametros_laborales`, `th_calendario_dias`.
- Web: `apps/web/app/dashboard/talento-humano/marcacion`, `rutas`, `reportes`; cliente en `apps/web/lib/api.ts` y cola offline en `apps/web/lib/hrOfflineMarking.ts`.
- Tests: `apps/api/test/hr-marking-*`, `hr-route-*`, `hr-workday-*`; `apps/web/test/hr-offline-*`, `hr-monitor-*`, `hr-report-*`.
- Documentos: `docs/project/modulos/talento-humano.md`, `docs/DATA_GOVERNANCE_QA.md`, `docs/MULTITENANT_DATA_ISOLATION.md`.

## Trampas conocidas

- `processDay` usa `DEFAULT_PARAMS` y el primer horario activo global, no el horario del empleado.
- La hora nocturna difiere entre el procesamiento de jornada y la configuración de nómina. La matriz normativa debe resolver cuál es la correcta.
- Parámetros legales sembrados que no se leen en el código.
- `extra_minutes` se guarda en la marcación pero no alimenta la nómina.
- `TimeRoute.employees` es JSON de alias y nombres, no una FK de empleado.
- La corrección administrativa no guarda actor ni vínculo con la marca original.
- La auditoría global depende de Redis; sin Redis es noop.
- Las lecturas de asistencia, empleados y rutas pueden caer a Supabase con un modelo divergente.
- Listados truncados sin rango visible.
- La cola offline puede diferir la hora real de la marcación.

## Salida

1. `docs/audits/2026-10-30-marcaciones-nomina/hallazgos-marcaciones.md`.
2. Actualización de la matriz funcional con estados y evidencia.
3. Aporte al veredicto de marcaciones.
4. Traspaso explícito al auditor de nómina de los hallazgos que afecten el cálculo.

## Coordinación

- Entrega los hallazgos que impacten nómina a `apexos-auditor-nomina`.
- Escala de inmediato todo P0 al responsable del ciclo.
- No promociones, no commitees y no abras fixes desde esta skill.
