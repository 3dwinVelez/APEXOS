# Role management hardening QA

## Objetivo

Fortalecer la creacion y gestion de roles para que la matriz de permisos sea transversal, auditable y aplicable por backend, no solo visual en frontend.

## Problemas encontrados

- La matriz anterior solo cubria un subconjunto de modulos y acciones: `access`, `view`, `create`, `edit`, `export`, `approve`.
- Los roles base estaban limitados a `Tecnico`, `Empleado` y `Coordinador`.
- El formulario de roles no tenia jerarquia, tipo de rol, alcance, restricciones por sede/area/centro de costo/proceso, copia desde rol ni resumen de impacto.
- La API ya validaba permisos con `requirePermission`, pero la matriz no expresaba acciones criticas como eliminar, importar, anular, rechazar, adjuntar, descargar, configurar, administrar, automatizar, ver informacion sensible o gestionar usuarios/roles.
- No habia auditoria explicita para creacion, edicion o cambio de estado de roles.
- Los alcances por sede, area, centro de costo y proceso se guardaban como metadata, pero no se evaluaban en el middleware RBAC.
- El frontend ocultaba menus por modulos activos, pero no bloqueaba acceso por URL directa con permisos de rol cuando el usuario iniciaba sesion por API local.

## Cambios aplicados

- Se amplio `PERMISSION_CATALOG` en `apps/api/src/modules/admin/service.js`.
- Se agregaron acciones transversales:
  - acceder
  - ver
  - crear
  - editar
  - eliminar
  - aprobar
  - rechazar
  - anular
  - exportar
  - importar
  - adjuntar documentos
  - descargar documentos
  - configurar
  - administrar
  - ejecutar automatizaciones
  - ver reportes
  - ver informacion sensible
  - gestionar usuarios
  - gestionar roles
- Se agregaron modulos/submodulos a la matriz:
  - Administracion
  - Usuarios
  - Roles y permisos
  - Empresas/tenants
  - Clientes
  - Proveedores
  - Inventarios
  - WMS
  - Compras
  - Ventas
  - Logistica
  - Transporte
  - Ultima milla
  - Importaciones
  - Servicios
  - Talento humano
  - Marcaciones
  - Proyectos
  - Contabilidad
  - Facturacion
  - Reportes
  - Automatizaciones
  - Documentos adjuntos
  - Configuracion general
  - Auditoria
  - Notificaciones
  - IA/asistente interno
  - Nomina
- Se agregaron metadatos de rol:
  - nivel jerarquico
  - tipo de rol
  - alcance
  - sedes permitidas
  - areas permitidas
  - centros de costo permitidos
  - procesos permitidos
  - capacidad de delegar
  - acceso sensible
- Se agrego auditoria backend para:
  - creacion de rol
  - edicion de rol
  - activacion/inactivacion
- Se agrego validacion de duplicados por nombre de rol dentro del tenant.
- Se agrego enforcement de alcances en `requirePermission`:
  - sedes permitidas/restringidas
  - areas permitidas/restringidas
  - centros de costo permitidos/restringidos
  - procesos permitidos/restringidos
- Se expusieron permisos y metadata del rol en `/auth/login` y `/auth/me` sin exponer credenciales.
- Se guardan permisos del rol en sesion local del frontend para validar navegacion.
- Se agrego `RouteAccessGuard` para bloquear acceso por URL directa a modulos no permitidos.
- Se limpian permisos y metadata del rol al cerrar o expirar sesion.
- Se ampliaron roles base modificables:
  - `APEX_ADMIN`
  - `Administrador de empresa`
  - `Gerente general`
  - `Coordinador logistico`
  - `Supervisor operativo`
  - `Auxiliar operativo`
  - `Analista contable`
  - `Analista de compras`
  - `Analista de inventario`
  - `Comercial`
  - `Usuario solo lectura`
  - `Auditor`
  - `Soporte tecnico`
  - `Tecnico`
  - `Empleado`
  - `Coordinador`
- El formulario de roles ahora incluye:
  - nombre
  - descripcion
  - nivel jerarquico
  - tipo
  - alcance
  - copia desde otro rol
  - flags de delegacion y sensibilidad
  - filtros por grupo
  - buscador
  - vista compacta/completa
  - resumen de impacto

## Seguridad

- El backend sigue aplicando permisos reales con `requirePermission(module, action)`.
- El backend ahora bloquea peticiones que quedan fuera del alcance del rol cuando el request contiene sede, area, centro de costo o proceso.
- El dashboard bloquea rutas directas no autorizadas segun permisos locales del rol para sesiones API.
- Las acciones ampliadas se traducen a permisos RBAC existentes:
  - acciones de lectura a `read`
  - acciones de escritura/configuracion/administracion a `write`
  - aprobaciones a `approve`
  - exportaciones a `export`
- `APEX_ADMIN` conserva acceso total y no se puede degradar desde el formulario.
- Los cambios de rol quedan registrados en `AuditLog`.

## Validaciones ejecutadas

- `node -c apps/api/src/modules/admin/service.js`
- `node -c apps/api/src/modules/admin/routes.js`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run build`
- `npm --workspace apps/api run prisma:validate`
- `npm --workspace apps/api start` con `REDIS_DISABLED=true`, validado hasta `HTTP server listening`.
- Prueba local de bootstrap API con `REDIS_DISABLED=true` en puerto 3035: el servidor arranco y respondio `/health`; devolvio 500 por usar `DATABASE_URL` temporal sin base local real.
- Validacion SQL desde `.env`: `DATABASE_URL` apunta a `localhost:55432` y la conexion local fue rechazada porque no hay Postgres escuchando en ese puerto.
- Validacion REST Supabase QA con `SUPABASE_SERVICE_ROLE_KEY`: conexion OK, status 200 contra `/rest/v1/modules`.
- Validacion SQL directa a Supabase QA: el host `db.<project-ref>.supabase.co` no resolvio DNS desde este entorno. La ejecucion fuera del sandbox no pudo completarse por limite de uso de la app.

## Riesgos pendientes

- Los alcances por sede, area, centro de costo y proceso ya se validan en middleware cuando el request trae esos campos. Aun falta que cada servicio de dominio filtre proactivamente listados por esos alcances para evitar depender solo de bloqueo posterior.
- RLS Supabase remoto todavia requiere migraciones SQL aplicadas por conexion Postgres valida. El `DATABASE_URL` local apunta a `localhost:55432` y no permite aplicar DDL remoto desde esta maquina.
- Para ejecutar migraciones SQL desde CI/Railway/local QA, `DATABASE_URL` debe apuntar al Postgres remoto de Supabase QA, no a `localhost`.
- La proteccion por URL directa queda activa para sesiones API local. Para sesiones Supabase directas, se mantiene la proteccion por modulos activos y RLS; falta exponer permisos equivalentes de rol Supabase si se quiere una guarda visual identica.
- Las acciones finas como `delete`, `reject`, `void`, `attach`, `download`, `configure` y `administer` ya existen en la matriz, pero algunos endpoints actuales todavia usan permisos agregados `write/read/approve/export`.

## Recomendaciones

- En una segunda fase, mapear cada endpoint a acciones finas en lugar de agrupar todo en `write`.
- Aplicar RLS Supabase con funciones de permiso por rol cuando exista conexion SQL remota.
- Agregar filtros de alcance en consultas de listados por modulo: sede, area, centro de costo y proceso.
- Agregar pruebas automatizadas para roles:
  - crear rol
  - copiar rol
  - editar permisos
  - inactivar rol
  - asignar rol a usuario
  - intentar acceso denegado por endpoint
  - intentar acceso por URL directa
