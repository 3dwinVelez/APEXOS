# PDF de liquidacion para facturar

Desarrollo local, rama `desarrollo`, 2026-10-19. Sin commit, push, despliegue ni promocion.

El boton «PDF para facturar» aparece en paquetes liquidados. El endpoint exige lectura del modulo, empresa autenticada y estado liquidada. El documento contiene empresa, consecutivo, vehiculo/centro de costos, periodo, clientes, rutas, tiendas informativas, cantidades, soportes y valores. Anexa capturas del componente real de etapa 4 por tarifario y parametros utilizados. El formato es soporte para facturacion.

La definicion completa se conserva al asignar tarifas; al liquidar se respalda tambien la version exacta de registros anteriores. Los historicos usan metadata adicional sin cambiar su esquema ni sobrescribir su calculo. Si su version completa ya no existe, el anexo lo informa y conserva los valores liquidados. Nunca sustituye una version historica por la tarifa vigente. Los datos de impresion se entregan exclusivamente al navegador aislado mediante interceptacion interna; la pagina publica no contiene informacion del paquete.

## Evidencia local

- Certificacion versionada `scripts/certifications/transport-settlement-four-stages-local.js`, integrada con `transport-settlement-pdf-local.js`: 120 controles aprobados. Archivo `<TEMP>/apexos-settlement-pdf-certified-20261019.json`. Cubre ciclo completo, PDF binario, rechazo anonimo, estado previo, aislamiento multiempresa y dos tarifarios. El valor conservado de 500.000 permanece despues de crear una version de 700.000; total 525.000.
- Compatibilidad del flujo historico: `transport-settlement-packages-local.js`, 69/69 aprobados en `<TEMP>/apexos-pdf-legacy-20261019.json`. Incluye liquidacion y respaldo del tarifario en metadata.
- Regresion conjunta: 109 pruebas aprobadas en `<TEMP>/apexos-pdf-complete-tests-20261019.log`; despues de corregir el respaldo historico, las cuatro pruebas de `transport-settlement-report.test.js` vuelven a pasar, incluida la nueva comprobacion de snapshot historico y valor unitario por cantidad.
- TypeScript aprobado. ESLint sin errores, dos advertencias anteriores en `apps/web/lib/api.ts`. `git diff --check` aprobado.
- Boton ejecutado desde la interfaz en paquete de prueba LIQ-000107; captura `<TEMP>/apexos-settlement-pdf-button-20261019.png`.
- PDF final `<TEMP>/apexos-settlement-pdf-final-20261019.pdf`: tres paginas revisadas visualmente, resumen vertical y dos anexos horizontales, sin avisos globales de la aplicacion. Validador versionado `verify-transport-settlement-pdf.py`, resultados e imagenes en `<TEMP>/apexos-settlement-pdf-final-preview/`.

El generador utiliza Puppeteer y el navegador Edge instalado localmente. La configuracion de otros ambientes y su certificacion no forman parte de esta entrega. Los ejemplos contienen datos sinteticos de prueba.
