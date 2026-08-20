# Auditoria y certificacion del ciclo de usuarios — 2026-08-20

## Estado

**CERTIFICACION ESPECIFICA QA APROBADA; PROMOCION A MAIN BLOQUEADA.** El ciclo autenticado de usuarios aprobo 13/13 controles sobre el commit exacto de `develop` `5eed5811972a96ecf0ce79afd6ad2b374de93451`. La compuerta global sigue bloqueada porque `apexos-api-qa` reporta `b66f4348f987`, por lo que no puede ejecutarse honestamente el certificado transversal contra el mismo commit. No hubo migraciones ni operaciones productivas.

## Resumen ejecutivo

La edicion administrativa informaba exito aunque el frontend omitiera campos editables del payload y el endpoint omitiera esos mismos campos del `PATCH` a `employees`. El listado tampoco devolvia/rehidrataba telefono y varias extensiones almacenadas en `metadata`, por lo que un refresh podia ocultar cambios. Adicionalmente, el toast administrativo usaba `z-[80]` y el modal global `z-[100]`, dejando el feedback debajo del dialogo.

## Causa raiz

1. `quickUserPayload` enviaba identidad, documento, empresa, sede, rol y estado, pero no telefono, cargo, departamento ni la mayoria de campos laborales/operativos.
2. `PATCH /api/admin/users` no persistia `phone`, `position`, `department`, `hire_date` ni `user_type` durante la actualizacion general.
3. La consulta y el adaptador de usuarios no seleccionaban ni aplanaban todos los valores necesarios para reabrir el formulario despues de recargar.
4. La capa del toast (`80`) era inferior a la del portal modal (`100`).
5. El script `admin-user-login-sync` esperaba `credential_sync`, pero el endpoint no lo incluia en su respuesta.

## Correccion local

- Se amplio el payload del formulario para cubrir campos basicos, laborales, operativos y de acceso.
- Se persistieron columnas reales de `employees` y extensiones en `metadata.access`, `metadata.employment` y `metadata.operational`.
- Los campos omitidos en un PATCH directo conservan su valor actual.
- Se ampliaron SELECT y mapeo de lectura para rehidratar los cambios tras refresh.
- El toast administrativo paso a `z-[110]`, por encima del modal `z-[100]`, con `role=status` y `aria-live=polite`.
- Guardado, estado, suspension y bloqueo presentan feedback determinista de exito/error.
- El endpoint ahora devuelve `credential_sync` sin exponer contrasenas.
- La creacion ejecuta compensacion segura sobre empleado e identidad Auth cuando falla un paso posterior.
- Activar, inactivar o bloquear sincroniza tambien el bloqueo de Supabase Auth, exclusivamente para el usuario objetivo.
- Se agrego `scripts/certifications/admin-user-cycle-qa.js`, que rechaza destinos productivos y cubre el flujo real con limpieza por inactivacion.

## Seguridad

- La actualizacion obtiene el usuario por `employee_id`, toma su `company_id` persistido y exige `requireCompanyAdmin(token, current.company_id)` antes de mutar.
- La creacion solo acepta una empresa solicitada cuando el actor tiene membresia administrativa en ella.
- No se debilitaron RLS, RBAC ni validaciones de contrasena.
- Certificado en QA: autenticacion obligatoria, rechazo cross-tenant, cambio de rol, rotacion de contraseña, rechazo de la contraseña anterior, aceptacion de la nueva, inactivacion y rechazo del login posterior.
- Pendiente antes de `main`: certificado transversal del mismo commit, barrido visual autenticado y aprobacion funcional independiente identificada.
- Riesgo residual: una actualizacion simultanea de contraseña y perfil cruza Supabase Auth y tablas administrativas; la compensacion de creacion esta implementada, pero el comportamiento de una falla intermedia de actualizacion debe demostrarse en QA.

## Testing automatizado local

| Control | Resultado |
| --- | --- |
| Regresion focal de usuarios y certificado | 10/10 |
| Suite web completa | 106/106 |
| Regresion API Auth/RBAC/roles | 16/16 |
| Contratos del certificado QA actual | 4/4 |
| Perfil seguro oficial | Aprobado |
| TypeScript web | Aprobado |
| ESLint focal | Aprobado |
| Prisma validate | Aprobado |
| Build Next.js de produccion | Aprobado, 72 paginas |
| Performance guard | Aprobado, 17 objetivos, 0 fallos |
| Governance guard | Aprobado |

La primera invocacion de la suite completa (`node --test test`) fue invalida porque Node interpreto el directorio como modulo. Se corrigio la invocacion enumerando los `*.test.mjs`; el resultado valido fue 106/106.

## Navegador local y UX

Se abrio `http://127.0.0.1:3001/dashboard/administracion` con navegador real. La sesion disponible fue rechazada por el guard RBAC con `Acceso no autorizado`, comportamiento seguro. No se manipulo almacenamiento ni identidad para eludirlo. Por esa razon no se pudo observar el modal ni ejecutar desktop/tablet/mobile con una identidad administrativa.

Validacion estructural automatizada:

- modal global: `z-[100]` y portal a `document.body`;
- toast administrativo: `z-[110]` y live region;
- botones de guardado: disabled durante la peticion y texto `Sincronizando...`/`Guardando...`;
- doble envio del guardado principal bloqueado por `saving`.

Esto demuestra el contrato de capas, pero no sustituye la evidencia visual funcional exigida en QA y produccion.

## QA develop

El certificado versionado `scripts/certifications/admin-user-cycle-qa.js` se ejecuto contra `https://apexos-web-qa-production.up.railway.app` y el proyecto Supabase QA. Resultado: **13/13 aprobados**. Cubrio login administrativo, commit desplegado, fixtures de dos roles, autenticacion requerida, aislamiento cross-tenant, alta, duplicado, edicion, persistencia tras refresh API, cambio de rol y contraseña, rechazo de clave anterior, aceptacion de clave nueva, inactivacion y rechazo del login inactivo.

El usuario funcional temporal quedo inactivado por el propio certificado. El actor administrativo efimero se elimino en `finally`: membresia `204`, perfil `204`, identidad Auth `200`. Evidencia sanitizada: `docs/qa/evidence/admin-user-cycle-20260820/certification.json`.

Bloqueo transversal: `apexos-api-qa` responde salud correctamente, pero reporta `b66f4348f987`, distinto de `develop` `5eed5811972a96ecf0ce79afd6ad2b374de93451`. La politica prohibe ejecutar/aprobar `platform-regression-qa.js` con commits distintos.

## Produccion Nyvora

Casos PROD-USR-001 a PROD-USR-016: **0 ejecutados, 16 pendientes**. Usuarios QA creados: **0**. Operaciones productivas: **ninguna**. Limpieza: **no aplica**.

## Performance

El guard versionado aprobo 17 objetivos sin fallos. La correccion agrega campos al payload y al SELECT existente, sin nuevas consultas ni refetch global adicional. La no regresion perceptual requiere aun medicion E2E en QA.

## Git y despliegue

- Correccion principal en `desarrollo`: `9a607e5c79b59e9ff4a382433634fa9bd8b7b33b`.
- PR `desarrollo -> develop` #18: 13 checks aprobados; merge `3a7c2a541f2dfd4d81261b795819e0ccb6ab01bd`.
- Ajuste del guard QA en `desarrollo`: `09530c8499a9bf2a61fc9a06bfbed214ad790e55`.
- PR `desarrollo -> develop` #19: 13 checks aprobados; merge `5eed5811972a96ecf0ce79afd6ad2b374de93451`.
- `origin/main` permanece en `22f83300301077f5dc211aee17f01fc52ecc324e`.
- Railway web QA desplego y reporto exactamente `5eed5811972a96ecf0ce79afd6ad2b374de93451`.
- Railway API QA permanece en `b66f4348f987`; este desfase bloquea `develop -> main`.
- El worktree original de `main` tenia archivos no rastreados y no fue modificado.
- No se creo rama auxiliar, no hubo push directo a ramas protegidas y no se modifico infraestructura.

## Migraciones

**No.** La correccion usa columnas y `metadata` existentes. No se aplico SQL local, QA ni productivo.

## Dictamen

La causa observable fue corregida y el ciclo API autenticado quedo certificado en QA. El cambio **todavia no puede promoverse a `main`** hasta desplegar el commit exacto de `develop` en `apexos-api-qa`, ejecutar `platform-regression-qa.js`, completar el barrido visual/modelo NYVORA, obtener aprobacion funcional independiente identificada y aprobar el manifiesto mediante `npm run qa:approval:evidence -- <manifest>`.
