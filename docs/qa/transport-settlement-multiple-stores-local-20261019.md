# Tiendas informativas por recorrido

Desarrollo local, `desarrollo`, 2026-10-19. Sin migracion de datos ni publicacion.

Cada bloque de cobro representa un recorrido y admite una o varias tiendas mediante casillas. La seleccion guarda `delivery_point_ids` y snapshots oficiales de todos los destinos en el mismo detalle. Agregar o quitar tiendas no cambia criterios, cantidades, metricas de paradas, precios ni totales. El boton Agregar recorrido crea otro bloque independiente de cobro. Se conserva lectura de historicos con `delivery_point_id` singular y se muestran todas las tiendas al reabrir.

Validacion:

- Certificacion HTTP versionada `scripts/certifications/transport-settlement-four-stages-local.js`, con auxiliar `transport-settlement-destinations-local.js`: **87 controles aprobados**. Tres tiendas en un solo detalle producen 109.000, el mismo precio al reducir a una o volver a tres; persistencia de todas las identidades al reabrir. Incluye controles de tenant, destinos inactivos, tarifas, estados y concurrencia. Resultado `<TEMP>/apexos-multiple-stores-20261019.json`.
- **60 pruebas aprobadas** de interfaz, motor, consecutivos, criterios y RBAC; incluye invariancia de precio/cantidad al marcar o desmarcar tiendas. Registro `<TEMP>/apexos-multiple-stores-tests.log`.
- TypeScript y git diff --check aprobados. ESLint sobre Liquidaciones y editor.
- Navegador local: tres tiendas seleccionadas, tarifa 500.000, cantidad 1 y total del paquete 500.000. Captura revisada `<TEMP>/apexos-multiple-stores-20261019.png`. Pestaña temporal cerrada sin guardar el borrador.

Se mantienen los permisos y bloqueos de paquetes aprobados/contabilizados/liquidados. Los historicos no se agrupan ni recalculan masivamente. La evidencia local no autoriza push o promociones.
