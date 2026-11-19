# Liquidación final: conceptos, nómina y libranzas

Implementación en `desarrollo`. Esta certificación no autoriza despliegue ni producción.

## Comportamiento

- `Ver` abre una ventana modal con todos los conceptos persistidos, cantidades, tarifas, devengos, descuentos, neto, prestaciones causadas/pagadas/pendientes y aplicación de libranzas.
- El servidor deriva el tipo de contrato y su fecha final del historial del empleado, con respaldo en la ficha para registros sin historial. No acepta sustituirlos con el tipo enviado por el navegador.
- Los pendientes se calculan con el motor de nómina por quincena: marcaciones, correcciones, jornadas externas, recargos y bonificaciones registradas. Se inicia después de la última nómina o desde el ingreso; puede indicarse un inicio explícito que no se superponga con documentos existentes.
- Una prueba no guarda ni excluye empleados. El documento guardado excluye al empleado de nuevas nóminas del rango cubierto y periodos posteriores, hasta su recontratación. No elimina nóminas previamente guardadas.
- Se intenta cancelar el saldo finito de cada libranza autorizada, en orden de fecha e identificador, hasta la capacidad disponible compartida. Las deducciones perpetuas no se convierten en una deuda finita.
- Crear, recalcular y borrar conservan o revierten los movimientos de libranza. La referencia `retiro:<id>` evita confundirlos con los movimientos de una nómina.

## Integración de prestaciones y conceptos manuales

La ampliación solicitada integra cuatro comprobantes de pago de prestaciones en el documento final. Usa los mismos saldos, documentos y líneas del módulo de pagos; las cesantías definitivas se reconocen al trabajador y los comprobantes se identifican como incluidos en el neto del retiro. No constituyen una segunda orden de pago. No pueden anularse por separado: se recalcula o revierte la liquidación final completa.

La prima se causa por semestre, las cesantías e intereses por año y las vacaciones conservan su acumulación con una base diferenciada. Los pagos anteriores se imputan a sus periodos. El cálculo considera los devengos históricos y pendientes, distingue salario básico de valores variables y excluye de la base de vacaciones las horas extras y el trabajo dominical/festivo. El detalle muestra el intervalo y la base de cada concepto. Al liquidar se consumen o concilian las provisiones anteriores y se registra únicamente el faltante; el snapshot previo permite revertirlo. Regenerar una provisión conserva lo pagado y no reabre el historial de un empleado liquidado.

Bonificaciones y conceptos manuales: registrar en Ajustes de nómina con empleado y periodo, antes de calcular el retiro. Los personalizados requieren una definición vigente en el maestro con clasificación salarial; un código desconocido bloquea el retiro en vez de asumir que es salarial. Los salariales entran en las bases aplicables y los no salariales no las aumentan salvo parametrización específica. Si el retiro ya está guardado, debe recalcularse para incorporar cambios. El salario básico no se suma de nuevo al componente variable.

Fuentes adicionales: [CST, artículos 127–128, 192, 253 y 306](https://jurinfo.jep.gov.co/normograma/compilacion/docs/codigo_sustantivo_trabajo.htm) y [Decreto 1072 de 2015, pago proporcional de intereses al retiro](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1072_2015.htm). El cálculo conserva los parámetros y datos registrados en el maestro; su exactitud requiere historia salarial y pagos anteriores completos.

## Criterio jurídico y política implementada

Consulta de fuentes oficiales: 18 de noviembre de 2026.

1. [Ley 1527 de 2012, artículos 3 y 22, compilación JEP](https://jurinfo.jep.gov.co/Normograma/compilacion/docs/ley_1527_2012.htm): exige autorización expresa; para operaciones de libranza protege la mitad del salario neto después de descuentos legales. No establece que todas las partidas de la liquidación final tengan una única base o porcentaje intercambiable.
2. [Código Sustantivo del Trabajo, artículos 149 y 151, Cancillería](https://www.cancilleria.gov.co/normograma/compilacion/docs/codigo_sustantivo_trabajo.htm): las deducciones de obligaciones del trabajador requieren el fundamento y la autorización que correspondan. No es suficiente que el total a pagar sea positivo.
3. [Concepto 226121 de 2023, Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=230514) y [Concepto 061121 de 2020](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=115697): orientaciones administrativas sobre descuentos al retiro, autorización y condiciones aplicables. Se consultaron los extractos oficiales indexados; la descarga directa respondió 502. Su contexto de empleo público no debe trasladarse sin revisión a cualquier contrato privado.

Decisión de producto: no descontar sin referencia de autorización específica para la liquidación final. Sobre salario se comparte una capacidad máxima de 50 % del neto salarial. Sobre prestaciones la capacidad es cero por defecto; cualquier porcentaje positivo exige registrar tanto autorización como referencia de revisión jurídica de su alcance. El rango permitido de 0 a 100 es una política parametrizada por caso y **no afirma que el 100 % sea siempre legal**. El sistema registra las referencias declaradas, no verifica el contenido del documento firmado. La indemnización queda fuera de la capacidad de libranza. Un saldo no cubierto permanece pendiente.

La capacidad automática no resuelve embargos, concurrencia de acreedores u órdenes judiciales: requieren evaluación particular y no se interpretan como libranzas ordinarias.

## Ejecución reproducible

```powershell
node --test apps/api/test/hr-termination-deductions.test.js
node --test apps/web/test/hr-workday-novelties-ui.test.mjs
npx tsc --noEmit --project apps/web/tsconfig.json
$env:CERT_BROWSER_PORT='3323'
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-termination-complete-local.js
```

El script crea una base local aislada con el esquema Docker, datos sintéticos y API real, y usa Chrome para buscar, calcular, guardar y consultar el detalle. Resultados y capturas locales: `.local/hr-termination-complete/`. Un estado distinto de `passed` en la certificación funcional o de aislamiento bloquea la promoción.

## Resultado local

Ejecución completada el 18 de noviembre de 2026 a las 19:56 (Bogotá): certificación funcional e aislamiento en `passed`, ocho recorridos completos y ningún HTTP 5xx inesperado. Pasaron 42 pruebas de API e interfaz, y TypeScript sin emisión.

Se verificaron contrato del maestro y conceptos de malla, permisos y separación de empresas, búsqueda y detalle modal en navegador, exclusión de la quincena en navegador y creación real de nómina conservando otro empleado activo, recontratación sin habilitar periodos antiguos, movimientos de libranza y recálculo sin duplicación, borrado y restitución de saldos, división de pendientes entre dos quincenas y bloqueo de nóminas superpuestas posteriores al retiro.

Las capturas `full-preview.png`, `saved-detail.png` y `payroll-excludes-terminated.png` documentan la interfaz real. Los JSON y capturas generados permanecen locales y no forman parte del commit.

## Candidato integrado para QA

La ampliación pasó once recorridos completos sobre el target actual de QA `d329b884ae91af1f7473526a70f88db5c7a26d46`, terminados el 18 de noviembre de 2026 a las 20:44 (Bogotá). Certificación funcional e aislamiento: `passed`, sin HTTP 5xx inesperados. La captura adicional `integrated-benefit-vouchers.png` comprueba que los cuatro pagos aparecen incluidos en el retiro y no ofrecen anulación independiente.

Pasaron 67 pruebas de API e interfaz, incluidas las regresiones vigentes de jornada nocturna, divisor horario, topes de horas extras, soporte de nómina sin marcaciones, libranzas, indemnización con SMMLV vigente, cierres e IBC. Se conservaron esos controles al reconstruir los cambios puntuales encima de `develop`; no se sustituyó el módulo por una copia antigua de `desarrollo`. Las pruebas dinámicas se ejecutaron con Redis deshabilitado y `--test-force-exit --test-timeout=60000`, para cerrar handles de infraestructura únicamente una vez concluidos los casos.

Los casos adicionales verifican los cuatro pagos habituales y su recálculo, regeneración de provisiones sin borrar lo pagado, conceptos personalizados salariales/no salariales, cierre de saldos al retiro, bloqueo de reaperturas/pagos duplicados y restauración de una provisión pendiente al revertir la liquidación.
