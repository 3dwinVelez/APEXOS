# Supabase QA Validation

## Resumen

Se valido la conexion tecnica de APEX OS con Supabase QA para:

- Database
- Auth
- Storage
- RLS multiempresa
- Modulos por plan
- Talento Humano
- Servicios
- Rendimiento basico

## Resultados principales

| Area | Resultado | Detalle |
| --- | --- | --- |
| Proyecto QA | OK | `APEX-OS`, ref `jbirkghkekuifgfsgquq` |
| Legacy | OK | No se tocaron proyectos legacy |
| Produccion | OK | No se creo ni modifico produccion |
| Variables | OK | `.env.example` sin llaves reales, `.env` ignorado |
| Cliente Supabase | OK | Cliente centralizado creado en `apps/web/lib/supabaseClient.ts` |
| Service role frontend | OK | No se encontro uso de `service_role` |
| Database | OK | Tablas y vistas accesibles segun RLS |
| Auth | OK | Usuarios QA reales creados y login validado |
| Multiempresa | OK | Usuario A no ve datos de Empresa B y viceversa |
| RLS | OK | Validado con usuarios temporales en transaccion |
| Modulos por plan | OK | 3 activos, 7 bloqueados para piloto |
| SCJ | OK | Empresa SCJ creada con Talento Humano, Servicios, Transporte, Configuracion y Administracion APEX |
| Platform Admin | OK | Estructura, RLS, vistas, pantalla y usuario admin global validados |
| Talento Humano | OK | Crear, consultar, editar estado, unique document |
| Servicios | OK | Crear, consultar, editar estado, filtrar por company/status |
| Storage | Parcial OK | Buckets/politicas OK; subida binaria real pendiente por usuario Auth |
| Seguridad Advisor | OK | Sin lints de seguridad |
| Performance Advisor | OK con observacion | Se corrigio FK faltante y RLS initplan; quedan indices unused por ambiente sin carga |

## Pruebas tecnicas creadas

Archivo:

```text
scripts/validate-supabase-qa-rls.sql
```

La prueba:

- Crea usuarios Auth temporales.
- Crea Empresa A y Empresa B temporales.
- Crea roles `owner`, `admin`, `member`, `viewer`.
- Ejecuta SELECT, INSERT, UPDATE y casos bloqueados.
- Simula `auth.uid()`.
- Hace `rollback` al final.

## Resultado RLS

Pruebas en verde:

- Leer `modules`.
- Leer `plans`.
- Owner A ve Empresa A.
- Owner A no ve Empresa B.
- Owner B no ve empleados/servicios de Empresa A.
- Owner crea y actualiza empleados.
- Unique `(company_id, document_number)` funciona.
- Owner/admin operan servicios.
- Member lee empleados pero no crea.
- Viewer lee servicios con `auth.uid()` correcto y no actualiza.
- Storage bloquea acceso cruzado.

## Hallazgos corregidos

- Se creo cliente Supabase centralizado.
- Se agregaron helpers QA paginados.
- Se agrego indice `idx_company_modules_module_id`.
- Se optimizaron politicas de `profiles` usando `(select auth.uid())`.
- Se creo empresa `SCJ` con plan `scj_operacion_inicial`.
- Se agregaron modulos `transporte`, `administracion_apex` y `platform_admin`.
- Se creo tabla `platform_admins`, helper `app_private.is_platform_admin()` y vistas de administracion global.
- Se fusionaron politicas RLS de admin plataforma con politicas tenant para evitar multiples politicas permisivas por accion.
- Se creo el panel `/dashboard/administracion/suscripciones` para habilitar o bloquear modulos por empresa.

## Pendientes

- Ejecutar prueba real de logout desde UI.
- Ejecutar prueba real de upload/read/replace/delete por Storage API con token real.

## Usuarios QA creados

- `admin@apexos.qa`: admin global APEX OS, activo en `platform_admins`, owner de empresas QA existentes.
- `scj@apexos.qa`: admin de empresa `SCJ`.

Las contrasenas temporales no se guardan en documentacion versionada.

## Login y RLS real

Validado por REST/Auth:

- `admin@apexos.qa` obtiene token real.
- `scj@apexos.qa` obtiene token real.
- Admin global consulta `v_platform_companies` y ve `SCJ`, `Cliente Piloto QA`.
- SCJ consulta `v_platform_companies` y recibe 0 filas.
- SCJ consulta `v_user_companies` y ve solo `SCJ:admin`.
- SCJ ve 5 modulos habilitados: `talento_humano`, `servicios`, `transporte`, `configuracion`, `administracion_apex`.
