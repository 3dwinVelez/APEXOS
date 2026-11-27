# Equivalencia de horas ordinarias de un acumulado — 26/11/2026

## Diagnóstico

La consulta de prueba de QA confirmó cinco empleados con salario mensual 1.750.905 y una línea ordinaria importada presentada incorrectamente como `DOM_FEST_DIURNO`, cantidad 120, tasa 7.503,88 y valor 900.465,43. La prueba remota fue solo una previsualización; no se generaron documentos definitivos.

A la clasificación incorrecta corregida en `180ef5e9` se sumaba otra causa: los acumulados importados como días, sin horas, se convertían con ocho horas fijas por día. Así, 15 días se mostraban como 120 horas.

## Corrección

Para acumulados ordinarios sin minutos explícitos se utiliza la equivalencia salarial `días × horas mensuales configuradas / 30`. Con 210 horas mensuales, 15 días equivalen a 105 horas. Se utiliza la vigencia efectiva del parámetro mensual, sin fijar 105 como una constante.

Las horas explícitas del archivo y las marcaciones reales conservan su cálculo. Las jornadas individuales mantienen el comportamiento existente. El salario del acumulado sigue liquidándose por días: `1.750.905 / 30 × 15 = 875.452,50`; la vista sin decimales muestra 875.453. Es el básico bruto, separado de otros devengos y descuentos.

## Validación

```powershell
node --test apps/api/test/hr-accumulated-ordinary-time.test.js apps/api/test/hr-adjustment-calendar-concept.test.js apps/api/test/hr-workday-novelties-contract.test.js apps/api/test/hr-payroll-adjustment-lock.test.js
$env:CERT_BROWSER_PORT='3321'
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-external-ordinary-local.js
```

Resultado: **36 pruebas aprobadas y 17 comprobaciones completas aprobadas** en API/PostgreSQL/Chrome/PDF reales, con cero respuestas 5xx inesperadas y sin modificar la base local de origen.

- XLSX real de 21 empleados con salario mensual 1.750.905, 15 días y fecha de referencia domingo.
- Salario ordinario 875.452,50 y 105 horas equivalentes para cada acumulado.
- Jornada individual del domingo y hora extra explícita conservadas.
- Un registro con 120 horas explícitas conserva sus 120 horas.
- Divisor configurado en 220 produce 110 horas equivalentes, conservando 875.452,50 de salario; al restaurar 210 vuelve a 105.
- Recarga, omisión de duplicados, guardado y reapertura del documento definitivo.
- PDF extraído e inspeccionado: fila `Salario`, cantidad 15, unidad DIA e importe 875.452,50.
- Regresión completa de liquidación de trabajador, prestaciones, libranzas, permisos y aislamiento.

Evidencia reproducible local en `.local/hr-external-ordinary/`, fuera del commit. SHA-256 de `certification.json`: `86c4441bfb73ab2660d648ce2102fd6d101bed416b8d21ccba95096fc2e35716`.

Implementación en desarrollo. No se desplegó a QA ni se modificaron sus importaciones. Tras el despliegue autorizado bastará volver a generar la liquidación de prueba; los documentos definitivos previos no se modifican automáticamente.
