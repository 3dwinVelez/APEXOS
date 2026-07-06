# Official Company Administration Flow

## Decision

Customer onboarding externo queda deprecado para APEXOS/NYVORA.

La creacion de empresas, clientes, administradores y usuarios operativos debe ejecutarse desde Administracion APEX con un Platform SuperAdmin autenticado.

## Flujo Oficial

1. Login como Platform SuperAdmin.
2. Entrar a Administracion APEX.
3. Abrir Empresas y suscripciones.
4. Crear empresa desde la pantalla oficial.
5. Activar modulos contratados.
6. Crear administrador de empresa.
7. Crear usuarios operativos o tecnicos.
8. Asignar el rol principal del usuario.
9. Configurar permisos y alcances exclusivamente desde el maestro de Roles y permisos.
10. Validar acceso y aislamiento multiempresa.

## Gobierno De Roles En Usuarios

La pantalla de creacion/edicion de usuarios no debe exponer banderas de permisos operativos como servicios, marcaciones, rutas, inventario, aprobaciones o excepciones.

El formulario de usuario solo asigna el rol principal. La definicion de permisos, alcances, roles adicionales y capacidades operativas pertenece al maestro `Roles y permisos`, para evitar configuraciones paralelas y mantener trazabilidad RBAC/ABAC centralizada.

## Componentes Oficiales

- Frontend: `/dashboard/administracion/suscripciones`.
- Creacion/edicion/eliminacion de empresas: `/api/platform/companies`.
- Usuarios de empresa: `/api/admin/users`.
- Gestion de modulos: `company_modules` desde la pantalla de Administracion APEX.
- Bootstrap permitido: `platform:init`, solo para crear el primer Platform SuperAdmin cuando la plataforma esta vacia.

## Flujos Deprecated

- `scripts/seed-production-initial.js` no debe usarse para crear empresas/clientes productivos.
- `npm run seed:production:initial` queda bloqueado en `TARGET_ENV=production` salvo emergencia documentada con `ALLOW_EMERGENCY_EXTERNAL_SEED=true`.
- Cualquier documento o runbook que sugiera crear clientes por seed externo queda subordinado a este documento.

## Excepcion De Emergencia

Solo se permite un seed externo si existe incidente operativo documentado, aprobacion del operador y trazabilidad del cambio. La ruta normal sigue siendo Administracion APEX.

## Estado PROD 2026-07-01

Platform Initialization esta completado. El Platform SuperAdmin existe y puede iniciar sesion.

El flujo oficial de Administracion APEX existe en codigo, pero en Supabase PROD se detecto un bloqueo de permisos al consultar `companies` como usuario autenticado:

```text
permission denied for table companies
```

La causa es que las policies RLS existen, pero faltan grants operativos para que `authenticated` pueda usar esas policies en `companies`, `company_modules` y `company_users`, y para que rutas server-side con `service_role` puedan completar membresias/empleados.

No se aplico ningun cambio de grants en PROD en esta correccion arquitectonica.
