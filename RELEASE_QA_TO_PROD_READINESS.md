# APEXOS / NYVORA - Readiness QA a Produccion

Fecha de auditoria: 2026-05-31  
Rama auditada: `develop`  
Commit base auditado: `13457a1 docs: add QA to production readiness report`  
Frontend QA observado: `https://apexos-web-qa-production.up.railway.app`  
Supabase QA: `https://jbirkghkekuifgfsgquq.supabase.co`  
Decision actualizada: **QA ESTABLE CON RIESGOS CONTROLADOS / PRODUCCION PILOTO AUN CON CHECKLIST PREVIO**

## Resumen ejecutivo

APEXOS QA esta funcional para pruebas controladas: login, layout, carga de modulos, API local validada con Redis deshabilitado, Supabase conectado, buckets privados y RLS activo en todas las tablas publicas auditadas. El sistema puede continuar en QA/staging desde `develop`.

Despues de la estabilizacion posterior al dictamen inicial, QA queda estable para pruebas reales controladas. Se cerro el bloqueo de lint CI-safe, se documento gobierno de datos Prisma/Supabase, se documentaron variables por ambiente, se limpiaron plantillas pendientes y se ejecutaron pruebas RLS reales con tokens Supabase.

Produccion piloto puede prepararse en infraestructura separada, pero no debe activarse hasta confirmar proyecto Supabase PROD pago, backup/PITR, variables productivas, dominio/SSL y prueba final de RLS con datos productivos semilla.

## Actualizacion de estabilizacion

Fecha: 2026-05-31  
Rama: `develop`

Cambios aplicados:

- Se agrego `apps/web/eslint.config.mjs` y el script `apps/web` `lint` cambio de `next lint` a `eslint .`.
- Se corrigio el error de lint por variable reservada `module` en `apps/web/app/dashboard/[module]/page.tsx`.
- Se agrego `APP_ENV=local` a `.env.example`.
- Se creo `docs/DATA_GOVERNANCE_QA.md`.
- Se creo `docs/ENVIRONMENT_VARIABLES_QA_PROD.md`.
- Se limpio `docs/import-templates/examples/referencias.csv`, conservando el separador `;` y eliminando filas vacias/ruido.
- Se habilitaron modulos requeridos para pruebas RLS en `QA Empresa A RLS` y `QA Empresa B RLS`.
- Se removio la contrasena demo hardcodeada del bundle de login; el boton demo ahora solo precarga el correo y exige la contrasena entregada por QA.

Comandos finales ejecutados:

```powershell
npm.cmd install
npm.cmd --workspace apps/web run lint
npm.cmd --workspace apps/web run typecheck
npm.cmd --workspace apps/web run build
npm.cmd --workspace apps/api run prisma:validate
npm.cmd audit --audit-level=high
```

Resultados finales:

- Install limpio: OK, sin cambios de lockfile.
- Lint CI-safe: OK, 0 errores, 58 warnings no bloqueantes.
- Typecheck web: OK.
- Build frontend: OK, 47 rutas generadas.
- Prisma validate: OK con `DATABASE_URL` cargado.
- Audit high: OK; quedan 2 vulnerabilidades moderadas por `next -> postcss`, sin fix automatico disponible.
- Smoke API con Redis deshabilitado: OK.
- Busqueda de secretos: no se encontro service role ni URL Postgres real versionada fuera de `.env`. Persisten contrasenas demo en scripts/documentacion de seed QA; no deben usarse en produccion.

## Git y ramas

Validacion remota:

- `develop` base del dictamen previo: `13457a1 docs: add QA to production readiness report`
- `main`: `ff6d2592a57ca8c8409ad4ecb70392d20eafb155`
- Rama local actual: `develop`
- Estado del cambio pendiente: `docs/import-templates/examples/referencias.csv` fue revisado. Se conserva porque corresponde a plantilla maestra de referencias, pero se limpio para eliminar filas vacias y caracteres residuales.

Recomendacion:

- Mantener `develop` como QA/staging.
- Mantener `main` como produccion.
- No desplegar ramas `fix/*`, `feature/*` ni `testing/*` directo a produccion.
- Crear tag pre-release solo cuando QA cierre sin hallazgos altos.

## Variables de entorno

Variables presentes en `.env` local:

- `DATABASE_URL`
- `JWT_SECRET`
- `REDIS_URL`
- `REDIS_DISABLED` / `DISABLE_REDIS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_API_URL`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- SMTP y variables auxiliares

Hallazgos:

- `.env` local apunta a valores de desarrollo (`NEXT_PUBLIC_API_URL=http://127.0.0.1:3000`, `FRONTEND_URL=http://localhost:3001`, `NODE_ENV=development`).
- `.env.example` ahora incluye `APP_ENV=local`.
- En Railway/Vercel/hosting se deben separar estrictamente QA y produccion.
- `SUPABASE_SERVICE_ROLE_KEY` es requerida solo server-side para administracion de Auth, creacion de usuarios y operaciones administrativas. No debe existir en componentes cliente ni con prefijo `NEXT_PUBLIC_`.

Bloqueante para produccion:

- Confirmar variables reales de QA y PROD en el proveedor de hosting antes de promover `main`.
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` exista solo en server runtime donde aplique.
- Usar `docs/ENVIRONMENT_VARIABLES_QA_PROD.md` como checklist de Railway/Supabase.

## Build, API y calidad

Comandos ejecutados:

```powershell
npm.cmd --workspace apps/web run typecheck
npm.cmd --workspace apps/api run prisma:validate
npm.cmd --workspace apps/web run lint
npm.cmd --workspace apps/web run build
npm.cmd audit --audit-level=high
```

Resultados:

- Typecheck web: OK.
- Prisma validate API: OK.
- Build web: OK, Next.js genero 47 rutas.
- NPM audit high: OK para severidad high. Quedan 2 vulnerabilidades moderadas heredadas por `next -> postcss`, sin fix automatico disponible.
- Lint: OK despues de migrar a ESLint CLI. Quedan 58 warnings no bloqueantes por imports no usados, dependencias de hooks y uso de `<img>`.

Correccion aplicada:

- `apps/web/eslint.config.mjs` agregado.
- `apps/web/package.json` usa `eslint .`.
- Error bloqueante `@next/next/no-assign-module-variable` corregido.

## API QA / Railway

Validacion local equivalente al runtime QA:

- `REDIS_DISABLED=true`
- `DISABLE_REDIS=true`
- Bootstrap completo con workers/crons deshabilitados.
- `/health`: 200.
- Login API: 200.
- Logs esperados presentes:
  - `Entering build()`
  - `Starting APEX OS API bootstrap`
  - `QA mode: background workers and crons disabled`
  - `Registered health route`

Smoke test con usuario SCJ:

- Servicios: 200, 10 registros retornados.
- Transporte / vehiculos: 200, 6 registros retornados.
- Talento humano / empleados: 200, 16 registros retornados.
- Proyectos: 200, centro operacional activo.

Smoke test con usuario demo general:

- Login: 200.
- HR current session: 200.
- Admin users: 200, 7 usuarios.
- Proyectos inicialmente devolvia 403 por modulo no habilitado en la empresa demo/SCJ. Se corrigio parametrizacion QA habilitando `proyectos` en `active_modules` de `SCJ` y `Empresa Demo APEX-OS`.
- Smoke API final con usuario SCJ: Proyectos 200/1, Servicios 200/10, Transporte 200/6, HR empleados 200/16, Admin usuarios 200/29.

## Supabase QA

Estado estructural:

- Tablas publicas: 103.
- Indices publicos: 366.
- Foreign keys: 143.
- Policies publicas: 78.
- Policies storage: 20.
- Tablas publicas sin RLS: 0.

Tablas REST Supabase validadas con respuesta OK:

- `companies`
- `profiles`
- `company_users`
- `employees`
- `vehicles`
- `service_orders`
- `service_references`
- `time_punches`
- `gps_pings`
- `master_catalogs`
- `master_catalog_items`

Tablas snake_case esperadas que no existen como REST directo:

- `work_sessions`
- `work_activities`
- `routes`
- `route_evidence`
- `projects`
- `project_commitments`

Interpretacion:

- No necesariamente son faltantes funcionales. Parte del backend activo usa tablas Prisma CamelCase (`WorkSession`, `WorkActivity`, `Project`, `ProjectCommitment`, `Vehicle`, `ServiceOrder`) y parte usa tablas Supabase snake_case.
- Este es el principal riesgo de arquitectura: doble superficie de datos y potencial duplicidad/sincronizacion por modulo.
- Se documento la matriz de fuente de verdad por modulo en `docs/DATA_GOVERNANCE_QA.md`.
- Decision QA: no borrar tablas legacy; marcarlas como compatibilidad temporal hasta definir fuente unica por modulo antes de produccion.

## Storage

Buckets validados como privados:

- `company-assets`
- `user-avatars`
- `service-images`
- `vehicle-documents`
- `route-evidence`
- `general-attachments`
- `accounting-documents`
- `operational-evidence`
- `user-documents`

Policies de storage detectadas: 20.

Estado:

- Storage privado OK para QA.
- Antes de produccion se debe probar descarga/carga con usuarios reales por rol y empresa, no solo existencia de bucket.

## Modulos activos

Servicios:

- API responde con datos para SCJ.
- Tablas `service_orders` y `ServiceOrder` tienen datos sincronizados para SCJ.
- Riesgo: validar que el frontend QA use el tenant correcto y que la creacion no quede en bucle por Auth/session o por empresa sin datos.

Transporte:

- API responde 6 vehiculos para SCJ.
- Tablas `vehicles` y `Vehicle` tienen datos sincronizados para SCJ.
- Riesgo: empresas demo sin datos pueden aparentar fallo si el usuario inicia en un tenant distinto.

Talento humano:

- Empleados y marcaciones disponibles en SCJ.
- `time_punches` tiene registros.
- `WorkSession` y `WorkActivity` existen en modelo Prisma pero estan en 0; validar si el flujo operativo actual depende de tablas snake_case o Prisma por pantalla.

Administracion APEX:

- Usuarios y sesiones activas ya cuentan con fallback sin service role para lectura.
- Operaciones administrativas de creacion/edicion de empresas o usuarios Auth siguen requiriendo `SUPABASE_SERVICE_ROLE_KEY` server-side.

Proyectos:

- El modulo estaba bloqueado por configuracion de modulos en QA. Se habilito `proyectos` en SCJ y Empresa Demo.
- El endpoint `/api/v1/projects/operational-center` responde 200 y puede inicializar demo operacional.

Contabilidad:

- Modulo habilitado para SCJ.
- No se ejecuto flujo contable profundo en esta pasada; queda como validacion funcional previa a piloto.

## Seguridad y RLS

Validado:

- RLS activo en todas las tablas publicas auditadas.
- Policies existentes para tablas sensibles: empresas, perfiles, usuarios-compania, empleados, GPS, marcaciones, servicios, vehiculos, catalogos.
- Storage no publico.
- No se encontro fallback Redis a `127.0.0.1:6379` en `apps/api/src`.
- El uso de `SUPABASE_SERVICE_ROLE_KEY` encontrado esta limitado a rutas server-side, scripts y documentacion; no se encontro uso directo en componentes cliente.

Pruebas RLS reales ejecutadas:

- Usuarios QA validados con login Supabase: admin empresa A, supervisor A, operativo A, admin empresa B y usuario base B.
- Empresas: cada usuario ve solo su empresa (`QA-A-20260528` o `QA-B-20260528`).
- `employees`: admin/supervisor A ven 3 fichas de empresa A; operativo A ve solo su ficha; admin B ve 2 fichas de empresa B; usuario base B ve solo su ficha.
- `company_users`: cada usuario ve solo membresias de su empresa.
- `vehicles`, `service_orders`, `time_punches`: 200 sin fuga entre empresas; las empresas RLS de prueba no tienen registros operativos.
- Storage `user-documents`: 200; usuarios de empresa A ven el documento demo de su scope, empresa B no ve documentos de A.

Pendiente antes de produccion:

- Ampliar RLS a escenarios con servicios/vehiculos/marcaciones reales por empresa QA-RLS, no solo listas vacias.
- Crear prueba automatizada versionada para RLS si se desea repetir en CI con credenciales seguras.
- Confirmar que las rutas server-side no devuelvan informacion sensible en errores.

## Correcciones aplicadas durante esta auditoria

Correccion de datos QA:

- Se habilito `proyectos` en `active_modules` de:
  - `SCJ`
  - `Empresa Demo APEX-OS`

Motivo:

- El endpoint de Proyectos devolvia 403 por modulo no habilitado, aunque el modulo esta dentro del alcance QA solicitado.

Resultado:

- `/api/v1/projects/operational-center` paso de 403 a 200.
- RLS `employees` paso de 0 filas por falta de modulos habilitados en empresas QA-RLS a resultados correctos por rol/empresa.

## Backups y PITR

Estado validado:

- No se activo produccion ni se modifico plan Supabase.
- No se cuenta en repo con token Management API para consultar el plan del proyecto desde CLI.

Politica minima recomendada para produccion:

- Supabase PROD en plan pago separado de QA.
- Backups diarios activos antes del primer cliente real.
- PITR habilitado si el plan y compute elegido lo permiten.
- Backup manual antes de cada migracion productiva.
- Prueba de restore documentada antes de go-live.
- Recordatorio: backups de base de datos no restauran objetos eliminados de Storage; se requiere politica adicional para evidencias/archivos.

Referencia oficial Supabase:

- Supabase documenta backups diarios para proyectos Free/Pro/Team/Enterprise y PITR como add-on para Pro/Team/Enterprise.
- Supabase indica que PITR reemplaza backups diarios mientras esta activo y requiere al menos Small compute add-on.
- Documentacion: https://supabase.com/docs/guides/platform/backups

## Riesgos criticos y altos

Critico:

- Ningun bloqueo tecnico critico confirmado para continuar QA.

Alto:

- Doble fuente de datos entre tablas Supabase snake_case y tablas Prisma CamelCase. Ya esta documentada; falta cerrar fuente unica antes de produccion.
- Variables QA/PROD deben quedar separadas y verificadas en hosting. Ya existe checklist; falta configurarlo/confirmarlo en Railway/Supabase.
- Creacion de usuarios/empresas depende de `SUPABASE_SERVICE_ROLE_KEY` server-side. Si falta en el runtime, esas funciones fallan aunque el resto de la plataforma cargue.

Medio:

- Datos demo concentrados principalmente en SCJ; si un usuario entra por Empresa Demo puede ver listas vacias en transporte/servicios.
- `WorkSession` y `WorkActivity` sin datos en Prisma pueden confundir flujos si alguna pantalla migra a esa fuente.
- Proyectos usa inicializacion demo automatica; para produccion debe quedar persistencia real sin depender de demo.
- Auditoria funcional mobile remota debe repetirse en navegador real despues del proximo deploy de QA.
- Lint mantiene 58 warnings no bloqueantes; conviene limpiarlos antes de endurecer CI con `--max-warnings=0`.

Bajo:

- Documentacion de variables debe consolidarse entre `.env.example`, `docs/ENVIRONMENTS.md` y configuracion del proveedor.
- Mantener datos demo marcados con metadata para limpieza futura.

## Checklist QA

- Login QA: OK.
- Layout y modulos base: OK segun estado reportado y smoke API.
- API con Redis deshabilitado: OK.
- Build frontend: OK.
- Typecheck frontend: OK.
- Prisma validate: OK.
- Supabase conectado: OK.
- RLS activo: OK.
- Storage privado: OK.
- Servicios SCJ: OK.
- Transporte SCJ: OK.
- Talento humano SCJ: OK parcial.
- Proyectos SCJ/Empresa Demo: OK despues de habilitar modulo.
- Lint CI-safe: OK.
- Pruebas RLS por rol con tokens reales: OK parcial, sin fuga multiempresa; falta poblar registros operativos en empresas RLS para pruebas positivas de servicios/vehiculos/marcaciones.
- Backups/PITR produccion: Pendiente por confirmar en Supabase.
- Variables QA/PROD en hosting: Documentadas, pendiente confirmar en Railway/Supabase.

## Checklist produccion piloto

Antes de promover `main`:

1. Confirmar proyecto Supabase PROD separado de QA.
2. Confirmar migraciones aplicadas en QA y plan de aplicacion en PROD.
3. Ejecutar backup previo a migracion PROD.
4. Activar backups y PITR si el plan Supabase lo permite.
5. Confirmar buckets PROD privados.
6. Confirmar variables PROD sin valores QA.
7. Confirmar dominios y HTTPS.
8. Limpiar warnings de lint si se quiere CI estricto con `--max-warnings=0`.
9. Ejecutar pruebas RLS por rol y empresa con datos operativos completos.
10. Definir fuente unica de datos por modulo.
11. Ejecutar smoke test mobile 360/390/414/768 en frontend desplegado.
12. Crear tag pre-release desde `develop` cuando QA cierre.

## Dictamen final

QA puede seguir: **SI, QA ESTABLE CON RIESGOS CONTROLADOS**.  
Produccion piloto: **PREPARABLE, NO ACTIVAR TODAVIA SIN CHECKLIST PROD**.

La plataforma ya tiene base funcional suficiente para pruebas reales en QA. Se puede avanzar a preparar Supabase produccion pago y Railway produccion en paralelo, siempre sin cutover hasta confirmar backups/PITR, variables productivas, dominio/SSL, RLS con datos operativos y fuente unica por modulo.
