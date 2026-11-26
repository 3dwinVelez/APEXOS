# Jornadas ordinarias acumuladas importadas — 26/11/2026

## Caso reproducido

En QA se encontraron 21 filas importadas con `JORNADA_ORDINARIA`, 15 días, inicio 2026-11-01, fin 2026-11-15 y fecha de referencia 2026-11-15. La fecha de referencia es domingo. El cálculo anterior cambiaba el concepto completo a `DOM_FEST_DIURNO`, incluso para el acumulado de toda la quincena.

## Corrección

Se distingue un acumulado por su cantidad explícita de días, por un rango que abarca varias fechas o por minutos que superan un día calendario. Esa jornada conserva el tratamiento ordinario y se presenta como `SALARIO_BASICO`, según la regla existente de salario diario. La fecha de referencia deja de determinar el tratamiento de todo el acumulado.

Una jornada de un solo día mantiene la clasificación del calendario. Los códigos explícitos de horas extra, recargos y conceptos manuales no se cambian. Los metadatos conservan el código original y separan el periodo acumulado del tipo de día de referencia.

Los registros ya importados se pueden recalcular sin borrar ni volver a cargar el Excel. No se modifican automáticamente comprobantes definitivos anteriores.

## Verificación reproducible

```powershell
node --test apps/api/test/hr-adjustment-calendar-concept.test.js apps/api/test/hr-workday-novelties-contract.test.js apps/api/test/hr-payroll-adjustment-lock.test.js
$env:CERT_BROWSER_PORT='3321'
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-external-ordinary-local.js
```

El certificado exige PostgreSQL local, Chrome y Python con PyMuPDF para leer el PDF generado. `PDF_CERT_PYTHON` permite indicar el ejecutable de Python.

Primero ejecuta la regresión completa de liquidación de trabajador, prestaciones, libranzas, permisos y exclusión de nómina. Luego reproduce el archivo con 21 empleados sintéticos desde el navegador, importa un XLSX real, verifica salario y cantidades, abre el comprobante y repite la prueba tras recargar. También comprueba una jornada individual del domingo, una ordinaria entre semana, una hora extra explícita, rechazo de importaciones sin permisos, aislamiento entre empresas, omisión de duplicados, guardado definitivo, lectura del documento persistido y extracción del PDF real.

## Resultado

**Passed**: 32 pruebas unitarias/de contrato y 16 comprobaciones completas en PostgreSQL, API, navegador y PDF reales. El ejecutor aislado terminó con código 0, sin respuestas 5xx inesperadas y sin modificar la base de origen.

En los 21 empleados sintéticos, el acumulado quedó en una sola línea de salario ordinario de 15 días. La jornada individual del domingo conservó su concepto dominical, la jornada entre semana conservó su salario y la hora extra explícita permaneció separada. Tras recargar no fue necesario reimportar. La importación repetida omitió las 21 filas duplicadas. El documento definitivo reabierto y el PDF generado conservaron los conceptos corregidos. Se inspeccionó visualmente la página del PDF.

El certificado completo pasó después de sustituir el lector externo de PDF ausente por Python/PyMuPDF. No se omitió ese paso ni se aceptó la ejecución parcial anterior.

Evidencia local reproducible: `.local/hr-external-ordinary/`, incluidas las capturas del comprobante, el PDF y `certification.json`. Los archivos generados permanecen fuera del commit. SHA-256 de ese resultado: `05955934749c276a3fb03640f265f84cccf3d229cb759cebd98af0ff689fd5a3`.

No se ha desplegado esta corrección a QA ni se han alterado sus importaciones. La publicación posterior requiere su autorización independiente y las compuertas del repositorio.
