# Plantillas de datos maestros APEXOS

Esta carpeta contiene solo plantillas de datos maestros y catalogos base para parametrizar APEXOS. No incluye plantillas transaccionales como servicios ejecutados, rutas realizadas, marcaciones, actividades de jornada, proyectos o movimientos.

## Guia principal

- `GUIA_CARGUES_MAESTROS_APEXOS.md`: orden de cargue, dependencias, reglas y riesgos.
- `AUDITORIA_MAESTROS_APEXOS.md`: maestros existentes, faltantes, quemados en codigo y campos libres que deben migrar a selects.
- `NO_APLICA_DATOS_MAESTROS.md`: elementos retirados de esta fase por ser transaccionales.

## Plantillas maestras

- `empresas_template.md`
- `roles_template.md`
- `tipos_usuario_template.md`
- `usuarios_template.md`
- `cargos_template.md`
- `areas_template.md`
- `sedes_template.md`
- `bodegas_template.md`
- `centros_costo_template.md`
- `tipos_tercero_template.md`
- `terceros_template.md`
- `tipos_documento_template.md`
- `tipos_vehiculo_template.md`
- `marcas_vehiculo_template.md`
- `vehiculos_template.md`
- `categorias_producto_template.md`
- `unidades_medida_template.md`
- `marcas_producto_template.md`
- `referencias_template.md`
- `tipos_actividad_template.md`
- `tipos_servicio_template.md`
- `formas_pago_template.md`
- `bancos_template.md`
- `catalogos_contables_template.md`

## Ejemplos CSV

Los CSV de ejemplo estan en `examples/`. Todos usan datos ficticios y referencias cruzadas por codigo (`company_code`, `role_code`, `user_type_code`, `document_type_code`, etc.), no por ids tecnicos.

## Regla de diseno

Todo campo reutilizable de clasificacion debe venir de un catalogo activo/inactivo y, cuando aplique, parametrizable por empresa.
