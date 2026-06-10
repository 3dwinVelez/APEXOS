# Plantilla: Catalogos contables basicos

Catalogos ya parcialmente existentes en contabilidad: cuentas PUC, sociedades, sucursales y centros de costo.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| catalog_type | Tipo catalogo | Si | texto | account | Ninguno | `account`, `society`, `branch`, `cost_center` |
| code | Codigo | Si | texto | 1105 | Ninguno | Unico por tipo/empresa |
| name | Nombre | Si | texto | Caja | Ninguno | No vacio |
| parent_code | Codigo padre | No | texto | 11 | Mismo catalogo | Debe existir si viene |
| account_type | Tipo cuenta | No | texto | asset | PUC | Para cuentas: asset/liability/equity/income/expense/cost/order |
| active | Activo | No | booleano | true | Ninguno | Default true |
