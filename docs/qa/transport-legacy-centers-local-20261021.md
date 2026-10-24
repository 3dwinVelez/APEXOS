# Centros contables históricos de Transporte

## Diagnóstico

En Demo APEX existen SOC-01, BR-0152 y los centros ESQ294, GTX 052 y JYX457 activos. Los vehículos 65, 68 y 69 conservan base operativa Principal, sin metadata.accounting_branch_code ni cost_center. Los centros anteriores no contienen vehicle_id. El resolver buscaba exclusivamente ese identificador, ignoraba el vínculo existente por código de placa y fallaba buscando una sucursal llamada Principal.

## Corrección local en desarrollo

vehicle-accounting.js reconoce primero el vínculo por vehicle_id; para registros anteriores resuelve el código exacto y, si no existe, una única coincidencia de placa sin espacios. Conserva el código histórico, nombre, sociedad y sucursal; no asigna una sucursal predeterminada. La vinculación se persiste dentro de la transacción de guardado/contabilización existente. No modifica centros ni vehículos durante la validación del Excel.

Rechaza varias coincidencias, centro inactivo, propietario distinto, sucursal inactiva, sociedad inconsistente y centros compartidos no vinculados al vehículo. Las colisiones y el bloqueo de cambio de centro tras importar siguen vigentes. La importación admite diferencias de espacios y muestra/contabiliza siempre el código resuelto en servidor. No se renombraron centros ni se alteraron comprobantes históricos.

## Evidencia

- 64/64 pruebas API de liquidaciones aprobadas: `node --test apps/api/test/transport-settlement*.test.js`.
- Certificación funcional versionada `scripts/certifications/transport-settlement-import-local.js`: 39/39 aprobadas. Fixtures locales independientes recrean centros sin vehicle_id, vehículos sin sucursal y centro BULK 02 con espacio, frente a dos sucursales activas. Incluye interfaz, permisos, aprobación independiente, documentos balanceados, cartera, aislamiento, reintentos, rollback y carga máxima de 200 filas/30 paquetes.
- Evidencia final: `C:/Users/mq1/AppData/Local/Temp/apex-settlement-import-4rxbZa/evidence.json`. Registra SHA256 de fuentes, incluido vehicle-accounting.js.
- Preview de los registros existentes de Demo APEX, sin importarlos: 3 paquetes válidos, 85.000 COP cada uno, total 255.000 COP, sociedad SOC-01, sucursal BR-0152 y centros ESQ294 / GTX 052 / JYX457. Evidencia de solo lectura: `C:/Users/mq1/AppData/Local/Temp/apex-settlement-template/real-validation.json`.
- Excel del Escritorio reemplazado por la copia corregida y verificado mediante SHA256. Se corrigió la fecha serial de exportación (el archivo anterior era interpretado como 1905) y se eligió una tarifa QA existente con cotización válida sin métricas adicionales. Fecha leída por el importador: 2026-10-21. Referencias y cantidades siguen siendo de ensayo.
- `git diff --check` aprobado. No hay cambios frontend en esta corrección. Los dos fallos web preexistentes descritos en transport-settlement-import-local-20261021.md siguen bloqueando publicación/promoción general.

Sin migraciones ni servicios remotos. No se importaron ni contabilizaron los tres paquetes de Demo APEX; el ciclo contable completo se ejecutó con empresas sintéticas locales. Reversión del código mediante los hunks revisados sobre la base actual; nunca reemplazar el árbol ni renombrar centros históricos.
