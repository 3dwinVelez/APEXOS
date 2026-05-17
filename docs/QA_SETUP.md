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
