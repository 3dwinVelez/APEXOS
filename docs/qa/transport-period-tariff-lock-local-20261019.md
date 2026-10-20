# Periodo automatico y valores del tarifario

Desarrollo local, rama `desarrollo`, 2026-10-19. Sin migracion, push, despliegue o recálculo masivo de historicos.

La creacion deja de solicitar Tipo y no permite elegir periodo. El servidor asigna al paquete vehicular un periodo mensual abierto YYYY-MM segun America/Bogota y lo congela en metadata.accounting_period. El formulario muestra ese mes en solo lectura. Si el mes esta cerrado, la operacion falla; no se reabre automaticamente ni se deriva a otro mes. Al contabilizar se conserva el mes asignado y se rechazan intentos de sustituirlo. Los paquetes historicos editables adoptan estas reglas cuando se guardan expresamente mediante el editor nuevo; los historicos que no se intervienen conservan su comportamiento anterior.

El PYG usa el mes contable asignado para los paquetes del nuevo modelo, incluso si la fecha del servicio corresponde a otro mes. La consulta filtra explicitamente tenant tanto en detalle como en paquete. Para historicos sin mes asignado conserva la seleccion anterior por fecha del servicio. Mantiene los estados de reconocimiento existentes del PYG y no genera una segunda fuente que duplique ingresos.

Descripcion del recorrido, valor unitario y metricas configuradas provienen del tarifario. La UI los muestra en solo lectura. El servidor reconstruye la descripcion y recalcula usando las metricas del tarifario para paquetes gobernados; no confia en la descripcion ni en importes enviados. Los ajustes manuales de importes quedan bloqueados para estos paquetes; los cambios deben realizarse en Costos y tarifas y luego reasignar la tarifa vigente. Las cantidades de servicios y los soportes siguen siendo datos operativos del recorrido. La seleccion informativa de tiendas no afecta importes.

## Evidencia ejecutada

- `node scripts/certifications/transport-settlement-four-stages-local.js <TEMP>/apexos-accounting-month-20261019.json`: **98 controles aprobados**, incluyendo auxiliar `transport-settlement-accounting-month-local.js`. Comprueba asignacion del mes pese a un periodo enviado diferente, tipo fijo interno, descripcion oficial, denegacion de cambio de periodo y ajustes manuales, aprobacion, incremento exacto del PYG actual con servicio de otro mes, ausencia de impacto duplicado en el mes del servicio y contabilizacion con el mes del sistema.
- **72 pruebas aprobadas**, incluyendo PYG, motor, RBAC, interfaz y bordes de mes/año en horario colombiano. Registro `<TEMP>/apexos-period-tariff-tests.log`.
- Certificacion versionada de navegador `transport-period-tariff-browser.mjs`: **11 controles aprobados**, incluidos ausencia de selector Tipo, periodo readonly, descripcion readonly y precio readonly, ademas de regresion de etiquetas. Resultado `<TEMP>/apexos-period-tariff-browser-20261019.json`.
- Capturas revisadas: `<TEMP>/apexos-period-automatic-20261019.png` y `<TEMP>/apexos-tariff-readonly-20261019.png`. Pestaña temporal cerrada sin guardar el borrador.
- TypeScript, ESLint y git diff --check aprobados.

Se conservan contratos y referencias internas de tipos/periodos de integraciones e historicos anteriores. La evidencia local no constituye autorizacion para publicar o promover a develop/main.
