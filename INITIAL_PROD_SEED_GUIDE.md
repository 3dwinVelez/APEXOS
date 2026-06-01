# Guia de seed inicial productivo

Script: `scripts/seed-production-initial.js`  
NPM: `npm run seed:production:initial`

## Estado

**No ejecutar en la fase de replica estructural vacia.**

Este script queda preparado para la fase posterior de cargue inicial controlado, una vez `PRODUCTION_SETUP.md` y `RELEASE_PRODUCTION_GO_LIVE_CHECKLIST.md` confirmen que Supabase PROD esta estructuralmente igual a QA, vacio y sin datos demo.

## Objetivo

Cargar datos maestros iniciales de una empresa en Supabase produccion de forma controlada, idempotente y sin borrar registros, solo cuando ya se autorice el cargue inicial.

## Protecciones

El script no corre si no se define:

Para QA:

```powershell
$env:TARGET_ENV="qa"
$env:CONFIRM_QA_SEED="true"
```

Para produccion:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PROD_SEED="true"
```

Variables obligatorias:

- `SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INITIAL_USER_PASSWORD` o `temporary_password` por usuario en el archivo JSON

El script:

- No ejecuta deletes.
- No imprime claves sensibles.
- Hace upsert por claves naturales.
- Genera contadores de insertados, actualizados y omitidos.
- Crea usuarios Auth solo si no existen.

## Datos que carga

- Empresa cliente.
- Buckets privados requeridos.
- Catalogos base:
  - roles/perfiles
  - tipos de usuario
  - sedes
  - areas
  - cargos
  - centros de costo
  - tipos de documento
  - tipos de vehiculo
  - marcas de vehiculo
  - parametros base
- Usuarios Auth.
- Perfiles.
- Membresias por empresa.
- Empleados asociados a usuario.
- Modulos activos por empresa.
- Vehiculos y conductor autorizado por documento.

## Prueba ejecutada contra QA

Comando usado:

```powershell
$env:TARGET_ENV="qa"
$env:CONFIRM_QA_SEED="true"
$env:INITIAL_USER_PASSWORD="***"
node scripts/seed-production-initial.js
```

Resultado:

- Script ejecutado correctamente contra Supabase QA.
- Buckets existentes omitidos.
- Empresa, catalogos, usuarios, membresias, empleados y modulos actualizados por upsert.
- Vehiculo inicial creado.
- No se borraron datos.

Resumen de contadores de la prueba:

```json
{
  "buckets.omitted": 9,
  "companies.updated": 1,
  "master_catalogs.updated": 10,
  "master_catalog_items.updated": 29,
  "company_modules.updated": 6,
  "auth_users.omitted": 3,
  "profiles.updated": 3,
  "company_users.updated": 3,
  "employees.updated": 3,
  "vehicles.inserted": 1
}
```

## Uso en produccion

1. Crear Supabase PROD.
2. Aplicar migraciones.
3. Confirmar backups/PITR.
4. Preparar archivo JSON con datos reales o usar variables seguras.
5. Ejecutar:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PROD_SEED="true"
$env:SUPABASE_URL="https://<prod-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<server-only-prod-service-role>"
$env:INITIAL_USER_PASSWORD="<temporary-strong-password>"
npm run seed:production:initial
```

## Archivo JSON opcional

Puede definirse `PROD_SEED_FILE` para usar datos reales:

```powershell
$env:PROD_SEED_FILE="C:\secure\apexos-prod-seed.json"
```

El JSON debe seguir esta estructura:

```json
{
  "company": {
    "code": "CLIENTE-PROD",
    "name": "Cliente Produccion",
    "legal_name": "Cliente Produccion S.A.S.",
    "tax_id": "900000000-0",
    "email": "admin@cliente.com",
    "phone": "+57 300 000 0000",
    "country": "CO",
    "city": "Bogota",
    "address": "Direccion",
    "business_line": "operaciones"
  },
  "modules": ["configuracion", "administracion_apex", "talento_humano", "transporte", "servicios", "proyectos"],
  "catalogs": {
    "sedes": [{ "code": "SEDE-PRINCIPAL", "name": "Sede principal" }],
    "areas": [{ "code": "OPER", "name": "Operacion" }],
    "cargos": [{ "code": "CONDUCTOR", "name": "Conductor" }],
    "centros_costo": [{ "code": "CC-OPER", "name": "Operacion" }]
  },
  "users": [
    {
      "email": "admin@cliente.com",
      "full_name": "Administrador Cliente",
      "role": "admin",
      "role_code": "ADMIN_EMPRESA",
      "user_type": "administrativo",
      "document_type": "CC",
      "document_number": "1000000001",
      "temporary_password": "Cambiar-Esto-2026!",
      "position_code": "ADMIN_EMPRESA",
      "area_code": "ADMIN",
      "location_code": "SEDE-PRINCIPAL",
      "cost_center_code": "CC-ADMIN"
    }
  ],
  "vehicles": [
    {
      "plate": "ABC123",
      "type": "camioneta",
      "brand": "TOYOTA",
      "model": "Hilux",
      "year": 2024,
      "authorized_driver_document": "1000000003"
    }
  ],
  "buckets": ["company-assets", "user-avatars", "service-images", "vehicle-documents", "route-evidence", "general-attachments", "accounting-documents", "operational-evidence", "user-documents"]
}
```

## Validacion posterior

Despues del seed:

- Login del admin inicial.
- Cambio de contrasena temporal.
- Ver empresa en Administracion APEX.
- Ver modulos activos.
- Ver usuarios y empleados.
- Ver vehiculos.
- Probar RLS con usuario admin y usuario operativo.

## Riesgos

- Los roles Prisma/API siguen siendo una fuente separada de `company_users.role`; no se escriben automaticamente para evitar duplicidad accidental.
- Si el frontend usa rutas server-side administrativas, `SUPABASE_SERVICE_ROLE_KEY` debe estar configurada solo en runtime server.
- El JSON productivo debe guardarse fuera del repo si contiene correos reales, documentos o contrasenas temporales.
