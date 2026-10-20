# Liquidacion por destinos / tiendas

Desarrollo local, rama `desarrollo`, 2026-10-19. Sin publicacion, promocion, migracion o modificacion masiva de historicos.

Se reutiliza TransportDeliveryPoint como maestro Destinos / tiendas en Administracion → Maestros de transporte. No se crea otro catalogo paralelo. El paquete permite agregar varias filas de destinos desde el maestro, con cliente, tarifas parametrizadas, cantidades y soportes de cobro. Incluye enlaces Configurar destinos / tiendas y Actualizar destinos para incorporar nuevas tiendas sin perder el borrador. El campo de guia/documento manual deja de mostrarse. La referencia interna necesaria para compatibilidad se genera en el servidor y no se solicita al usuario.

La API proyecta solo destinos activos de la empresa. En cada guardado valida su pertenencia, actividad y compatibilidad con el cliente. Guarda id y snapshot de nombre/codigo/direccion/ciudad; conserva los historicos aunque se desactive el destino. El detalle muestra el destino y mantiene compatibilidad con las referencias historicas. Los estados y permisos de liquidacion conservan sus controles.

## Evidencia

- `node scripts/certifications/transport-settlement-four-stages-local.js <TEMP>/apexos-destinations-local-20261019.json`: **83 controles aprobados**, incluyendo el auxiliar versionado `transport-settlement-destinations-local.js`. Crea tres tiendas por API del maestro, las agrega juntas a un paquete sin guias, verifica totales, cliente y snapshots oficiales, rechaza destinos inexistentes/inactivos/de otra empresa y verifica persistencia del snapshot al desactivar una tienda. Incluye la regresion de edicion historica y cuatro etapas del paquete.
- **59 pruebas aprobadas** de motor, consecutivos, criterios, RBAC e interfaz. Registro `<TEMP>/apexos-destinations-regression-20261019.log`.
- TypeScript, ESLint sobre las tres superficies modificadas y `git diff --check`: aprobados.
- Navegador: seleccion de dos tiendas, incorporacion automatica de su cliente vinculado, acceso al maestro y ausencia del campo guia/documento. Captura `<TEMP>/apexos-destinations-20261019.png`. Borrador de prueba descartado cerrando exclusivamente la pestaña temporal.

Los clientes, tiendas y paquetes sinteticos QA permanecen identificados en la base local. La prueba desactiva una tienda sintetica para verificar su exclusion y conservacion historica. No altera destinos reales. La evidencia local no autoriza promocion a develop/main.
