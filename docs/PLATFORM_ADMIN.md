# Platform Admin

## Objetivo

El submodulo Platform Admin permite administrar empresas, suscripciones y modulos habilitados por empresa desde APEX OS.

Ruta frontend:

```text
/dashboard/administracion/suscripciones
```

Entrada visible:

```text
/dashboard/administracion
```

El super admin ve una tarjeta "Administracion de empresas" dentro de Admin APEXOS. Desde ahi abre el panel de empresas y modulos.

Modulo global:

```text
platform_admin
```

Este modulo tiene `visibility_scope = 'platform'`, por lo que no aparece para empresas normales. Solo un usuario registrado en `public.platform_admins` puede consultar sus vistas y operar cambios globales.

## Seguridad

El control se apoya en:

- `public.platform_admins`: lista de usuarios con administracion global.
- `app_private.is_platform_admin()`: helper RLS para validar `auth.uid()`.
- Politicas RLS fusionadas en `companies`, `profiles`, `company_users` y `company_modules`.
- Vistas `v_platform_companies` y `v_platform_company_module_access` con `security_invoker = true`.

No se usa `service_role` en frontend. Los cambios de modulos se hacen con el usuario autenticado y RLS decide si puede operar.

## Empresa SCJ

Se creo la empresa QA:

```text
SCJ
```

Plan:

```text
scj_operacion_inicial
```

Modulos habilitados:

- `talento_humano`
- `servicios`
- `transporte`
- `configuracion`
- `administracion_apex`

Modulos bloqueados:

- `inventario`
- `crm`
- `ventas`
- `compras`
- `finanzas`
- `reportes`
- `wms`

## Catalogo de modulos

El catalogo QA debe incluir todos los modulos visibles de APEXOS para que el super admin pueda habilitarlos o bloquearlos por empresa. La migracion `20260518102000_complete_apexos_module_catalog_and_company_setup.sql` completa el catalogo tenant con los 27 modulos definidos en la plataforma web:

- `inventario`
- `compras`
- `ventas`
- `facturacion`
- `punto_de_venta`
- `cartera`
- `contabilidad`
- `tesoreria`
- `costos`
- `presupuestos`
- `produccion`
- `recetas`
- `calidad`
- `transporte`
- `devoluciones`
- `comercio_exterior`
- `talento_humano`
- `activos`
- `proyectos`
- `crm`
- `planeacion_demanda`
- `administracion_apex`
- `facturacion_electronica`
- `configuracion_inicial`
- `suscripciones`
- `servicios`
- `apex_ai`

Los modulos adicionales preparados previamente, como `configuracion`, `finanzas`, `reportes` y `wms`, se conservan para compatibilidad y tambien pueden mostrarse como bloqueables si estan activos en el catalogo.

## Creacion de empresas

Administracion APEX es el unico flujo oficial para crear empresas/clientes en APEXOS/NYVORA. No se deben crear clientes por scripts externos, SQL manual ni flujos paralelos de onboarding. La unica excepcion operativa es una emergencia documentada y aprobada.

La creacion de empresas se abre desde un boton de accion en una ventana flotante. No debe quedar incrustada dentro del listado de empresas para evitar saturacion visual.

El formulario captura:

- Nombre comercial.
- Razon social.
- NIT / Tax ID.
- Correo corporativo.
- Telefono.
- Tipo de entidad: grupo empresarial, sociedad, unidad de negocio o sucursal.
- Empresa padre cuando la entidad depende de un grupo o sociedad.
- Linea de negocio.
- Pais, ciudad y direccion.
- Estado.
- Administrador inicial: nombre, correo de acceso y clave temporal.

Cada empresa se crea como un tenant independiente por `company_id`. La base inicializa automaticamente su matriz en `company_modules` con todos los modulos tenant activos; por defecto quedan bloqueados salvo lo que venga habilitado por plan. Los datos operativos futuros deben relacionarse siempre con ese `company_id`.

Para grupos empresariales, la tabla `companies` usa una jerarquia interna:

- `company_type = business_group`: holding o grupo principal.
- `company_type = company`: sociedad legal.
- `company_type = business_unit`: unidad de negocio.
- `company_type = branch`: sede o sucursal.
- `parent_company_id`: relaciona sociedad, unidad o sucursal con su grupo o empresa padre.

La creacion completa usa la ruta server-side `/api/platform/companies`. Esta ruta crea la empresa, crea el usuario en Supabase Auth, inserta/actualiza `profiles`, asocia `company_users` y registra `company_admin_onboarding`. La clave temporal solo viaja al servidor para crear el usuario Auth; no se guarda en tablas de negocio.

La gestion de empresas incluye:

- Edicion desde ventana flotante.
- Cambio de estado a activa, inactiva o suspendida.
- Eliminacion con confirmacion explicita.

Buena practica operativa: si la empresa ya tiene historial, usuarios, servicios, empleados o evidencias, se debe preferir `inactive` o `suspended` antes que eliminar. La eliminacion queda para registros creados por error, pruebas controladas o sociedades sin trazabilidad relevante.

Las operaciones de crear, editar y eliminar empresas pasan por `/api/platform/companies`, que valida primero que el usuario autenticado tenga acceso a `v_platform_companies`. La clave `SUPABASE_SERVICE_ROLE_KEY` queda solo en servidor para ejecutar cambios administrativos necesarios.

Requisito de entorno:

```env
SUPABASE_SERVICE_ROLE_KEY=
```

Esta variable solo puede existir en servidor. No debe tener prefijo `NEXT_PUBLIC_`.

## Estado de migracion QA

La migracion `20260518102000_complete_apexos_module_catalog_and_company_setup.sql` esta versionada localmente para completar el catalogo y preparar la matriz de modulos por empresa.

La migracion `20260518110000_company_groups_and_initial_admin.sql` esta versionada localmente para soportar grupos empresariales, jerarquia de sociedades y registro del administrador inicial.

Intento de aplicacion remota:

- Conector Supabase: bloqueado por `Reauthentication required`.
- `DATABASE_URL` local: descartado porque no apunta al esquema QA esperado; la base respondio que `public.modules` no existe.
- Service role nueva: validada correctamente para Auth Admin y REST.
- Catalogo de modulos: cargado por REST; QA muestra 31 modulos tenant activos y 31 filas `company_modules` por empresa.

No se aplicaron cambios sobre una base incorrecta. Para dejar QA funcionando, reautenticar el conector de Supabase o suministrar la cadena directa del proyecto QA `APEX-OS` y ejecutar la migracion versionada.

## Usuarios

Supabase Auth QA tiene usuarios de prueba creados y confirmados para validar login real.

- `admin@apexos.qa`: admin global, activo en `public.platform_admins`.
- `scj@apexos.qa`: admin de empresa `SCJ`.

No guardar contrasenas planas en documentacion versionada. Las claves temporales se entregan por conversacion al responsable de QA.

No asociar usuarios por SQL manual. El primer Platform SuperAdmin se crea con `platform:init`; los administradores de empresa y usuarios operativos se crean desde Administracion APEX y sus rutas server-side oficiales.

## Validacion

Estado validado en QA:

- Security Advisor sin lints.
- Performance Advisor sin advertencias criticas; solo indices `unused_index` informativos por ambiente sin carga real.
- SCJ creada con plan `scj_operacion_inicial`.
- `platform_admin` separado como modulo de plataforma.
- Panel frontend creado para activar o bloquear modulos con checks.
- Entrada agregada dentro de Admin APEXOS para usuarios `platform_admin`.
- Modulos habilitados y bloqueados diferenciados visualmente por color.
- Modulos bloqueados muestran candado junto al nombre del modulo.
- Menu lateral y tablero principal consultan permisos por empresa para sesiones Supabase QA.
- Usuario SCJ ve bloqueados con candado y sin enlace operativo desde navegacion principal.
- Login real validado para `admin@apexos.qa` y `scj@apexos.qa`.
- RLS validado: SCJ no consulta vistas de platform admin.
