# Certificacion del paquete de sesion (401 → 403) sobre main — 2026-11-08

Cambio: `sesion-admin-produccion-20261108`
Candidato: `codex/qa-sesion-main-20261108`, commit funcional `3fa6a5f0` sobre `origin/main 1b76376c`.
Destino: `main` (produccion). Origen del contenido: el mismo arbol que ya paso la puerta de
develop en el commit certificado `7687aed4`.

## Que se llevo a main y como

No es una fusion. `origin/develop` trae ademas Gastos Menores, el tarifario con sedes, la
liquidacion por paquetes, la bandeja de facturas recibidas y sus migraciones, cuyo esquema no
existe en produccion; fusionar la rama arrastraria ese alcance y sus migraciones sin aplicar. El
candidato se reconstruyo con el parche puntual del paquete sobre el tip vigente de `origin/main`
(`git diff 530334f2..7687aed4` recortado a las 10 rutas del alcance) y se aplico con merge de tres
vias: los 7 archivos compartidos bajan limpios.

Inventario medido del commit funcional (`git show --numstat 3fa6a5f0`):

| Archivo | + | - | Naturaleza |
|---|---|---|---|
| `apps/api/server.js` | 9 | 2 | reclasifica el rechazo: 403 con el codigo del error, 500 `EMPRESA_NO_RESUELTA`, 401 solo si la credencial no resuelve |
| `apps/api/src/middleware/rbac.js` | 5 | 4 | cuatro guardas de rol ausente pasan de 401 a 403 `ROL_NO_DEFINIDO` |
| `apps/api/src/middleware/tenancy.js` | 3 | 1 | `EMPRESA_REQUERIDA` pasa de 401 a 403 |
| `apps/api/src/security/supabaseAuth.js` | 12 | 2 | `authorizationDenied()` tipa el error con `statusCode = 403`; codigos `EMPRESA_NO_AUTORIZADA` y `EMPRESA_NO_VINCULADA` |
| `apps/web/lib/api.ts` | 6 | 0 | `SESSION_SCOPE_CODES` y los mensajes que nombran la causa y declaran que la sesion sigue activa |
| `apps/api/test/hr-route-physical-deletion.test.js` | 2 | 2 | se alinea al codigo de estado real del middleware |
| `apps/api/test/authorization-status-codes.test.js` | 170 | 0 | prueba nueva: contrato de estado medido contra el servidor |
| `apps/web/test/session-scope-403.test.mjs` | 70 | 0 | prueba nueva: contrato del cliente y `clearSession` solo bajo 401 |
| `package.json` | 1 | 0 | puerta `certify:sesion-admin:local` |
| `scripts/certifications/sesion-administracion-local.js` | 212 | 0 | puerta de arbol |
| `scripts/certifications/sesion-administracion-qa.js` | 291 | 0 | puerta de ambiente desplegado |

Cero archivos eliminados y cero reescrituras de comportamiento fuera del alcance: los unicos `-`
del parche son las cuatro lineas de 401 que se convierten en 403 y las dos que el catch de
`server.js` reemplaza por la distincion 403/401/500. La peticion sigue denegada en todos los casos
medidos; lo que cambia es el motivo que ve el cliente.

## Que NO toca este candidato (drift preexistente main vs develop, medido)

`apps/api/server.js` en main no registra `petty-cash` ni `transport-pyg` y no exporta el handler
serverless; `rbac.js` no exporta `roleScopeViolation`; `supabaseAuth.js` no tiene el rol
"Accionista". Nada de eso pertenece a este alcance y nada de eso se movio: el parche solo toco los
 hunks de estado. Estas diferencias se midieron con `git diff 7687aed4` sobre el arbol parchado y
son las unicas desviaciones respecto del arbol que ya paso develop.

## Puerta 1: arbol certificado

`npm run certify:sesion-admin:local` sobre `3fa6a5f0` → **11 cheques, 0 fallos**
(`docs/qa/evidence/sesion-admin-produccion-20261108/certificacion-local.json`, `commit: 3fa6a5f08199`).

Levanta el servidor Fastify real del arbol en un puerto loopback efimero contra un borde Supabase
simulado que solo reconoce el token del escenario, y mide en la misma corrida:

- sesion Supabase valida sin empresa en `GET /api/v1/admin/roles` → **403 `EMPRESA_NO_VINCULADA`**
- token que no resuelve identidad → **401 `TOKEN_INVALIDO`** (la autenticacion no se relajo)
- peticion anonima → **401**
- `apps/web/test/session-scope-403.test.mjs` → 5/5
- `apps/api/test/authorization-status-codes.test.js` con `AUTH_STATUS_INTEGRATION=1` → 6/6
- seis contratos de fuente (403 de `server.js`, 500 `EMPRESA_NO_RESUELTA`, 403 de tenancy, ausencia
  de 401 por rol en rbac, `statusCode = 403` en supabaseAuth, `SESSION_SCOPE_CODES` en el cliente)

## Puerta 2: ambiente desplegado (QA)

`node scripts/certifications/sesion-administracion-qa.js --env-file=config/qa.env --expected-commit=6edf85c7`
→ **9 controles, 0 fallos** (`sesion-qa-certification.json` y `sesion-qa-certification-salida.txt`).

Medida contra `https://apexos-api-qa-production.up.railway.app`, commit desplegado `6edf85c7d622`
(el merge del mismo paquete en develop). El sintoma reportado se reproduce con una cuenta Supabase
real de QA y cero vinculos, no con un doble local:

| Control | Medida |
|---|---|
| 01 salud_y_commit_desplegado | `health=OK commit=6edf85c7d622` |
| 02 sin sesion | `401 TOKEN_INVALIDO` |
| 03 token basura | `401 TOKEN_INVALIDO` |
| 04 token firmado con clave ajena | `401 TOKEN_INVALIDO` |
| 05 cuenta valida sin empresa | **`403 EMPRESA_NO_VINCULADA`** — aqui estaba el 401 que expulsaba |
| 06 la sesion no es expulsada | `auth/me=403 admin/roles=403`, ninguna rama es 401 |
| 07 empresa modelo NYVORA vinculada | `auth/me=200 admin/roles=403 MODULO_NO_HABILITADO` — la ruta autorizada sigue viva y el rechazo que aparece es de licencia, no de sesion |
| 08 limpieza | 0 filas `company_users` remanentes, `403`, nunca 401 |
| 09 cuentas efimeras eliminadas | 0 cuentas fixture, `health=OK` |

La corrida escribe solo en QA: crea dos cuentas Supabase etiquetadas con el RUN_ID, un vinculo y su
`profiles` para la empresa modelo, y los borra por id exacto. Aborta si la URL de API no es
exactamente el host HTTPS de QA.

## Regresion

- `platform-regression-qa.js` contra el deploy con el paquete: `ok: true`, commit `6edf85c7d622`,
  cheques transversales session / servicios / ordenes / referencias / empleados / inventario /
  plan contable en verde y el pedido sin autorizacion bloqueado (`platform-regression-qa.txt`).
- Suite API sobre el arbol de main: 500/495, 2 rojos y 3 saltados. Linea base limpia `1b76376c`:
  494/490, 2 rojos y 2 saltados. Nombres identicos, delta +6 pruebas / +5 pases / +1 saltada,
  **0 regresiones atribuibles** (`api-suite.txt`, `baseline-reds-main-1b76376c.txt`).
- Suite web sobre el arbol de main: 443/442/1 rojo. Base: 438/437/1 rojo con el mismo nombre.
  Delta +5/+5, **0 regresiones atribuibles** (`web-suite.txt`).

## Lo que esta hoja no certifica

1. No mide el ambiente productivo. La verificacion contra produccion es posterior al deploy y se
   hace leyendo `/health` y la ruta de Administracion con una sesion real; queda registrada como
   pendiente hasta ese paso.
2. No hay certificacion end-to-end con la sesion del dueno: reproducir el sintoma con su cuenta
   exige su clave y ninguna prueba de este cierre la usa. Lo que si existe es la reproduccion con
   una cuenta real de QA en la misma condicion (cero vinculos de empresa).
3. En QA la empresa modelo NYVORA no tiene el modulo de Administracion habilitado, por eso el
   control 07 termina en `MODULO_NO_HABILITADO`. En produccion el tenant de la cuenta maestra si
   trae `administracion_apex` y `platform_admin`, segun el diagnostico del 2026-11-08.
4. No incluye la salida C (respaldo de plataforma en `supabaseAuth`): autorizada por el dueno y
   sin implementar; pide revision de `apexos-seguridad` porque es una decision de autorizacion.
5. Sin migraciones: el paquete es codigo de autorizacion y de cliente, no esquema.
