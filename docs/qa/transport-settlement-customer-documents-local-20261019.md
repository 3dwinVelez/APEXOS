# Clientes y edicion documental de liquidaciones

Ambiente local, rama `desarrollo`, 2026-10-19. Sin commit, push, promocion o migracion.

El editor de documentos sustituye Servicio libre por Cliente del servicio. Usa el mismo maestro Party y criterio customer de Ventas, mediante una proyeccion de solo id/nombre/NIT protegida por lectura de Transporte. El servidor valida cliente activo de la empresa autenticada y guarda su identidad y snapshot; no confia en el nombre enviado. Los clientes sinteticos QA creados durante la certificacion permanecen identificados como tales en la base local.

El detalle historico usa el mismo editor que la creacion. Precarga los documentos existentes, sus criterios y soportes; permite asignar el vehiculo a un paquete antiguo sin vehiculo y reemplazar sus criterios por tarifas parametrizadas. No elimina documentos existentes. El endpoint PUT documents valida version, estado, pertenencia de cada identificador, duplicados, cliente y precios del servidor; actualiza en transaccion, recalcula totales y audita antes/despues. Conserva los ajustes por documento. Los ajustes globales previos requieren revision separada y bloquean la conversion para no perder efectos contables. Se mantienen los bloqueos de estados aprobada, contabilizada y liquidada. El contrato POST historico conserva compatibilidad para integraciones previas; la nueva edicion exige cliente en todos los documentos.

Evidencia:

- `node scripts/certifications/transport-settlement-four-stages-local.js <TEMP>/apexos-documents-local-20261019.json`: 72 controles aprobados. Incluye auxiliar versionado transport-settlement-documents-local.js: crear cliente en Ventas, encontrarlo en Transporte, convertir historico sin vehiculo, rechazar cliente inexistente y de otra empresa, rollback, nombre oficial, editar conservando id sin duplicar, soporte al reabrir, version obsoleta, cliente obligatorio, auditoria y bloqueo tras aprobacion. Tambien recorre las cuatro etapas, consecutivos y tarifas de la certificacion preexistente.
- 58 pruebas de motor, consecutivo, criterios, RBAC e interfaz aprobadas. Registro `<TEMP>/apexos-documents-regression-20261019.log`.
- TypeScript y ESLint sobre Liquidaciones y SettlementDocumentsEditor, y git diff --check.
- Navegador: seleccion real de vehiculo y cliente del maestro en el nuevo formulario. Captura `<TEMP>/apexos-document-customer-20261019.png`. Se cerro la pestaña de prueba sin guardar el borrador ni modificar la sesion del usuario.

No se migraron paquetes historicos masivamente ni se reabrieron paquetes cerrados. Cada conversion ocurre expresamente al guardar un paquete editable. Esta evidencia local no autoriza publicacion ni promocion a develop/main.
