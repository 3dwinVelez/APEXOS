# Guia de cargues maestros APEXOS

## Objetivo

Ordenar los datos maestros de APEXOS para que la plataforma sea parametrizable, consistente y preparada para cargues iniciales. Esta guia excluye datos transaccionales.

## Regla APEXOS

Todo campo reutilizable de clasificacion debe ser maestro/catalogo: codigo, nombre, descripcion, activo, orden visual y ambito global o por empresa.

## Usuario como maestro principal

El flujo correcto es:

1. Crear usuario.
2. Asignar rol/perfil.
3. Asignar tipo de usuario.
4. Asociar datos laborales/operativos si aplica.
5. Marcar perfil conductor, supervisor, tecnico o administrativo si aplica.

La tabla `employees` debe funcionar como extension laboral/operativa asociada a `user_id`, no como maestro principal independiente.

## Orden real de cargue

1. Empresas.
2. Roles/perfiles.
3. Tipos de usuario.
4. Tipos de documento.
5. Cargos.
6. Areas.
7. Sedes.
8. Bodegas.
9. Centros de costo.
10. Usuarios.
11. Tipos de tercero.
12. Terceros.
13. Tipos de vehiculo.
14. Vehiculos.
15. Categorias producto.
16. Unidades de medida.
17. Marcas producto.
18. Referencias/productos.
19. Tipos de actividad.
20. Tipos de servicio.
21. Formas/metodos de pago.
22. Bancos.
23. Catalogos contables basicos.

## Dependencias principales

| Maestro | Depende de |
| --- | --- |
| Usuarios | Empresa, rol, tipo usuario, tipo documento, cargo, area, sede |
| Vehiculos | Empresa, tipo vehiculo, sede, centro costo, usuario conductor opcional |
| Terceros | Tipo tercero, tipo documento, ciudad/DANE opcional |
| Referencias/productos | Categoria, unidad, marca |
| Centros de costo | Empresa, sociedad/sucursal si se usa contabilidad |
| Bodegas | Empresa, sede |

## Campos que no debe diligenciar el usuario

- `id`
- UUID internos
- `tenant_id`
- `company_id`
- `created_at`
- `updated_at`
- `created_by`
- hashes de password
- tokens
- campos calculados como score documental, balance, stock actual o audit logs.

## Reglas de unicidad sugeridas

- Empresa: `company_code`.
- Rol: `company_code + role_code`.
- Usuario: `company_code + email`.
- Tercero: `company_code + document_type_code + document_number`.
- Vehiculo: `company_code + plate`.
- Producto/referencia: `company_code + reference_code` o `item_code`.
- Catalogo: `company_code + catalog_code + item_code`.

## Recomendaciones para importador futuro

- Modo `dry_run` obligatorio.
- Resolver relaciones por codigo, no por id tecnico.
- Reporte por fila con errores y advertencias.
- Upsert configurable por llave natural.
- Validacion de RLS por empresa antes del cargue.
- Registro de lote de importacion.
- Separar QA y produccion.

## Checklist de esta fase

| Item | Estado |
| --- | --- |
| Usuarios como maestro principal | Definido en documentacion |
| Empleados como extension laboral | Definido como regla de arquitectura |
| Catalogos completos para plantillas iniciales | Documentados |
| Plantillas transaccionales retiradas | Completado |
| Ejemplos CSV con minimo 3 registros | Completado |
| Migracion base para catalogos | Creada como no destructiva |
| Selects conectados a catalogos | Pendiente de fase tecnica |
| API de catalogos | Pendiente de fase tecnica |
| Migracion de valores existentes a catalogos | Pendiente de datos QA |
