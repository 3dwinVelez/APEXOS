# Matriz normativa — Marcaciones y Nómina (Colombia 2026)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-30 |
| Rama auditada | `desarrollo` |
| Commit auditado | `e25e177f8954d1c2c846046fade1275ebbeb6b21` |
| Marco | Colombia, vigencia 2026 |
| Estado | F1 — matriz construida; **firma jurídica/contable pendiente** |
| Uso | Insumo de `03-matriz-funcional-marcaciones.md` y `04-matriz-funcional-nomina.md` |

> Esta matriz traduce norma a **criterio verificable**. No declara cumplimiento: el estado de cada requisito lo determina F2 con evidencia ejecutada. La columna `veredicto legal` solo la firma jurídica o el contador.

## 1. Fuentes y vigencia

| Norma | Materia | Vigencia aplicada | Fuente consultada |
|---|---|---|---|
| Ley 2101 de 2021 | Reducción gradual de la jornada semanal | 44 h hasta 14-jul-2026; 42 h desde 15-jul-2026 | Mintrabajo; Actualícese |
| Ley 2466 de 2025, art. 10 | Jornada nocturna y recargo nocturno | 19:00–06:00; 35% | Gestor Normativo (Función Pública); Rankmi |
| Ley 2466 de 2025, art. 14 | Recargo dominical/festivo gradual | 80% hasta 30-jun-2026; **90% desde 01-jul-2026**; 100% desde 01-jul-2027 | Gestor Normativo; Actualícese; Alcaldía de Bogotá |
| Ley 2466 de 2025, arts. 12–13 | Registro de trabajo suplementario y topes | Registro escrito; máximo 2 h/día y 12 h/semana | Gestor Normativo; Circular Externa 101 de 2025 Mintrabajo |
| CST arts. 160–168 (modificados) | Recargos y horas extra | HED 25%, HEN 75%; HEDD 115% y HEND 165% en 2026-H2 | Actualícese (composición 25% + 90% y 75% + 90%) |
| Ley 100 de 1993, art. 18 | IBC y topes | Piso 1 SMMLV; techo 25 SMMLV | Ley 100; Decreto 780 de 2016 |
| Decreto 780 de 2016; Anexo Técnico PILA | Afiliación y aportes | Reglas de IBC, novedades y redondeo PILA | MinSalud |
| Decreto 1072 de 2015 | Registro y conservación de jornada | Soporte de jornada y novedades | Mintrabajo |
| Ley 1581 de 2012; Decreto 1377 de 2013 | Protección de datos personales | Datos de marcación, GPS y evidencia | SIC |
| Decreto 1625 de 2016 / ET | Retención en la fuente | UVT 2026 y procedimiento | DIAN |
| Ley 2101 / CST art. 161 | Distribución de jornada | La reducción semanal no reduce salario ni prestaciones | Mintrabajo |

Parámetros económicos 2026 usados como referencia de contraste:

| Parámetro | Valor 2026 | Uso en auditoría |
|---|---|---|
| SMMLV | $1.750.905 | Piso IBC, topes, auxilio |
| Auxilio de transporte | $249.095 | Devengo no salarial |
| Tope auxilio | 2 SMMLV | Elegibilidad |
| UVT | $52.374 | Retención (gap de alcance) |
| Jornada semanal | 44 h hasta 14-jul; 42 h desde 15-jul | Divisor de hora ordinaria |
| Divisor mensual | 220 h (44 h) / 210 h (42 h) | Hora ordinaria y extras |
| Recargo nocturno | 35% desde 19:00 | Clasificación de minutos |
| Recargo dominical/festivo | 90% desde 01-jul-2026 | Recargo de día especial |
| HED / HEN | 25% / 75% | Hora extra |
| HEDD / HEND 2026-H2 | 115% / 165% | Hora extra en día especial |

## 2. Matriz de requisitos — Marcaciones

| ID | Requisito | Norma | Criterio verificable | Evidencia esperada | Veredicto legal |
|---|---|---|---|---|---|
| MAR-N01 | La jornada nocturna inicia a las 19:00 y termina a las 06:00 | Ley 2466/2025 art. 10 | Todo minuto entre 19:00 y 06:00 se clasifica como nocturno y recibe 35% | Reproducción de `classifyMinute` con marca a las 19:30 y a las 20:30 | Pendiente |
| MAR-N02 | El recargo nocturno es 35% sobre la hora ordinaria | Ley 2466/2025 art. 10 | El valor liquidado por minuto nocturno ordinario es 0.35 × hora ordinaria, adicional al salario | Liquidación de un día nocturno contra cálculo manual | Pendiente |
| MAR-N03 | El recargo dominical/festivo es 90% desde 01-jul-2026 | Ley 2466/2025 art. 14 | Minutos ordinarios en domingo/festivo reciben 0.90 × hora ordinaria | Liquidación de un domingo contra cálculo manual | Pendiente |
| MAR-N04 | La hora extra diurna es 25% y la nocturna 75% | CST art. 168 | Minutos extra fuera de día especial reciben 1.25 / 1.75 | Liquidación de un día con extras contra cálculo manual | Pendiente |
| MAR-N05 | La hora extra diurna dominical/festiva es 115% en 2026-H2 | Ley 2466/2025 art. 14 + CST | Valor por hora = 2.15 × hora ordinaria | Liquidación de un domingo con extras contra cálculo manual | Pendiente |
| MAR-N06 | La hora extra nocturna dominical/festiva es 165% en 2026-H2 | Ley 2466/2025 art. 14 + CST | Valor por hora = 2.65 × hora ordinaria | Liquidación de un domingo nocturno con extras contra cálculo manual | Pendiente |
| MAR-N07 | La jornada semanal máxima es 42 h desde 15-jul-2026 | Ley 2101/2021 | El divisor mensual y el umbral de extra usan 42 h (210 h/mes) para el periodo | Parámetro vigente y cálculo de hora ordinaria | Pendiente |
| MAR-N08 | El trabajo suplementario no excede 2 h/día ni 12 h/semana | Ley 2466/2025 art. 13 | El sistema bloquea o alerta al superar los topes | Prueba con 3 h extra en un día y 13 h en una semana | Pendiente |
| MAR-N09 | El empleador lleva registro escrito del trabajo suplementario | Ley 2466/2025 art. 12 | Existe registro con trabajador, actividad, horas y carácter diurno/nocturno | Reporte exportable y consulta por periodo | Pendiente |
| MAR-N10 | La jornada y sus novedades se conservan y son trazables | Decreto 1072/2015 | Toda marcación, corrección y anulación conserva actor, fecha y motivo | Consulta de auditoría por marcación | Pendiente |
| MAR-N11 | La corrección de marcación exige justificación y aprobación | Control interno / Ley 2466/2025 art. 12 | No se altera una marca sin motivo, actor y revisión | Flujo de corrección con evidencia | Pendiente |
| MAR-N12 | El registro de jornada no puede alterarse sin dejar traza | Ley 1581/2012; Decreto 1072/2015 | Existe historial inmutable o bitácora de cambios | Consulta de bitácora | Pendiente |
| MAR-N13 | La marcación autoservicio se ancla al trabajador autenticado | Control interno | Un usuario no puede marcar por otro desde autoservicio | Prueba de suplantación | Pendiente |
| MAR-N14 | La marcación administrativa identifica al operador que la registra | Control interno | Toda marca creada por tercero conserva el actor | Consulta de la marca y su auditoría | Pendiente |
| MAR-N15 | El GPS y la evidencia se tratan como dato personal | Ley 1581/2012; Decreto 1377/2013 | Acceso restringido, finalidad declarada y retención definida | Revisión de permisos y retención | Pendiente |
| MAR-N16 | La marcación offline se sincroniza sin duplicar ni perder eventos | Control interno | Idempotencia verificable y reintento seguro | Prueba de replay y corte de red | Pendiente |
| MAR-N17 | La jornada procesada se genera de forma completa y oportuna | Decreto 1072/2015 | Toda marca cerrada del día produce una jornada procesada antes de liquidar | Flujo marcación → jornada → nómina | Pendiente |
| MAR-N18 | El descanso y los festivos se aplican según calendario | CST art. 172 y ss. | Domingo y festivo se clasifican como día especial; el descanso no se paga como ausencia | Procesamiento de un festivo y un descanso | Pendiente |
| MAR-N19 | Cada trabajador tiene asignada su jornada aplicable | CST art. 158 | La jornada procesada usa el horario del trabajador y no uno global | Prueba con dos horarios distintos | Pendiente |
| MAR-N20 | Las novedades de jornada se revisan antes de afectar nómina | Control interno | Una novedad pendiente no altera la liquidación sin aprobación | Flujo de novedad → aprobación → nómina | Pendiente |

## 3. Matriz de requisitos — Nómina

| ID | Requisito | Norma | Criterio verificable | Evidencia esperada | Veredicto legal |
|---|---|---|---|---|---|
| NOM-N01 | El salario mínimo y el auxilio de transporte 2026 se aplican por vigencia | Decreto salarial 2026 | Devengo mínimo de $2.000.000 con auxilio para quien califica | Liquidación de salario mínimo | Pendiente |
| NOM-N02 | El auxilio de transporte no es salario ni base de aportes | CST art. 128; Ley 1/1967 | El auxilio no integra IBC ni base de prestaciones | Detalle de la línea y base | Pendiente |
| NOM-N03 | El auxilio se paga a quien gana hasta 2 SMMLV | Ley 1/1967; Decreto 780/2016 | Elegibilidad por tope y proporcionalidad | Prueba en el límite | Pendiente |
| NOM-N04 | El IBC tiene piso de 1 SMMLV y techo de 25 SMMLV | Ley 100/1993 art. 18 | Aportes calculados dentro de topes y pisos, con o sin novedades | Cálculo de IBC en los cuatro extremos | Pendiente |
| NOM-N05 | Los aportes a salud y pensión se calculan sobre el IBC correcto | Ley 100/1993 | 4% empleado y 8.5%/12% empleador sobre IBC | Comparación contra cálculo manual | Pendiente |
| NOM-N06 | La exoneración de aportes aplica solo si hay elegibilidad explícita y soporte | ET art. 114-1; Ley 1607/2012 | Sin soporte no se exonera | Prueba con y sin soporte | Pendiente |
| NOM-N07 | El fondo de solidaridad pensional se calcula por rangos de IBC | Ley 100/1993 | Tarifa por rango correcta y sin duplicar | Prueba en cada rango | Pendiente |
| NOM-N08 | El redondeo PILA se aplica según el anexo técnico | Anexo Técnico PILA | Valores enteros y regla de redondeo consistente | Comparación de aportes | Pendiente |
| NOM-N09 | Las horas extra y recargos se liquidan con la tarifa vigente del periodo | Ley 2466/2025; CST | Tarifa por concepto coincide con la norma del periodo | Recalculo independiente de un caso por concepto | Pendiente |
| NOM-N10 | El divisor de hora ordinaria corresponde a la jornada vigente | Ley 2101/2021 | 220 h antes del 15-jul-2026; 210 h después | Prueba en ambos periodos | Pendiente |
| NOM-N11 | La prima de servicios es 1 salario semestral proporcional | CST art. 306 | 30 días por semestre, proporcional a días | Cálculo de un semestre completo y uno parcial | Pendiente |
| NOM-N12 | Las cesantías son 1 salario anual proporcional | CST art. 249 | 30 días por año, proporcional a días | Cálculo anual y parcial | Pendiente |
| NOM-N13 | Los intereses a las cesantías son 12% anual | Ley 50/1990 art. 99 | Interés proporcional a días | Cálculo de un año | Pendiente |
| NOM-N14 | Las vacaciones son 15 días hábiles por año | CST art. 186 | 15 días hábiles proporcionales | Cálculo de un año y uno parcial | Pendiente |
| NOM-N15 | Las prestaciones se provisionan y se causan por separado del pago | CST; práctica contable | Provisión periódica y saldo por trabajador | Reporte de provisiones y saldos | Pendiente |
| NOM-N16 | El cierre del periodo consolida nómina, aportes y provisiones | Control interno | El cierre bloquea y totaliza los tres componentes | Documento de cierre | Pendiente |
| NOM-N17 | La reapertura exige motivo, actor y autorización | Control interno | No se reabre un periodo cerrado sin traza | Prueba de reapertura | Pendiente |
| NOM-N18 | No se puede liquidar dos veces el mismo periodo sin control | Control interno | Idempotencia o recálculo explícito | Prueba de doble liquidación | Pendiente |
| NOM-N19 | Los ajustes y libranzas se aplican sin duplicar y con soporte | Control interno | Cada ajuste tiene concepto, periodo y actor | Consulta de ajustes | Pendiente |
| NOM-N20 | La liquidación de retiro usa el salario y la norma vigentes | CST arts. 249 y ss. | Indemnización y prestaciones calculadas con parámetros vigentes | Prueba de retiro | Pendiente |
| NOM-N21 | La retención en la fuente se calcula cuando aplica | ET arts. 383 y ss. | Procedimiento 1 o 2 con UVT vigente | Gap de alcance si no existe | Pendiente |
| NOM-N22 | El archivo PILA se genera y coincide con la liquidación | Anexo Técnico PILA | Totales del archivo iguales a los aportes liquidados | Gap de alcance si no existe | Pendiente |
| NOM-N23 | Los conceptos tienen código contable y asiento | Marco contable | Cada línea permite asiento y cuadre | Gap de alcance si no existe | Pendiente |
| NOM-N24 | La nómina solo paga días con soporte de jornada, descanso o novedad | CST art. 158 | Ausencia no justificada no se paga; descanso sí | Prueba con ausencia y descanso | Pendiente |
| NOM-N25 | El costo patronal refleja aportes y provisiones, no solo el devengo | Control gerencial | `employer_cost` = devengo + aportes patronales + provisiones | Comparación de un caso | Pendiente |
| NOM-N26 | La segregación de funciones impide liquidar, aprobar y pagar con el mismo rol | Control interno / COSO | Roles separados y auditados | Matriz RBAC y prueba | Pendiente |
| NOM-N27 | El cierre no puede forzarse sin registrar la excepción | Control interno | El forzamiento exige motivo y actor | Prueba de cierre forzado | Pendiente |
| NOM-N28 | Todo cálculo queda auditado con actor y versión de parámetros | Control interno / Ley 1581/2012 | Bitácora de liquidación y parámetros usados | Consulta de auditoría | Pendiente |

## 4. Requisitos transversales de datos y control

| ID | Requisito | Norma / marco | Criterio verificable | Evidencia esperada | Veredicto |
|---|---|---|---|---|---|
| TRV-01 | Aislamiento multi-tenant en toda lectura y escritura | Contrato del producto; Ley 1581/2012 | Ninguna consulta devuelve filas de otro tenant | Prueba cruzada de tenants | Pendiente |
| TRV-02 | El contexto de tenant no puede perderse en consultas sincrónicas | Contrato del producto | Operaciones fuera de `runWithTenant` no leen datos globales | Revisión de ALS y prueba | Pendiente |
| TRV-03 | Las lecturas del cliente no caen a un almacén divergente en silencio | Control interno | Si la API falla, el cliente informa y no sustituye datos | Prueba con API caída | Pendiente |
| TRV-04 | Los datos personales tienen finalidad, acceso y retención definidos | Ley 1581/2012; Decreto 1377/2013 | Política aplicada a GPS, evidencia y marcación | Revisión de accesos y retención | Pendiente |
| TRV-05 | La auditoría de dominio no depende de infraestructura opcional | Control interno | Si Redis no está, la auditoría igual se registra | Prueba sin Redis | Pendiente |
| TRV-06 | Las operaciones críticas son idempotentes y concurrentes-seguras | Control interno | Replay y concurrencia no duplican ni pierden | Pruebas de carga y replay | Pendiente |
| TRV-07 | Existe certificación E2E del flujo marcación → jornada → nómina → cierre | Política QA del repositorio | El flujo completo corre en QA con evidencia | Certificación versionada | Pendiente |

## 5. Puntos que requieren firma jurídica o contable

1. **Recargo dominical 2026-H2**: confirmar 90% y su composición con la hora extra (HEDD 115%, HEND 165%).
2. **Divisor mensual**: confirmar 220 h para el periodo 01-ene a 14-jul-2026 y 210 h desde 15-jul-2026, y si el cliente usa un divisor distinto por convención.
3. **Jornada nocturna**: confirmar la aplicación plena de 19:00–06:00 en todos los tenants y la fecha de corte.
4. **Topes de horas extra**: confirmar si el producto debe **bloquear** o solo **alertar**; la norma fija el tope, no la sanción interna.
5. **Registro de trabajo suplementario**: validar si el reporte actual cumple el artículo 12 o si requiere autorización previa y firma.
6. **IBC en novedades**: confirmar tratamiento de licencias, vacaciones y suspensiones en el IBC.
7. **Auxilio de transporte**: confirmar proporcionalidad en quincenas y en periodos parciales.
8. **Provisión vs. pago de prestaciones**: confirmar que el cliente acepta provisión periódica y pago por evento.
9. **Retención en la fuente, PILA y contabilidad**: confirmar si están en alcance contractual; hoy se registran como gaps.
10. **Retención de datos de GPS y evidencia**: definir plazo y base legal.

## 6. Criterio de cierre de F1

- [x] Requisitos P0/P1 traducidos a criterio verificable.
- [x] Parámetros 2026 con fuente.
- [x] Separación marcaciones / nómina / transversales.
- [ ] Revisión y firma de jurídica/contador (bloquea el veredicto legal).
- [ ] Confirmación del alcance contractual sobre PILA, retención y contabilidad.
