# Module Access Control

## Modelo

APEX OS separa visibilidad del modulo y permiso operativo.

- `modules`: catalogo global visible para frontend.
- `plans`: planes comerciales.
- `plan_modules`: modulos incluidos o bloqueados por plan.
- `company_modules`: excepciones por empresa. Si existe una fila aqui, esta prima sobre el plan.

## Modulos iniciales

Habilitados para el piloto QA:

- `talento_humano`
- `servicios`
- `configuracion`

Visibles pero bloqueables inicialmente:

- `inventario`
- `crm`
- `ventas`
- `compras`
- `finanzas`
- `reportes`
- `wms`

## Regla operativa

Un modulo puede mostrarse bloqueado en frontend usando:

- `v_company_module_status`
- `v_company_enabled_modules`

Pero la operacion real debe validar siempre en backend/base de datos con:

```sql
app_private.has_company_module(company_id, 'codigo_modulo')
```

## Modulos prioritarios

`employees` exige modulo `talento_humano`.

`services` exige modulo `servicios`.

Si el modulo esta bloqueado, RLS impide consultar, insertar, editar o borrar datos reales aunque el usuario pertenezca a la empresa.
