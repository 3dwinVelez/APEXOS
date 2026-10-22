# Certificacion de recuperacion de credenciales y runtime QA — 2026-10-22

Cambio: `credential-recovery-qa-20261022`
Promocion certificada: `desarrollo -> develop` (pre-QA). No autoriza `main`.
Commit funcional certificado: `6d5cce46666200eef4a05b5286972e496c28be4e` (tree `7392822c4c5ce6a2917eedd36c56a389d068437e`).
Baseline del destino `develop`: `807f7930afff87abb5f6baa12d52a4aeedcce34e`.
Cuenta de origen preservada por `Source-Commit`: f94664c0, 6ece03d4, e0b8021f, 61e97120.

## Alcance exacto

Dieciocho rutas, cero eliminaciones, verificadas byte por byte contra `desarrollo`:

- `apps/api/server.js` (M), `apps/api/src/core/serverlessHandler.js` (A), `apps/api/test/serverless-handler.test.js` (A)
- `apps/web/app/api/public/service-requests/route.ts` (M), `apps/web/app/api/services/monitor-orders/route.ts` (M), `apps/web/app/api/v1/services/orders/[id]/route.ts` (M)
- `scripts/certifications/recovery-provided-access.cjs` (A), `scripts/certifications/recovery-serverless-local.cjs` (A)
- `scripts/security/recovery-backup.cjs`, `recovery-readiness.js`, `recovery-route-probe.js`, `recovery-vault.ps1`, `recovery-vercel-qa.cjs` (A)
- `scripts/test/recovery-backup.test.cjs`, `recovery-readiness.test.js`, `recovery-route-probe.test.js`, `recovery-vault.test.js`, `recovery-vercel-qa.test.cjs` (A)

Las otras 148 rutas del diff amplio entre `desarrollo` local y `develop` quedaron excluidas. No se modificaron modulos ajenos, migraciones, esquema ni datos.

## Evidencia ejecutada sobre este candidato

Toda ejecucion ocurrio en un worktree aislado del candidato, con una base de datos clon local y sin trafico real a Supabase salvo las lecturas de compatibilidad indicadas. Los valores de credenciales no se imprimieron ni se persistieron.

| Control | Resultado | Limite declarado |
| --- | --- | --- |
| Suite de recuperacion (`scripts/test/recovery-*.test.*` + `apps/api/test/serverless-handler.test.js`) | 23 pruebas, 23 pasan, 0 fallos, 0 omitidas | Pruebas unitarias y de HTTP local, no certifican negocio completo |
| Certificacion E2E real bajo el adaptador Vercel (`scripts/certifications/recovery-serverless-local.cjs`) | 9 de 9: health, login, sesion, Servicios, RR. HH., Inventario, Contabilidad, renovacion y sesion renovada, todos HTTP 200 | API real local con adaptador Node de Vercel; no prueba el runtime serverless remoto |
| Compatibilidad de los 3 helpers privilegiados de Services contra Supabase QA (`scripts/security/recovery-route-probe.js`) | 3 de 3 pasan con clave `sb_secret_` | Lectura REST minima; no certifica RBAC, aislamiento ni el monitor WEB desplegado |
| Regresion de API sobre el clon aislado | 748 de 748 pasan, 0 omisiones | No sustituye QA funcional remoto |
| Regresion de WEB sobre el clon aislado | 542 de 545 pasan, 3 fallos, 0 omisiones | Ver fallo preexistente abajo |
| Prueba del mismo trio de archivos WEB sobre el arbol base intacto `807f7930` | 3 archivos con 10, 9 y 13 pruebas: 32 en total, 29 pasan y los mismos 3 fallan | Los tres fallos existen antes del candidato |

Detalle de la reproduction base (archivos extrados de `807f7930`, ejecutados intactos):

- `apps/web/test/command-palette-module-functions.test.mjs`: 10 pruebas, 9 pasan, 1 falla (cobertura del centro de comandos).
- `apps/web/test/transport-settlement-tower.test.mjs`: 9 pruebas, 8 pasan, 1 falla (advertencia de contabilizacion y pago).
- `apps/web/test/transport-vehicle-master-catalogs.test.mjs`: 13 pruebas, 12 pasan, 1 falla (ficha vehicular, sucursal y centro de costo).

Los tres fallos pertenecen a cobertura de frontend de otros modulos (Contabilidad/Gastos Menores en la paleta, Torre de liquidacion, Ficha vehicular). Ninguno toca las 18 rutas de este candidato y no se modificaron, omitieron ni declararon como aprobados.

Evidencia privada (fuera del repositorio, ruta absoluta en el informe de promocion): corridas `candidate-1792702056349`, `candidate-e2e-serverless-1792701797637`, `candidate-route-probe-1792701833*`, `baseline-three-web-files-individual-1792702092*`.

## Capacidades protegidas

1. Adaptador HTTP de Vercel que inicializa una unica instancia de Fastify, espera `ready()` y entrega la solicitud; fallo de arranque responde 503 generico sin filtrar excepciones.
2. Rutas privilegiadas de Services autentican con la credencial de servicio en `apikey` y `Authorization`; las lecturas publicas y las sesiones de usuario conservan su propia credencial.
3. Readiness y utilitarios de recuperacion fallan cerrados ante configuracion cruzada de ambientes, no envian credenciales a destinos ajenos, no siguen redirecciones y no registran cuerpos del proveedor ni secretos.
4. Almacen cifrado DPAPI restringido al usuario actual, con segregacion por ambiente y variable, y evidencia obligatoriamente fuera del repositorio.
5. Aplicacion de variables restringida a QA; produccion bloqueada por diseno en el helper.
6. Respaldos cifrados verificables por hash, descifrado autenticado y tamano, sin restauracion implicita.
7. Regresion de API completa y suite de recuperacion sin omisiones sobre el candidato.

## Pendientes que esta certificacion NO cierra

- No se publico, desplego ni promovio nada con esta evidenci; sigue pendiente el push y el PR `desarrollo -> develop`.
- El runtime Vercel QA del base `807f7930` devuelve `500 FUNCTION_INVOCATION_FAILED` (plugin `@fastify/cors` fuera de tiempo y decorador `corsPreflightEnabled` duplicado tras `Node.js process exited with exit status: 129`). El adaptador aqui certificado ataca esa causa, pero su correccion remota queda sin probar hasta desplegar el candidato.
- La clave legacy `service_role` de Supabase QA sigue siendo aceptada (HTTP 200 en Auth administrativo junto con la clave nueva): la rotacion no esta cerrada y no se revoco nada.
- Contrasena PostgreSQL/`DATABASE_URL` de QA sin rotar; consumidores de `SUPABASE_SERVICE_ROLE_KEY` con nombre exclusivo (`apps/api/src/modules/services/evidenceUploads.js`) sin migrar a `SUPABASE_SECRET_KEY`.
- Monitor WEB de Servicios en QA sigue sin certificacion funcional remota; el 403 anterior no se reprodujo despues del candidato porque aun no esta desplegado.
- Railway publico a las 19:42 UTC que los builds del plan Hobby seguian en rehabilitacion; el panel de nuestros servicios muestra ultimo despliegue exitoso y redespliegue habilitado, pero no intentamos uno.
- Restauracion aislada de los respaldos y custodia externa independiente de la clave de respaldo siguen pendientes.
