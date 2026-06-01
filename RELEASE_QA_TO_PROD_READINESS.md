# APEXOS / NYVORA - Readiness QA a Produccion

Fecha de auditoria: 2026-05-31  
Rama auditada: `develop`  
Commit auditado: `c47317c fix: allow session panel without service role`  
Frontend QA observado: `https://apexos-web-qa-production.up.railway.app`  
Supabase QA: `https://jbirkghkekuifgfsgquq.supabase.co`  
Decision: **LISTO CON RIESGOS PARA QA / NO LISTO AUN PARA PRODUCCION PILOTO**

## Resumen ejecutivo

APEXOS QA esta funcional para pruebas controladas: login, layout, carga de modulos, API local validada con Redis deshabilitado, Supabase conectado, buckets privados y RLS activo en todas las tablas publicas auditadas. El sistema puede continuar en QA/staging desde `develop`.

No recomiendo pasar aun a produccion piloto hasta cerrar los riesgos de gobierno de datos, variables de entorno por ambiente, lint CI-safe, backups/PITR y criterios de fuente unica por modulo. No se detecto un bloqueo tecnico que impida seguir probando QA.

## Git y ramas

Validacion remota:

- `develop`: `c47317c1619f808e4cbcbe77c63e0f39d422548d`
- `main`: `ff6d2592a57ca8c8409ad4ecb70392d20eafb155`
- Rama local actual: `develop`
- Estado local antes del reporte: existe un cambio previo no relacionado en `docs/import-templates/examples/referencias.csv`. No fue modificado ni incluido en esta auditoria.

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
- Falta `APP_ENV` en `.env` local.
- En Railway/Vercel/hosting se deben separar estrictamente QA y produccion.
- `SUPABASE_SERVICE_ROLE_KEY` es requerida solo server-side para administracion de Auth, creacion de usuarios y operaciones administrativas. No debe existir en componentes cliente ni con prefijo `NEXT_PUBLIC_`.

Bloqueante para produccion:

- Confirmar variables reales de QA y PROD en el proveedor de hosting antes de promover `main`.
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` exista solo en server runtime donde aplique.

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
- Lint: FALLA operativamente porque `next lint` esta deprecado en Next 15 y abre configuracion interactiva de ESLint. No es fallo funcional de plataforma, pero si es riesgo de CI/CD.

Correccion recomendada:

- Migrar `apps/web` a ESLint CLI con `eslint.config.mjs` y cambiar script `lint` a un comando no interactivo.

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

Pendiente antes de produccion:

- Ejecutar pruebas RLS reales con tokens de usuarios por rol, no solo inspeccion de metadata.
- Confirmar que admin empresa no pueda ver datos de otra empresa por REST ni por API.
- Confirmar que operativo/conductor no vea datos fuera de sus asignaciones.
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

## Riesgos criticos y altos

Critico:

- Ningun bloqueo tecnico critico confirmado para continuar QA.

Alto:

- Doble fuente de datos entre tablas Supabase snake_case y tablas Prisma CamelCase. Se requiere declarar fuente oficial por modulo antes de produccion.
- Variables QA/PROD deben quedar separadas y verificadas en hosting. `.env` local no representa staging ni produccion.
- Creacion de usuarios/empresas depende de `SUPABASE_SERVICE_ROLE_KEY` server-side. Si falta en el runtime, esas funciones fallan aunque el resto de la plataforma cargue.
- `npm run lint` no es apto para CI por `next lint` interactivo/deprecado.

Medio:

- Datos demo concentrados principalmente en SCJ; si un usuario entra por Empresa Demo puede ver listas vacias en transporte/servicios.
- `WorkSession` y `WorkActivity` sin datos en Prisma pueden confundir flujos si alguna pantalla migra a esa fuente.
- Proyectos usa inicializacion demo automatica; para produccion debe quedar persistencia real sin depender de demo.
- Auditoria funcional mobile remota debe repetirse en navegador real despues del proximo deploy de QA.

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
- Lint CI-safe: Pendiente.
- Pruebas RLS por rol con tokens reales: Pendiente.
- Backups/PITR produccion: Pendiente por confirmar en Supabase.
- Variables QA/PROD en hosting: Pendiente por confirmar.

## Checklist produccion piloto

Antes de promover `main`:

1. Confirmar proyecto Supabase PROD separado de QA.
2. Confirmar migraciones aplicadas en QA y plan de aplicacion en PROD.
3. Ejecutar backup previo a migracion PROD.
4. Activar backups y PITR si el plan Supabase lo permite.
5. Confirmar buckets PROD privados.
6. Confirmar variables PROD sin valores QA.
7. Confirmar dominios y HTTPS.
8. Migrar lint a comando CI-safe.
9. Ejecutar pruebas RLS por rol y empresa.
10. Definir fuente unica de datos por modulo.
11. Ejecutar smoke test mobile 360/390/414/768 en frontend desplegado.
12. Crear tag pre-release desde `develop` cuando QA cierre.

## Dictamen final

QA puede seguir: **SI, con riesgos controlados y pendientes claros**.  
Produccion piloto: **NO TODAVIA**.

La plataforma ya tiene base funcional suficiente para pruebas reales en QA, pero produccion requiere cerrar gobierno de datos, validacion RLS real por rol, separacion final de variables, backups/PITR y limpieza del flujo CI de lint.
