# APEXOS / NYVORA - Preparacion de Produccion sin Cutover

Estado: produccion preparable, sin activar cliente real  
Branch base: `develop`  
Commit QA base: `495c001 fix: stabilize QA readiness blockers`

## Objetivo

Levantar Supabase produccion pago y Railway produccion con DB/Auth/Storage/API/frontend separados de QA, sin reemplazar QA ni apuntar dominios reales hasta completar el checklist final.

**Ajuste clave:** Supabase PROD debe ser una replica estructural de QA, pero vacia. No se ejecuta seed productivo, no se copian datos demo y no se cargan datos reales en esta fase.

## 1. Crear Supabase produccion

1. Crear proyecto Supabase nuevo en la organizacion productiva.
2. Seleccionar region definitiva.
3. Seleccionar plan pago antes de cargar datos reales.
4. Guardar en gestor de secretos:
   - Project ref.
   - Project URL.
   - Anon key.
   - Service role key.
   - Postgres connection string/pooler.
5. No copiar datos demo de QA.
6. No ejecutar seed productivo todavia.

## 2. Aplicar estructura

Ejecutar migraciones SQL en orden ascendente desde `supabase/migrations/`. Estas migraciones contienen estructura, RLS, policies, funciones, triggers, indices, buckets y algunos catalogos tecnicos. Algunas migraciones historicas tambien insertan datos QA; por eso el paso 3 de limpieza es obligatorio para produccion vacia.

1. `20260517143000_init_qa_saas_foundation.sql`
2. `20260517150000_harden_qa_catalog_rls.sql`
3. `20260517153000_move_security_helpers_private.sql`
4. `20260517160000_configure_private_image_storage.sql`
5. `20260517171000_optimize_qa_rls_indexes.sql`
6. `20260517180000_platform_admin_and_scj_seed.sql`
7. `20260517183000_merge_platform_admin_rls_policies.sql`
8. `20260517184500_seed_qa_auth_users.sql`
9. `20260517185000_fix_qa_auth_user_tokens.sql`
10. `20260517201819_remote_history_placeholder.sql`
11. `20260517201927_remote_history_placeholder.sql`
12. `20260517202138_remote_history_placeholder.sql`
13. `20260517203352_remote_history_placeholder.sql`
14. `20260517205752_remote_history_placeholder.sql`
15. `20260517210942_remote_history_placeholder.sql`
16. `20260517211358_remote_history_placeholder.sql`
17. `20260517213559_remote_history_placeholder.sql`
18. `20260517213722_remote_history_placeholder.sql`
19. `20260518102000_complete_apexos_module_catalog_and_company_setup.sql`
20. `20260518110000_company_groups_and_initial_admin.sql`
21. `20260518123000_operational_field_service_foundation.sql`
22. `20260519090000_vehicle_master_record.sql`
23. `20260519103000_route_preoperational_checklist.sql`
24. `20260520120000_active_modules_supabase_readiness.sql`
25. `20260521114500_apex_projects_module.sql`
26. `20260521153000_hr_operational_traceability.sql`
27. `20260522101000_overtime_extension_evidence.sql`
28. `20260523170000_qa_hardening_rls_indexes.sql`
29. `20260527120000_master_catalogs_foundation.sql`
30. `20260528100000_user_master_hardening.sql`

Comando recomendado con Supabase CLI:

```powershell
supabase link --project-ref <prod-project-ref>
supabase db push
```

Alternativa controlada:

```powershell
psql "<PROD_DATABASE_URL>" -f supabase/migrations/<archivo>.sql
```

### 2.1 Aplicar estructura Prisma/API

QA tambien contiene tablas Prisma CamelCase creadas desde `apps/api/prisma/schema.prisma`. Para que PROD sea replica funcional de QA, aplicar schema Prisma despues de las migraciones SQL:

```powershell
$env:DATABASE_URL="<PROD_DATABASE_URL>"
npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate
```

No ejecutar seeds Prisma.

## 3. Limpieza productiva obligatoria

Despues de aplicar migraciones SQL y estructura Prisma, ejecutar:

```powershell
psql "<PROD_DATABASE_URL>" -f supabase/production/cleanup_prod_seed_data.sql
```

Este SQL elimina:

- Empresas QA/demo.
- Usuarios QA/demo.
- Membresias QA.
- Datos operativos/transaccionales.
- Objetos de Storage.

Mantiene:

- Esquema.
- Tablas.
- Relaciones.
- Indices.
- Constraints.
- Funciones.
- Triggers.
- RLS.
- Policies.
- Buckets.
- Catalogos tecnicos minimos como `modules`, `plans` genericos y `plan_modules`.

## 4. Validar replica estructural vacia

Ejecutar:

```powershell
$env:TARGET_ENV="production"
$env:CONFIRM_PROD_VALIDATE="true"
$env:DATABASE_URL="<PROD_DATABASE_URL>"
$env:SUPABASE_URL="https://<prod-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<prod-service-role>"
npm run validate:production:structure
```

El validador confirma:

- Tablas esperadas.
- RLS activo.
- Policies publicas y de Storage.
- Funciones `app_private`.
- Buckets privados.
- `auth.users` vacio.
- Tablas operativas vacias.
- `storage.objects` vacio.

## 5. Validaciones de DB

Ejecutar despues de migrar:

```sql
select count(*) from information_schema.tables where table_schema = 'public';

select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity;

select schemaname, tablename, count(*) as policies
from pg_policies
where schemaname in ('public', 'storage')
group by schemaname, tablename
order by schemaname, tablename;
```

Criterio esperado:

- RLS activo en todas las tablas sensibles.
- Sin tablas publicas operativas sin RLS.
- Foreign keys e indices aplicados.
- `app_private` creado y funciones disponibles.

## 6. Storage

Buckets privados requeridos:

- `company-assets`
- `user-avatars`
- `service-images`
- `vehicle-documents`
- `route-evidence`
- `general-attachments`
- `accounting-documents`
- `operational-evidence`
- `user-documents`

Validar:

- Todos con `public=false`.
- Policies de `storage.objects` presentes.
- Upload/download con usuario admin empresa.
- Bloqueo de acceso cruzado entre empresas.

## 7. Auth

En esta fase Auth debe quedar configurado pero sin usuarios reales ni demo.

Validar:

- Proveedores Auth requeridos.
- Email/password habilitado si aplica.
- Redirect URLs productivas definidas.
- `auth.users` en 0 despues de `cleanup_prod_seed_data.sql`.

No crear usuarios iniciales todavia. El alta de usuarios ocurre en fase de cargue inicial controlado con `scripts/seed-production-initial.js`.

## 8. Seed productivo posterior, no en esta fase

El script `scripts/seed-production-initial.js` queda disponible para la siguiente fase. No ejecutarlo hasta que el checklist estructural este OK.

Cuando llegue la fase de cargue inicial, el script:

- Crea/actualiza empresa.
- Crea usuarios Auth si no existen.
- Crea perfiles y membresias.
- Crea empleados vinculados.
- Activa modulos.
- Crea catalogos base.
- Crea vehiculos base.
- Crea buckets si faltan.
- No borra datos.

## 9. Backups/PITR

Antes de cargar cliente real:

- Plan pago Supabase activo.
- Backups diarios visibles en Dashboard.
- PITR habilitado si el plan y compute lo permiten.
- Backup manual antes de migraciones productivas.
- Prueba de restore documentada en ambiente no productivo.

Referencia oficial: https://supabase.com/docs/guides/platform/backups

Notas criticas:

- Supabase documenta backups diarios para Free/Pro/Team/Enterprise.
- Pro conserva 7 dias de backups diarios; Team 14; Enterprise hasta 30.
- PITR es add-on para Pro/Team/Enterprise y requiere al menos Small compute add-on.
- Backups de DB no restauran objetos borrados de Storage, solo metadata.

## 10. Railway produccion

Crear dos servicios separados:

- `apexos-web-production`
- `apexos-api-production`

No reutilizar servicios QA.

### Frontend Railway

Root/build:

- Root: repo.
- Install: `npm install`.
- Build: `npm --workspace apps/web run build`.
- Start: `npm --workspace apps/web run start`.

Variables:

- `APP_ENV=production`
- `NODE_ENV=production`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_SUPABASE_PROJECT_REF`
- `NEXT_PUBLIC_API_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SUPABASE_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES=45`

Solo si se mantienen rutas server-side administrativas en frontend:

- `SUPABASE_SERVICE_ROLE_KEY`

### Backend Railway

Root/build:

- Root: repo.
- Install: `npm install`.
- Build/prestart: `npm --workspace apps/api run prisma:validate`.
- Start: `npm --workspace apps/api run start`.
- Health-check: `/health`.

Variables:

- `APP_ENV=production`
- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `REDIS_DISABLED=false`
- `DISABLE_REDIS=false`
- `REDIS_URL`

## 11. CORS

`ALLOWED_ORIGINS` debe contener solo dominios productivos:

```text
https://app.<dominio-produccion>
```

No usar `*`. No incluir dominios QA en produccion salvo ventana temporal de validacion controlada.

## 12. Smoke test sin datos reales

Con PROD estructural vacio:

- API `/health`: OK.
- Frontend carga login/layout: OK.
- Login: no debe existir usuario inicial aun.
- Modulos no deben mostrar datos demo.
- Endpoints protegidos deben responder 401/403 sin token.
- Endpoints con service role/server-side no deben filtrar secretos.

## 13. Resultado esperado

Al finalizar esta preparacion, produccion debe quedar:

- Supabase PROD creado.
- Migraciones aplicadas.
- Estructura Prisma aplicada.
- Limpieza productiva ejecutada.
- Buckets privados.
- RLS activo.
- Auth configurado sin usuarios demo.
- Sin datos operativos ni transaccionales.
- Railway frontend y backend desplegados.
- `/health` en API OK.
- Sin login real todavia.
- Sin cutover de dominio real todavia.
