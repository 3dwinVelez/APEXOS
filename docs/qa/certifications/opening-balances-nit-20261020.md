# Saldos históricos: NIT del tercero y fecha de corte

Revisión del 20 de octubre de 2026. Implementación y pruebas escritas mediante Qoder CLI con DeepSeek-Flash; Codex reprodujo el incidente, revisó el código y ejecutó las validaciones.

## Reproducción real en QA

Se descargó la plantilla desde la pantalla de Saldos iniciales de Cliente Piloto QA y se diligenciaron dos filas balanceadas por 1.000 débito/crédito, con cuentas transaccionales existentes, sucursal `001`, centro `001-1` y corte `2025-12-31`.

- Sin tercero: la validación fue correcta.
- Con el NIT numérico de un tercero activo comprobado en el maestro: QA respondió `404`, `Fila 5: tercero no encontrado o inactivo`.
- La previsualización del archivo sin tercero mostró `30/12/2025` aunque el archivo indicaba `2025-12-31`.

La causa comprobada del rechazo es que la búsqueda anterior interpretaba cualquier tercero formado por dígitos como `Party.id` en lugar de buscar su `tax_id`. Esto podía rechazar un NIT existente o asociar un tercero incorrecto si coincidía con otro ID interno. La fecha se desplazaba al presentar la medianoche UTC en hora colombiana.

Solo se ejecutó validación en QA; no se confirmaron los saldos de prueba. Evidencia local: `docs/qa/evidence/opening-balances-error-20261020/qa-existing-nit-rejected.jpg` y archivos XLSX de reproducción.

## Corrección revisada

- Busca primero el `tax_id` exacto de un tercero activo usando el cliente ya limitado a la empresa.
- Conserva el ID interno como alternativa únicamente cuando no existe una coincidencia de NIT y el valor es un entero positivo seguro dentro del rango PostgreSQL Int.
- Un NIT exacto inactivo bloquea la asociación accidental a otro tercero cuyo ID coincida. Los NIT largos no se convierten a Int.
- Mantiene el tercero vacío como opcional y los errores controlados para terceros inexistentes, inactivos o fuera de la empresa.
- La plantilla aplica formato de texto a cuenta, centro, sucursal y tercero para conservar códigos como `001`; los encabezados siguen en la fila 4.
- La previsualización presenta el calendario UTC de la fecha de corte y evita el desplazamiento de día.

No se cambiaron importes, signos, reglas de cuentas transaccionales, numeración, idempotencia ni restricciones contables. No hay migraciones ni cambios de configuración, permisos o componentes compartidos.

## Validación ejecutada

- **24 pruebas aprobadas**: `node --test apps/api/test/accounting-opening-balances.test.js apps/api/test/accounting-chart-tree.test.js apps/web/test/contabilidad-opening-balances.test.mjs`.
- Compilación de producción Next.js 16.3.5 con webpack y TypeScript aprobada; 125 páginas generadas.
- Certificación real versionada `scripts/certifications/opening-balances-nit-browser-local.js`: **54 comprobaciones aprobadas**, con Chromium, API y PostgreSQL locales. Sin simulación de solicitudes ni manipulación del estado de React.
- Recorrido real: login, descarga de plantilla, carga de Excel, previsualización, confirmación del navegador, contabilización con NIT, persistencia del tercero en ambas líneas, asiento balanceado, archivo duplicado rechazado sin documentos adicionales e importación sin tercero con `party_id` nulo.
- Casos adicionales: NIT contra ID coincidente, ID anterior, NIT largo, tercero inactivo, inexistente y de otra empresa. Se verificó la fecha en navegador configurado en `America/Bogota`.
- El JSON final está en `docs/qa/evidence/opening-balances-error-20261020/browser-local.json`, estado `passed`, fecha `2026-10-21T02:07:23.330Z`. Los cinco hashes de fuentes coinciden con los archivos finales. Capturas, XLSX y JSON generados se conservan localmente y se excluyen de commits.
- `git diff --check` aprobado. Se retiraron de la configuración las rutas introducidas por la compilación local.

## Estado de publicación

Corrección local en `desarrollo`, base `b9b977716bc4d442e1bc0cde59b5ae78ffb2d531`. QA todavía ejecuta la versión que reproduce el fallo; no se hizo push, merge ni despliegue en esta tarea.

La promoción posterior requiere autorización independiente, manifiesto pre-QA y alcance exacto contra el destino remoto vigente, siguiendo `desarrollo → develop → main`. Los cambios previos de Gastos, exportación PUC y workflow se preservaron y deben mantenerse fuera de una promoción puntual de este incidente.
