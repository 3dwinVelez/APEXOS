# Plantilla: Vehiculos

Maestro vehicular.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| plate | Placa | Si | texto | ABC123 | Ninguno | Unica por empresa, mayuscula |
| vehicle_type_code | Tipo vehiculo | Si | texto | camioneta | Tipos vehiculo | Debe existir |
| vehicle_brand_code | Marca vehiculo | No | texto | TOYOTA | Marcas vehiculo | Catalogo recomendado |
| line | Linea | No | texto | Hilux | Lineas vehiculo | Catalogo recomendado |
| model_year | Modelo/ano | No | entero | 2023 | Ninguno | 1900-2100 |
| color | Color | No | texto | Blanco | Catalogo recomendado | Texto |
| vin_chassis | VIN/chasis | No | texto | VINQA0001 | Ninguno | Unico recomendado |
| engine_number | Motor | No | texto | MOTQA0001 | Ninguno | Texto |
| fuel_type_code | Combustible | No | texto | diesel | Catalogo recomendado | Debe existir si viene |
| capacity_value | Capacidad | No | numero | 1000 | Ninguno | Mayor o igual a 0 |
| unit_code | Unidad capacidad | No | texto | KG | Unidades medida | Debe existir si viene |
| ownership_type_code | Tipo propiedad | Si | texto | propio | Catalogo tipo propiedad | Debe existir |
| legal_owner | Propietario legal | No | texto | SCJ | Terceros opcional | Texto |
| owner_document | Documento propietario | No | texto | 900123456 | Terceros opcional | Texto |
| cost_center_code | Centro costo | No | texto | CC-TRAN | Centros costo | Debe existir |
| location_code | Sede base | Si | texto | BOG-NORTE | Sedes | Debe existir |
| driver_user_code | Conductor autorizado | No | texto | USR-CON-001 | Usuarios | Debe existir y ser conductor |
| status | Estado | No | texto | activo | Estados vehiculo | Normalizar con API/Supabase |
| soat_expires | Vence SOAT | No | fecha | 2027-01-10 | Ninguno | `YYYY-MM-DD` |
| technical_review_expires | Vence tecnomecanica | No | fecha | 2027-02-15 | Ninguno | `YYYY-MM-DD` |
