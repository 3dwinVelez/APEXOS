# Plantilla: Centros de costo

Catalogo contable/operativo por empresa. Hoy existe como `organization_tree` en configuracion contable.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| cost_center_code | Codigo | Si | texto | CC-OPER | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Operacion | Ninguno | No vacio |
| society_code | Sociedad | No | texto | SOC-SCJ | Catalogo contable | Si se usa contabilidad |
| branch_code | Sucursal | No | texto | BOG | Sedes/sucursales | Si se usa contabilidad |
| area_code | Area | No | texto | OPER | Areas | Debe existir si viene |
| active | Activo | No | booleano | true | Ninguno | Default true |
