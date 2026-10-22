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

## Integración y publicación para QA (2026-10-21)

La corrección se registró como commit funcional `de1ce90e` sobre `desarrollo`, limitado a los seis archivos del incidente. El 21 de octubre se integró el `develop` vigente (`947f508b`) en la rama local y se generó el candidato integrado `853519a6ce74a974afceb7e2edf4cb4458c19b4f`, preservando el historial funcional.

- El diff neto contra `origin/develop` (`947f508b`) contiene únicamente seis archivos: servicio contable, pruebas API, pantalla de importación, pruebas web, script de certificación de navegador y este documento. Los dos manifiestos `docs/qa/manifests/opening-balances-nit-20261021-preqa.json` y `...-scope.json` se agregan para el gate pre-QA. No se incluyen archivos de Gastos, exportación PUC ni workflows.
- Autorización del usuario: «publica la corrección en QA» (2026-10-21; observada 2026-10-22T01:56:08Z), alcance `promotion_to_develop_for_qa`. Autoriza push de `desarrollo`, merge a `develop` y despliegue en QA; no autoriza `main` ni ramas auxiliares.
- La validación integrada aprobó sobre una copia Git temporal exacta del candidato, sin los cambios pendientes de Gastos ni PUC, con API en 3216, web en 3006 y PostgreSQL local en 55439. Las 30 pruebas unitarias y de regresión aprobaron.
- La compilación de producción con webpack y TypeScript aprobó con 126 páginas. La certificación real de navegador aprobó las 54 comprobaciones; el JSON generado en `docs/qa/evidence/opening-balances-error-20261020/integrated-20261021/browser-local.json` registra `generated_at` `2026-10-22T02:05:51.848Z` y el commit `853519a6`. El root confirmó que los cinco hashes SHA-256 de fuentes coinciden con el snapshot y que `git diff --quiet HEAD` sobre las cinco rutas funcionales no reporta diferencias. Los resultados del 20 de octubre se mantienen como antecedente histórico y no se reutilizan para esta certificación.
- Los manifiestos pre-QA y de alcance se actualizaron con los estados `passed` y los conteos reales. `qa_status` permanece `pending`; la promoción y el despliegue también permanecen pendientes.
- Railway reporta `PlatformOutage` ([incidente QH8L8B3E](https://status.railway.com/incident/QH8L8B3E)) con builds y despliegues pausados. La activación remota está bloqueada por el proveedor; el root reintentará el release después de los gates de GitHub.
- La evidencia generada no se versiona. Los archivos locales pendientes de Gastos, PUC y workflow se preservan fuera del alcance. La promoción solo puede avanzar después de aprobar los validadores pre-QA y de alcance; no requiere migraciones.
