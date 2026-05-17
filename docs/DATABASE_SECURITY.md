# Database Security

## Principios

APEX OS usa una arquitectura SaaS multiempresa. Toda tabla operativa debe tener `company_id` y las consultas deben quedar protegidas por Row Level Security.

Reglas obligatorias:

- Una empresa no puede leer ni operar datos de otra empresa.
- Los usuarios solo acceden a empresas donde tienen una fila activa en `company_users`.
- Las operaciones administrativas quedan limitadas a roles `owner` y `admin`.
- Los modulos operativos requieren membresia activa y modulo habilitado.
- RLS no debe desactivarse para corregir errores.

## Helpers de seguridad

La migracion QA crea estas funciones en el schema interno `app_private`:

- `app_private.is_company_member(company_uuid uuid)`: valida que `auth.uid()` pertenezca activamente a la empresa.
- `app_private.is_company_admin(company_uuid uuid)`: valida que `auth.uid()` sea `owner` o `admin` activo.
- `app_private.has_company_module(company_uuid uuid, module_code text)`: valida acceso por excepcion en `company_modules` o por plan en `plan_modules`.

Las funciones son `security definer` para evitar recursion de RLS al consultar `company_users` desde politicas. No quedan en `public`, para evitar exponerlas como RPC directo en PostgREST.

## Tablas con RLS activo

- `companies`
- `profiles`
- `company_users`
- `company_modules`
- `employees`
- `services`
- `plans`
- `modules`
- `plan_modules`

## Politicas principales

- `companies`: miembros activos pueden ver su empresa; `owner/admin` pueden actualizar.
- `profiles`: cada usuario puede ver/actualizar su perfil; usuarios de una misma empresa pueden verse entre si.
- `company_users`: miembros ven relaciones de sus empresas; `owner/admin` administran usuarios.
- `company_modules`: miembros ven modulos de su empresa; `owner/admin` administran modulos.
- `employees`: miembros ven empleados solo si `talento_humano` esta habilitado; escrituras solo `owner/admin`.
- `services`: miembros ven servicios solo si `servicios` esta habilitado; escrituras solo `owner/admin`.

## Usuario QA

No se crean usuarios de Supabase Auth por SQL. El usuario QA debe crearse desde Supabase Auth o por flujo seguro de autenticacion. Luego se debe insertar:

1. `profiles.id = auth.users.id`
2. `company_users.company_id = Cliente Piloto QA`
3. `company_users.role = owner` o `admin`
4. `company_users.status = active`
