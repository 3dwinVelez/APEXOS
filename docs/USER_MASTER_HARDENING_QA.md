# User master hardening QA

## Objetivo

Fortalecer el modulo de creacion y gestion de usuarios como maestro principal de APEXOS, evitando que empleados/colaboradores funcionen como maestros paralelos.

## Problemas encontrados

- El backend local ya usa `User` como entidad principal y `Employee.user_id` como extension 1:1, pero el frontend presentaba campos laborales/operativos como texto libre.
- Supabase QA usa `profiles`, `company_users` y `employees`; `employees` seguia funcionando como fuente visible para usuarios en algunos fallbacks.
- El tab de documentos del usuario solo mostraba placeholders; no habia accion real para cargar archivos privados ni asociarlos al expediente.
- Habia acciones de acceso incompletas: activar/inactivar existia, pero bloquear acceso y solicitar cambio de clave no estaban expuestos como accion clara.
- Varios catalogos requeridos para creacion de usuarios estaban quemados en codigo.

## Cambios aplicados

- API admin:
  - `GET /api/v1/admin/user-master-data`
  - `POST /api/v1/admin/user-master-data/:catalog/items`
  - `PATCH /api/v1/admin/users/:id/access`
  - `POST /api/v1/admin/users/:id/documents`
  - `DELETE /api/v1/admin/users/:id/documents/:documentId`
- Next API QA:
  - `POST /api/admin/users` crea usuario en Supabase Auth con service role server-side.
  - `GET /api/admin/users` lista usuarios de las empresas donde el JWT autenticado es admin/owner.
  - `PATCH /api/admin/users` actualiza ficha, estado, acceso y documentos usando service role server-side con validacion previa de empresa.
  - Sincroniza `profiles`, `company_users` y `employees`.
  - Valida que el usuario autenticado sea admin/owner de la empresa antes de crear usuarios.
- Frontend:
  - El formulario consume maestros de usuario con fallback seguro.
  - Campos de clasificacion clave pasan a selects: tipo documento, estado usuario, perfil/tipo usuario, sede, area, cargo, tipo vinculacion, tipo contrato, centro costo, jornada/turno, banco y clasificacion operativa.
  - La creacion/edicion de usuario conserva solo la asignacion del rol principal; los permisos, alcances, roles adicionales y capacidades operativas se administran desde el maestro de Roles y permisos.
  - Se agregan acciones: reset de acceso, bloqueo de acceso, asociar documento y eliminar documento.
  - Documentos quedan visibles como expediente del usuario con tipo, archivo, estado y ruta/URL.
  - Carga binaria directa al bucket privado `user-documents` para PDF, PNG, JPEG y WEBP hasta 10MB.
  - Visualizacion segura por URL firmada cuando el documento vive en Supabase Storage.
  - Tab `Maestros` para crear/actualizar valores de catalogo usados por el formulario.
- Supabase:
  - Migracion no destructiva `20260528100000_user_master_hardening.sql`.
  - Extension de `employees` con `user_id` y codigos maestros.
  - Nueva tabla `user_master_documents`.
  - Nueva tabla `user_master_audit_events`.
  - RLS para documentos/auditoria por admin o usuario propio.
  - Bucket privado `user-documents` reafirmado.
  - Storage RLS permite lectura a admin de empresa y al usuario dueño del archivo; escritura queda limitada a admin de empresa.

## Maestros disponibles para usuario

- Tipos de documento.
- Estados de usuario.
- Tipos de usuario.
- Roles.
- Cargos.
- Areas/departamentos.
- Sedes.
- Centros de costo.
- Tipos de contrato/vinculo.
- Turnos/jornadas.
- Bancos.
- Tipos documentales de usuario.

## Validaciones ejecutadas

- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run build`
- `node -c apps/api/src/modules/admin/service.js`
- `node -c apps/api/src/modules/admin/routes.js`
- `npm --workspace apps/api run prisma:validate`
- `npm --workspace apps/api start` con `REDIS_DISABLED=true`, validado hasta `HTTP server listening`.
- Se agrego `supabase/tests/user_master_rls_smoke.sql` para validar empresa A/B, usuario propio y bloqueo de insercion no admin con JWT reales de QA.
- Se agrego y ejecuto `scripts/seed-user-master-qa-smoke.js` contra Supabase QA.
- Datos demo creados en Supabase QA:
  - `QA Empresa A RLS`
  - `QA Empresa B RLS`
  - `qa.admin.a@apexos.test`
  - `qa.operativo.a@apexos.test`
  - `qa.supervisor.a@apexos.test`
  - `qa.admin.b@apexos.test`
  - `qa.operativo.b@apexos.test`
- Los usuarios demo quedaron sincronizados en Auth, `profiles`, `company_users` y `employees`.
- Se creo el bucket privado `user-documents` por API de Storage y se cargo un PDF demo asociado al operativo A en `employees.metadata.documents`.
- Prueba con JWT anon/key real: `company_users` y `v_user_companies` son visibles para el admin QA, pero `employees` retorna 0 filas por RLS. Se mitigo el modulo de usuarios con ruta server-side segura; la politica SQL de `employees` debe corregirse en la siguiente migracion remota.
- `npm --workspace apps/web run lint` no se completo porque `next lint` abre configuracion interactiva de ESLint.
- `npm --workspace apps/api run lint` no existe en `apps/api`.

## Pendientes recomendados

- Migrar valores historicos de texto libre a codigos de catalogo.
- Aplicar migraciones SQL remotas cuando exista un `DATABASE_URL`/pooler IPv4 valido de Supabase QA. El `DATABASE_URL` actual apunta a `localhost:55432` y el host directo de Supabase resuelve solo IPv6 desde esta maquina.
- Corregir RLS SQL de `employees` para que admin/owner vea su empresa y usuarios operativos vean su propia ficha. La prueba real ya detecto que hoy devuelve 0 filas incluso para admin.
- Conectar el tab de maestros a una pantalla dedicada de gobierno de datos si se quiere aprobacion, versionamiento o importacion masiva de catalogos.
