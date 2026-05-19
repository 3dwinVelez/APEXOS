# QA Setup

## Migraciones

La base QA se crea desde:

```bash
supabase/migrations/20260517143000_init_qa_saas_foundation.sql
```

Incluye:

- Tablas SaaS base.
- Indices de rendimiento.
- Triggers `updated_at`.
- Funciones helper de seguridad.
- RLS y politicas.
- Vistas utiles.
- Buckets privados de Storage para imagenes.
- Seed del plan `piloto_especial`.
- Seed de la empresa `Cliente Piloto QA`.
- Seed del catalogo global de modulos.

## Usuario QA

No se inserta `auth.users` manualmente desde migracion.

Paso manual recomendado:

1. Crear usuario QA desde Supabase Auth.
2. Copiar el `id` del usuario.
3. Insertar perfil:

```sql
insert into public.profiles (id, full_name, email, status)
values ('AUTH_USER_ID', 'Usuario QA', 'qa@example.com', 'active');
```

4. Asociar usuario a la empresa piloto:

```sql
insert into public.company_users (company_id, user_id, role, status)
select c.id, 'AUTH_USER_ID', 'owner', 'active'
from public.companies c
where c.name = 'Cliente Piloto QA';
```

## Usuarios Admin Plataforma y SCJ

Estado actual en QA:

- `auth.users`: usuarios QA creados y confirmados.
- Empresa `SCJ`: creada.
- Plan `scj_operacion_inicial`: creado.
- Modulos SCJ activos: `talento_humano`, `servicios`, `transporte`, `configuracion`, `administracion_apex`.
- Submodulo global: `platform_admin` en `/dashboard/administracion/suscripciones`.

Usuarios QA funcionales:

- `admin@apexos.qa`: admin global APEX OS, registrado en `platform_admins` y owner de empresas QA existentes.
- `scj@apexos.qa`: admin de empresa `SCJ`.

No guardar contrasenas planas en documentacion versionada. Las claves temporales se entregan por conversacion al responsable de QA.

Referencia de asociacion del usuario admin global:

```sql
insert into public.profiles (id, full_name, email, status)
values ('ADMIN_AUTH_USER_ID', 'Administrador APEX OS', 'admin@example.com', 'active')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  status = excluded.status,
  updated_at = now();

insert into public.platform_admins (user_id, status)
values ('ADMIN_AUTH_USER_ID', 'active')
on conflict (user_id) do update set status = 'active', updated_at = now();
```

Referencia de asociacion del usuario admin SCJ:

```sql
insert into public.profiles (id, full_name, email, status)
values ('SCJ_AUTH_USER_ID', 'Administrador SCJ', 'scj@example.com', 'active')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  status = excluded.status,
  updated_at = now();

insert into public.company_users (company_id, user_id, role, status)
select c.id, 'SCJ_AUTH_USER_ID', 'admin', 'active'
from public.companies c
where c.name = 'SCJ'
on conflict (company_id, user_id) do update set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();
```

## Consultas utiles

Empresas del usuario autenticado:

```sql
select * from public.v_user_companies;
```

Estado de modulos:

```sql
select * from public.v_company_module_status order by sort_order;
```

Modulos habilitados:

```sql
select * from public.v_company_enabled_modules where enabled = true;
```

## Datos operativos iniciales

Despues de asociar el usuario QA, se pueden crear:

```sql
insert into public.employees (company_id, first_name, last_name, document_type, document_number, email, position, department)
select id, 'Ana', 'Operaciones', 'CC', 'QA-EMP-001', 'ana.qa@example.com', 'Tecnico', 'Operacion'
from public.companies
where name = 'Cliente Piloto QA';
```

## Conexion Supabase completa

Configurar en frontend:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

La base QA queda preparada para:

- Database: tablas, vistas, politicas RLS e indices.
- Auth: usuarios en `auth.users` conectados con `profiles`.
- Storage: buckets privados `company-assets`, `user-avatars` y `service-images`.

```sql
insert into public.services (company_id, name, description, category, price)
select id, 'Servicio QA inicial', 'Servicio de validacion QA', 'operativo', 0
from public.companies
where name = 'Cliente Piloto QA';
```
