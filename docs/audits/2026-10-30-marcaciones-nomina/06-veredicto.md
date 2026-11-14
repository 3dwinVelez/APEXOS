# Veredicto — Auditoría de Marcaciones y Nómina

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama auditada | `desarrollo` |
| Commit auditado | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Alcance | Diagnóstico F0–F3, solo lectura |
| Marco legal | Colombia 2026, con validación humana pendiente |
| Veredicto | **NO APTO para producción sin remediación** |
| Vigencia | Este veredicto aplica al commit indicado; cualquier cambio posterior exige reauditoría |

## 1. Resumen ejecutivo

La auditoría reconstruyó el funcionamiento real de marcaciones y nómina en `desarrollo` y contrastó el código y las migraciones con la matriz normativa Colombia 2026. Se documentaron **13 hallazgos en marcaciones** (12 funcionales y 1 transversal) y **18 en nómina**, con evidencia de archivo y línea.

Los defectos más graves no son de presentación: afectan el dinero que recibe el trabajador y el que se causa al sistema de seguridad social. Los bloqueadores son:

1. La hora nocturna se procesa desde las 21:00, no desde las 19:00 (MAR-001).
2. Las horas extra dominicales diurnas y nocturnas se pagan al 105%/155% en lugar de 115%/165% (MAR-004, NOM-002).
3. El divisor de 220 horas no existe; los periodos anteriores al 15-jul-2026 usan 210 (NOM-003).
4. El IBC no aplica topes ni pisos cuando no hay novedades segmentadas (NOM-001).
5. El cierre no provisiona prestaciones y reporta provisión cero (NOM-004).
6. La libranza se descuenta dos veces al relicitar sin recalcular (NOM-005).
7. El auxilio de transporte entra en la base de prestaciones (NOM-006).
8. La jornada procesada no se genera automáticamente; sin ella, la nómina no paga días ni extras (MAR-002).
9. La indemnización de retiro depende de una variable de entorno no configurada (NOM-009).
10. No hay aprobación de novedades, actor en marcas administrativas ni ciclo de aprobación/pago (MAR-006, MAR-007, NOM-012).

Mientras estos puntos sigan abiertos, el módulo no debe promoverse a `develop` ni a `main` para uso productivo, y no puede declararse cumplimiento legal.

## 2. Veredicto por módulo

### Marcaciones

| Dimensión | Veredicto | Sustento |
|---|---|---|
| Exactitud del cálculo | **NO APTO** | Noche 21:00; HEDD/HEND 105/155; reporte vs. nómina divergente |
| Oportunidad de la jornada | **NO APTO** | Solo procesamiento manual; sin cron ni disparador |
| Asignación de jornada | **NO APTO** | Horario global `schedules[0]`; sin horario por empleado |
| Control y trazabilidad | **NO APTO** | Sin actor en marca administrativa; sin aprobación de novedades; sin corrección trazable |
| Topes legales | **NO APTO** | 2 h/día y 12 h/semana no se leen |
| Autoservicio e idempotencia | **APTO con reservas** | Anclaje al usuario autenticado y cola offline correctos; falta prueba de replay y concurrencia |
| Datos personales | **PARCIAL** | Acceso por tenant/rol; sin política de retención de GPS y evidencia |

### Nómina

| Dimensión | Veredicto | Sustento |
|---|---|---|
| IBC y aportes | **NO APTO** | Topes/pisos solo con novedades; fallback a salario mensual sin documentos |
| Tarifas y divisor | **NO APTO** | HEDD/HEND y divisor 220 |
| Prestaciones | **NO APTO** | Cierre no provisiona; auxilio en base; provisión sin marcaciones |
| Cierre y reapertura | **NO APTO** | Cierre forzable; reapertura sin motivo; total de provisiones siempre 0 |
| Libranzas y ajustes | **NO APTO** | Doble descuento; anulación sin actor |
| Retiro | **NO APTO** | Indemnización con variable de entorno |
| Ciclo del documento | **NO APTO** | Siempre `draft`; sin aprobación ni pago |
| Retención, PILA y contabilidad | **GAP DE ALCANCE** | No implementados; requieren decisión contractual |
| Trazabilidad | **PARCIAL** | Actor en creación; sin versión de parámetros ni auditoría de cambios |

### Transversal

| Dimensión | Veredicto | Sustento |
|---|---|---|
| Aislamiento multi-tenant | **PARCIAL / NO VERIFICABLE** | El middleware cubre modelos Prisma; las consultas crudas dependen del SQL. Falta prueba cruzada |
| Fallback de lecturas | **NO APTO** | `/hr/workdays` y `/hr/schedules` devuelven `[]` en silencio |
| Segregación de funciones | **NO APTO** | Bypass administrativo total; sin SoD de nómina |
| Certificación E2E | **NO APTO** | No existe certificación del flujo marcación → jornada → nómina → cierre |

## 3. Bloqueadores de promoción (P0)

| # | Hallazgo | Tipo | Por qué bloquea |
|---|---|---|---|
| 1 | MAR-001 | legal/económico | Subpaga 2 h de recargo nocturno por turno |
| 2 | MAR-002 | operativo | Sin jornada procesada no hay nómina correcta |
| 3 | MAR-003 | operativo | Horarios individuales se ignoran |
| 4 | MAR-004 / NOM-002 | económico | Subpaga 10 puntos por hora extra dominical/festiva |
| 5 | MAR-005 | legal | No aplica topes de trabajo suplementario |
| 6 | MAR-007 | legal/control | Novedades afectan nómina sin aprobación |
| 7 | MAR-010 | económico | Reporte y nómina no cuadran |
| 8 | NOM-001 | económico/legal | IBC sin topes ni pisos |
| 9 | NOM-003 | económico | Divisor 220 inexistente |
| 10 | NOM-004 | operativo/económico | Cierre sin provisión y total en cero |
| 11 | NOM-005 | económico | Doble descuento de libranza |
| 12 | NOM-006 | económico | Auxilio en base de prestaciones |
| 13 | NOM-007 | económico/control | Auxilio y provisión sin marcaciones |
| 14 | NOM-009 | económico/legal | Indemnización de retiro mal calculada |

## 4. Qué sí funciona

Para no perder lo construido, se reconocen como bases aprovechables:

- **Autoservicio anclado al usuario autenticado**: `ownOperationalInput` fuerza el empleado del token; no se pudo suplantar por parámetro.
- **Idempotencia de marcación**: clave de idempotencia, lock por empleado/ruta/día y cola offline en `localStorage`.
- **Motor de segmentación IBC**: cuando hay novedades segmentadas, aplica caps, floors, exoneración, redondeo PILA y auditoría por segmento.
- **Fórmulas de provisión**: prima, cesantías, intereses y vacaciones están implementadas con fórmulas correctas en el módulo de provisiones.
- **Estructura de documentos**: `th_nomina_documentos` guarda líneas, resumen de origen y actor de creación; el PDF de recibo existe.
- **Aislamiento en modelos Prisma**: el middleware inyecta `tenant_id` en los modelos declarados.
- **Vigencia normativa 2026**: SMMLV, auxilio, tope de exoneración y parámetros base están sembrados con valores correctos.

## 5. Qué no se puede concluir todavía

Este veredicto es **funcional y de código**. No declara cumplimiento legal ni cuantifica el pasivo real. Falta:

1. Reproducción con datos QA anonimizados y cálculo manual independiente.
2. Confirmación de la configuración real de cada tenant (parámetros, conceptos, afiliaciones).
3. Firma de jurídica y contador sobre la matriz normativa.
4. Certificación E2E del flujo completo.
5. Prueba cruzada de tenants y de concurrencia.
6. Decisión contractual sobre retención, PILA y contabilidad.

Por tanto, el delta económico de los hallazgos está expresado como fórmula y caso de referencia, no como pasivo certificado.

## 6. Decisión recomendada

1. **Congelar** promociones de marcaciones y nómina hasta cerrar los P0 de la Fase 1.
2. **Abrir Fase 0** (línea base y datos QA) y **Fase 1** (P0 legal/económico) del plan `05-plan-remediacion.md`.
3. **Escalar a jurídica/contador** la matriz normativa y los puntos de firma.
4. **No promocionar** ningún paquete sin cálculo manual, prueba automatizada y certificación E2E.
5. **Reauditar** el commit resultante antes de cualquier paso a `develop` o `main`.

## 7. Firmas requeridas

| Rol | Nombre | Firma | Fecha |
|---|---|---|---|
| Responsable de Talento Humano | | | |
| Responsable de Nómina / Contabilidad | | | |
| Jurídica | | | |
| QA funcional | | | |
| Arquitectura / Backend | | | |

Sin las firmas de jurídica y contador, este documento no puede usarse como declaración de cumplimiento legal.

## 8. Criterio de cierre de F3

- [x] Matriz normativa construida.
- [x] Matrices funcionales de marcaciones y nómina construidas.
- [x] Hallazgos consolidados con evidencia y severidad.
- [x] Plan de remediación por fases.
- [ ] Línea base económica con datos QA.
- [ ] Firma jurídica/contable.
- [ ] Certificación E2E.
- [ ] Reauditoría del commit corregido.

**Veredicto final:** los módulos auditados no están aptos para producción en el commit `e25e177f8954d1c2c846046fade1275ebbeb6b21`. La remediación es viable, pero requiere corrección de datos, motor, controles y certificación antes de cualquier promoción.
