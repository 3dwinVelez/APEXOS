# Plantilla: Empresas

Maestro base de tenant/empresa.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Codigo unico de empresa | Si | texto | SCJ | Ninguno | Unico |
| company_name | Nombre comercial | Si | texto | SCJ Logistica | Ninguno | No vacio |
| legal_name | Razon social | No | texto | SCJ Logistica SAS | Ninguno | Texto |
| tax_id | NIT/documento | No | texto | 901123456 | Tipo documento | Unico recomendado |
| status | Estado | No | texto | active | Estado empresa | `active`, `inactive`, `suspended`, `trial` |
| plan_code | Plan | No | texto | piloto_especial | Planes | Debe existir si se usa |
| country | Pais | No | texto | CO | Paises | ISO recomendado |
| city | Ciudad | No | texto | Bogota | Ciudades | Catalogo recomendado |

Generados por sistema: `id`, `created_at`, `updated_at`.
