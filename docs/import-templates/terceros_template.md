# Plantilla: Terceros

Maestro de clientes, proveedores y otros terceros. No representa documentos transaccionales.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| third_party_type_code | Tipo tercero | Si | texto | customer | Tipos tercero | Debe existir |
| name | Nombre comercial | Si | texto | Cliente Demo Norte | Ninguno | No vacio |
| legal_name | Razon social | No | texto | Cliente Demo Norte SAS | Ninguno | Texto |
| person_type | Tipo persona | No | texto | juridica | Catalogo recomendado | `natural`, `juridica` |
| document_type_code | Tipo documento | No | texto | NIT | Tipos documento | Debe existir |
| document_number | Documento | No | texto | 901111222 | Ninguno | Unico recomendado |
| verification_digit | DV | No | entero | 5 | Ninguno | Puede calcularse |
| tax_responsibilities | Responsabilidades | No | lista | R-99-PN | Fiscal | Separado por `;` |
| email | Correo | No | email | contacto@example.com | Ninguno | Formato email |
| phone | Telefono | No | texto | 6015550101 | Ninguno | Texto |
| address | Direccion | No | texto | Calle 10 20 30 | Ninguno | Texto |
| city_code | Ciudad | No | texto | 11001 | Ciudades DANE | Debe existir si viene |
| segment | Segmento | No | texto | retail | Segmentos | Catalogo recomendado |
| credit_limit | Cupo | No | numero | 5000000 | Ninguno | Mayor o igual a 0 |
| credit_days | Dias credito | No | entero | 30 | Ninguno | Mayor o igual a 0 |
| active | Activo | No | booleano | true | Ninguno | Default true |
