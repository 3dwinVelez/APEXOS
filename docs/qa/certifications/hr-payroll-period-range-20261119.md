# Nomina: coherencia del periodo quincenal

## Alcance

Correccion en desarrollo del ingreso de un mes completo como nomina quincenal. La interfaz informa el error y bloquea consultar/calcular/liquidar/cerrar. La API rechaza el rango antes de generar documentos, borrar documentos por recalculo o reabrir un cierre.

Las quincenas admitidas son 1-15 y 16-ultimo dia del mismo mes (incluye febrero y anios bisiestos). La clave debe coincidir con el tipo y fechas. El calculo interno del retiro conserva su intervalo proporcional dentro de la quincena y su clave natural para recuperar ajustes.

No se modifican documentos historicos ni registros remotos. Este cambio no recalcula la nomina erronea existente.

## Evidencia local

- `node --test apps/api/test/hr-payroll-period.test.js apps/api/test/hr-termination-benefits.test.js apps/api/test/hr-termination-deductions.test.js apps/api/test/hr-termination-manual-adjustments.test.js`: 21/21.
- Verificacion TypeScript de la pagina y sus dependencias con configuracion temporal local, sin los directorios Next generados historicos: aprobada (`npx tsc --noEmit -p .local/hr-payroll-period/tsconfig.json --types node`).
- Certificacion versionada: `scripts/certifications/hr-termination-complete-local.js`, mediante el wrapper de base PostgreSQL local aislada. Incluye seis rechazos HTTP 400, comprobacion de ausencia de escrituras, clave inconsistente, bloqueo en Chrome y recuperacion del flujo valido, junto con las regresiones del retiro.
- Resultado integral: **aprobado, 13/13 recorridos**, del 2026-11-19T15:31:23.648Z al 2026-11-19T15:32:39.330Z. Base aislada `apexos_cert_hr_assoc_1795102267653`; base origen sin modificar; cero respuestas HTTP 5xx inesperadas. Artefactos locales no versionados en `.local/hr-termination-complete/certification.json`, `isolated-certification.json` y `payroll-invalid-fortnight.png`.
- Ajustes de la certificacion: el selector de fecha debe excluir los checkboxes homonimos del configurador de columnas; la espera de red admite las conexiones del servidor de desarrollo. Las pruebas de otra quincena deben generar una nueva clave acorde con las fechas, pues la discrepancia ahora se rechaza deliberadamente. Los intentos anteriores fallidos no constituyen aprobacion.

## Publicacion

Sin push, promocion ni despliegue. Se requiere certificacion integral aprobada, manifiestos de alcance/pre-QA y autorizacion explicita para promover por desarrollo -> develop -> main.
