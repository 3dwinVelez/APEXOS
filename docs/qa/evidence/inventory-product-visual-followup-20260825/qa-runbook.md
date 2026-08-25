# Recorrido QA autenticado

Ambiente: `https://apexos-web-qa-production.up.railway.app`

1. Confirmar que QA sirve el commit promovido a `develop`.
2. Abrir Inventario y entrar por `Nuevo producto`.
3. Confirmar encabezado compacto y las pestañas Crear producto, Directorio y Trazabilidad.
4. Confirmar la ausencia de Centro de control, Plantillas rápidas, Acciones conectadas y Workspace de productos.
5. Verificar que los campos de sociedad, sucursal, familia, impuesto, costo, precio, stock, peso, volumen y perfiles siguen visibles.
6. Crear un registro controlado, recargar y comprobar persistencia; editarlo desde Directorio y reabrirlo.
7. Comprobar controles de lote, vencimiento y serial y la vista de Trazabilidad.
8. Recorrer Inventario, Contabilidad y Tesorería con rol autorizado; comprobar denegación visible con rol no autorizado.
9. Registrar cualquier módulo no habilitado para la sesión como pendiente de aprobación funcional, sin simular resultado.

No se autoriza `main` hasta completar este recorrido y obtener aprobación explícita del responsable QA.
