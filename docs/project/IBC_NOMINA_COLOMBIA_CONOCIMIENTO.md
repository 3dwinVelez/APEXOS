# Conocimiento normativo: IBC y novedades de nómina (Colombia)

**Versión:** 1.0
**Fecha:** 2026-10-15
**Alcance:** trabajadores dependientes del sector privado, régimen laboral ordinario.
**Propósito:** referencia para diseño y revisión; no sustituye concepto laboral, tributario ni validación final con el operador PILA.

La especificación funcional aportada por el usuario, `Especificacion_IBC_Novedades_Nomina_Colombia_2026.md` (borrador 1.0, 15 de octubre de 2026), sirve como referencia de requisitos y casos de uso. Las fuentes primarias indicadas abajo sustentan las reglas; las decisiones configurables no se consideran resueltas por el borrador. El usuario confirmó que «sanciones» significa suspensión disciplinaria sin remuneración.

## 1. Reglas confirmadas

| Tema | Regla confirmada | Fuente primaria |
|---|---|---|
| VAC/LR en salud y pensión | Vacaciones y permisos remunerados se cotizan íntegramente sobre el último salario base reportado antes del inicio. Incapacidad y licencia de maternidad tienen regla propia sobre el valor reconocido. | [Decreto 780/2016, arts. 3.2.5.1-3.2.5.2](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/decreto-0780-2016.pdf) |
| SLN | En huelga o suspensión temporal por causales del art. 51 CST no aporta el afiliado; aporta el empleador sobre el último salario base previo. PILA también identifica suspensión disciplinaria y licencia no remunerada en SLN. | [Decreto 780](https://normativa.colpensiones.gov.co/colpensiones/docs/decreto_0780_2016_pr057.htm), [Anexo Técnico 2 v30](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/OT/anexo-tecnico2-cotizantes.pdf) |
| ARL en vacaciones/SLN | Decreto 1072 art. 2.2.4.2.1.6, corregido por Decreto 1528/2015, establece que no se causan cotizaciones ARL durante vacaciones ni licencias/suspensiones no remuneradas. Días reportados en PILA no equivalen por sí solos a aporte causado. | [Decreto 1072 compilado](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1072_2015.pdf), [Decreto 1528](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=62875) |
| Vacaciones parafiscales | UGPP indica incluir para CCF, SENA e ICBF el valor reconocido por vacaciones disfrutadas, compensadas en dinero o pagadas en liquidación. | [UGPP ABC Empleadores 2026](https://www.ugpp.gov.co/wp-content/uploads/2026/01/ABC-Empleadores-2026.pdf) |
| Exoneración | ET 114-1 exonera, bajo condiciones, salud patronal, SENA e ICBF; no pensión ni CCF. Personas naturales deben emplear al menos dos trabajadores. | [ET compilado, DIAN](https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm) |
| Umbral exoneración | El umbral de 10 SMMLV se evalúa sobre lo que el trabajador devenga salarialmente; DIAN excluye pagos no constitutivos de salario. No usar IBC como sustituto. | [DIAN Concepto 8380/2024](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_8380_2024.htm), [DIAN Concepto 7196/2025](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_7196_2025.htm) |
| Redondeo | IBC: aproximación al peso superior. Aportes e intereses: aproximación al múltiplo de $100 superior. | [Decreto 1990/2016, art. 1, que modifica el art. 3.2.1.5 del Decreto 780](https://www.unidadvictimas.gov.co/wp-content/uploads/documentos-DD/decretos/DECRETO_1990_2016.pdf) |

## 2. PILA vigente y reglas operativas

La referencia operativa disponible para 2026 es el **Anexo Técnico 2, versión 30 (24-jul-2026)**. Enumera modificaciones posteriores a la Resolución 221/2024, entre ellas 738/2024, 2520/2024, 467/2025, 2064/2025 y 1529/2026. La versión debe configurarse por período.

- Un cotizante puede requerir múltiples registros tipo 2: uno por ingreso/retiro y uno por cada novedad que cambie el IBC.
- La suma de días de pensión, salud y ARL normalmente debe ser 30, aun en meses de 28, 29 o 31 días. Menos de 30 procede por ingreso o retiro, según las validaciones del anexo.
- Los campos de días aceptan 0 a 30. El Anexo puede exigir reportar días de VAC-LR o SLN en el campo de días ARL aunque el aporte ARL sea cero por la norma sustantiva.
- El aporte ARL se valida como `IBC ARL × tarifa ARL`; por ello deben almacenarse por separado días, IBC, tarifa y aporte.
- Para dependientes, el IBC de salud, pensión y ARL no debe ser inferior a 1 SMMLV o a su proporción por días cotizados, ni superior a 25 SMMLV, salvo excepción expresa del tipo de cotizante o planilla.

## 3. Matriz de diseño

| Novedad | Salud/pensión | ARL | Parafiscales | Estado |
|---|---|---|---|---|
| Trabajo | Salario cotizable actual, con piso/tope aplicable. | Base y tarifa de la actividad. | Pagos salariales cotizables. | Confirmada en alcance ordinario. |
| VAC disfrutadas | Último IBC/salario base previo al inicio, proporcional según PILA. | Novedad informada; no se causa aporte durante vacaciones. | Valor reconocido por vacaciones. | Confirmada; separar días reportados de aporte. |
| VAC compensadas sin descanso | No crear días VAC ni sumar automáticamente a SS. | No sumar por sí sola. | Incluir valor reconocido conforme a UGPP. | Confirmada en principio; revisar conceptos concurrentes y 40%. |
| Licencia remunerada | Decreto 780 exige cotización completa sobre base previa; el código PILA VAC-LR la agrupa con vacaciones. | La regla de cero de Decreto 1072 cubre vacaciones y licencias no remuneradas; para otra licencia remunerada parametrizar según exposición y acto soporte. | Clasificar pago según naturaleza. | Requiere decisión jurídica por tipo de licencia. |
| SLN / suspensión disciplinaria | Sin aporte ordinario del afiliado en el supuesto del art. 3.2.5.2; aporte patronal según tarifa PILA aplicable. | No se causa durante licencia/suspensión no remunerada; informar novedad/días conforme AT2. | Sin base por días no remunerados; conservar pagos de otros segmentos. | Confirmada con causal válida; no extender a toda ausencia. |

## 4. Casos A-D de la especificación de usuario

- **A, trabajo + VAC disfrutadas:** conservar referencia del IBC previo al inicio de vacaciones; calcular trabajo con base actual; parafiscales con el valor reconocido de vacaciones; ARL sin aporte por días VAC.
- **B, trabajo + SLN:** separar segmentos. No descontar 4%+4% por días SLN. La pensión patronal privada requiere parametrizar 12% o modalidad PILA que complete el 16%; la salud patronal depende de exoneración y tarifa aplicable.
- **C, salario + vacaciones compensadas:** no generar novedad VAC ni aporte adicional de salud/pensión/ARL por la compensación sin descanso; sí llevarla a la base parafiscal cuando corresponda.
- **D, vacaciones anticipadas en dos meses:** separar fecha de pago de fechas de disfrute; imputar novedad e IBC a los meses de disfrute; conciliar anticipos para evitar doble descuento o doble reconocimiento.

## 5. Configuración necesaria y pendientes

Debe ser parametrizable por período, razón social, tipo/subtipo de cotizante y operador:

1. SMMLV, topes, pisos, tarifas, redondeos, versión del Anexo Técnico PILA y excepciones por tipo de cotizante.
2. Elegibilidad de exoneración ET 114-1 y clasificación salarial/no salarial para el umbral de 10 SMMLV.
3. Causal exacta de SLN y soporte de suspensión disciplinaria o licencia no remunerada.
4. Naturaleza y exposición al riesgo de cada licencia remunerada distinta de vacaciones.
5. Reglas contables de anticipos de vacaciones, liquidación final y no duplicidad.
6. Validación de archivos y líneas con un operador PILA real antes de producción.

## 6. Fuera de alcance

Incapacidades, licencias parentales, salario integral, contratistas, aprendices, servidores públicos, pensionados, múltiples empleadores, regímenes especiales, trabajadores de tiempo parcial y novedades concurrentes no descritas requieren reglas propias. Los valores anuales de SMMLV no se fijan aquí.
