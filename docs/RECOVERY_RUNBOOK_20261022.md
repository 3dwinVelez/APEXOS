# Recuperacion de credenciales APEXOS — 2026-10-22

Este procedimiento no certifica un incidente resuelto. La disponibilidad publica,
las pruebas unitarias y `recovery-readiness.js` no sustituyen la certificacion
funcional completa ni autorizan publicar o promover ramas.

## Objetivos y limites

- Implementacion en `desarrollo`; promociones solamente `desarrollo -> develop -> main`.
- QA: Railway `33726923-021d-47a7-a263-b8b287f164f1`, entorno
  `97b0366d-a965-4356-88fd-f66dc45e83b9`, Supabase `jbirkghkekuifgfsgquq`.
- Produccion: Railway `0afe38cc-6080-49d2-aa24-2d5625250ac2`, entorno
  `7f4388a3-b254-4d64-ba49-434b16e41469`, Supabase `jzbwzmkidfthknsohhnr`.
- Ambos entornos Railway se llaman `production`; usar siempre sus IDs completos.
- El JWT propio de la API es independiente de las claves de Supabase. Cambiarlo
  invalida los tokens firmados con el secreto anterior.
- No revocar credenciales productivas con posible interrupcion, invalidar sesiones
  masivamente ni promover a produccion sin aprobacion explicita del impacto.
- No ejecutar migraciones, modificar RLS ni datos del negocio para rotar secretos.

## Almacenamiento privado

El inventario y las evidencias deben permanecer en una carpeta privada fuera del
repositorio. Ningun valor anterior se agrega al inventario. No usar argumentos de
procesos, consola, documentos planos ni historial para transferir secretos.

`scripts/security/recovery-vault.ps1` cifra valores nuevos mediante Windows DPAPI
`CurrentUser`, vinculados al entorno y nombre de variable. El archivo `.dpapi`
se abre solamente bajo el contexto Windows que lo protegio; no es una exportacion
portable ni reemplaza un gestor corporativo con recuperacion y respaldo.

La carpeta debe existir previamente con ACL restringida al usuario y SYSTEM.
Para ingresar una clave nueva sin mostrarla:

```powershell
powershell -NoProfile -File scripts/security/recovery-vault.ps1 -Action Store -Environment qa -Variable SUPABASE_SERVICE_ROLE_KEY -VaultRoot "$env:USERPROFILE\.codex\private\APEXOS_CREDENCIALES_RECUPERACION_2026-10-22" -PromptSecure
```

`-Action Verify` comprueba descifrado sin mostrar el secreto. `-Action UpdateEnv`
actualiza solamente el archivo ignorado del entorno. `-Action ApplyRailway
-Service api|web` envia el valor por stdin a la CLI de Railway y suprime la salida
del proveedor. Requiere una sesion Railway valida. Esta accion solamente admite
QA; produccion queda bloqueada por diseno. `-SkipDeploys` cambia variables sin
actualizar procesos en ejecucion: no interpretar eso como aplicacion verificada.
`-Action Generate -Variable JWT_SECRET` genera 48 bytes aleatorios mediante CSPRNG
y los guarda cifrados; no modifica el emisor de sesiones ni sus consumidores.
El helper rechaza carpetas con ACL que permita acceso a identidades distintas del
usuario actual, SYSTEM o administradores locales.

## Secuencia de QA

1. Inventariar todos los consumidores antes de cambiar el emisor. Incluir WEB y
   API: las rutas Next administrativas utilizan la clave privilegiada en servidor.
2. Crear la clave nueva en el emisor mediante mecanismo soportado; conservar la
   anterior temporalmente para evitar interrupcion durante la sustitucion.
3. Guardar la clave nueva cifrada; verificar que descifra sin revelarla.
4. Confirmar compatibilidad de los consumidores con las claves `sb_secret_`.
   El codigo contiene accesos HTTP directos y SDK: verificar Auth administrativo,
   REST y Storage con la clave nueva; no asumir compatibilidad por su nombre.
5. Actualizar el archivo QA ignorado y ambos consumidores Railway QA. No usar la
   configuracion QA local si la base o las URLs apuntan a localhost.
6. Coordinar cambio de contrasena PostgreSQL y todas sus cadenas consumidoras.
   Confirmar puerto, usuario de pooler, SSL y proceso de redeploy antes del cambio.
7. Rotar el JWT propio de QA, sin reutilizarlo en desarrollo ni produccion.
8. Verificar commits y despliegues reales. Revisar antes cualquier comando de
   predeploy: el API QA tiene configurado `prisma migrate deploy`; la autorizacion
   de rotar credenciales no autoriza migraciones remotas.
9. Ejecutar la certificacion operacional con las dos cuentas provistas por el
   usuario (local y QA/develop): login, renovacion, sesion y consultas de modulos.
   El usuario excluyo expresamente otros roles del alcance de esta recuperacion.
   No crear cuentas adicionales ni afirmar RBAC o aislamiento multiempresa
   certificados por estas pruebas. No reutilizar cuentas productivas en QA.
10. Revocar las claves antiguas por el mecanismo del emisor y comprobar su rechazo
    sin registrar valores. Las claves legacy `anon/service_role` estan acopladas;
    revisar el procedimiento actual de Supabase antes de deshabilitarlas.
11. Repetir certificacion con credenciales nuevas y guardar evidencia privada.

## Produccion y recuperacion ante fallos

Tras certificar QA, preparar una unica solicitud de aprobacion con secretos y
consumidores exactos, impacto sobre sesiones, ventana estimada basada en los
tiempos medidos en QA y acciones de recuperacion. Mantener los clientes antiguos
operativos hasta actualizar todos los consumidores cuando el mecanismo lo admita.

Si falla una credencial nueva, corregir consumidores o emitir otra credencial
nueva. Nunca restaurar permanentemente una credencial potencialmente expuesta.
La contrasena PostgreSQL exige coordinar la sustitucion con los procesos que
mantienen conexiones. No prometer cero interrupcion sin evidencia en QA.

Vercel debe quedar inventariado incluso si ya no recibe trafico. Un error 403 no
demuestra que el proyecto este inactivo. Verificar deployments, variables y tokens
del equipo antes de declarar que no existen consumidores adicionales.

## Pruebas repetibles

```powershell
node --test scripts/test/recovery-readiness.test.js scripts/test/recovery-vault.test.js
node scripts/security/recovery-readiness.js --environment qa --env-file config/qa.env --output "$env:USERPROFILE\.codex\private\APEXOS_CREDENCIALES_RECUPERACION_2026-10-22\qa-readiness.json"
node scripts/security/recovery-readiness.js --environment production --env-file config/production.env --output "$env:USERPROFILE\.codex\private\APEXOS_CREDENCIALES_RECUPERACION_2026-10-22\production-readiness.json"
```

Readiness realiza solamente GET, rechaza configuracion cruzada antes de enviar
credenciales, rechaza redirecciones y no imprime cuerpos del proveedor. Un exit 0
solo acredita esas comprobaciones; siempre declara `complete_certification: false`.
No ejecuta login, renovacion, escritura, aislamiento ni revocacion.

## Compatibilidad de las rutas Services con claves nuevas

Las rutas servidor de solicitudes publicas, monitor de ordenes y detalle de orden
usaban `apikey: anonKey` con `Authorization: Bearer serviceRoleKey`. El gateway
QA devuelve 401 cuando la segunda credencial es `sb_secret_`. Los accesos
privilegiados deben enviar la credencial de servicio en ambas cabeceras; los
accesos publicos y las sesiones de usuario conservan su credencial y token.

La correccion local se valida mediante las funciones reales extraidas de las tres
rutas y consultas de lectura contra Supabase QA:

```powershell
node --test scripts/test/recovery-route-probe.test.js
node scripts/security/recovery-route-probe.js config/qa.env "$env:USERPROFILE\.codex\private\APEXOS_CREDENCIALES_RECUPERACION_2026-10-22\qa-route-compatibility.json"
```

Este probe no ejecuta los flujos de negocio, permisos y aislamiento completos ni
certifica un despliegue WEB. Su resultado no autoriza promocion. La rama local
`desarrollo` contiene otros cambios ajenos a la recuperacion frente a
`origin/develop`; nunca fusionar toda la rama para publicar estas tres lineas.
Preparar el candidato puntual contra el commit remoto vigente y certificarlo.

## Respaldo cifrado y acceso operacional

`scripts/security/recovery-backup.cjs` exporta PostgreSQL con pg_dump 17 y descarga
los objetos de Storage de QA y produccion. Cada artefacto usa AES-256-GCM con
nonce independiente; la clave del archivo se protege con DPAPI CurrentUser.
Los dumps y objetos no se escriben en claro. El inventario de privilegios incluye
roles y grants sin contrasenas. El manifiesto contiene identificadores opacos,
tamanos y hashes; los nombres de objetos permanecen en indices cifrados.

```powershell
node scripts/security/recovery-backup.cjs "$env:USERPROFILE\.codex\private\APEXOS_CREDENCIALES_RECUPERACION_2026-10-22"
node scripts/security/recovery-backup.cjs --verify "<directorio-absoluto-del-respaldo>"
```

El respaldo terminado de esta intervencion contiene dumps de ambos ambientes,
123 objetos QA y 375 objetos PROD. Se verificaron 506 artefactos mediante hash,
descifrado autenticado y tamano, ademas del catalogo pg_restore. Todavia no se ha
ejecutado una restauracion completa en una base aislada. La clave DPAPI depende
del usuario Windows y no constituye por si sola una estrategia de copia externa.

`scripts/certifications/recovery-provided-access.cjs` recibe por stdin JSON con
las cuentas `local` y `qa`, cada una con `email` y `password`; recibe como primer
argumento una ruta privada para la evidencia. No persiste contrasenas ni tokens.
El acceso operacional paso en local y Railway QA, pero el monitor WEB QA devuelve
403; el script conserva ese fallo y termina con codigo 1. No certifica el incidente
completo ni habilita una promocion por el exito de las consultas restantes.

## Vercel: configuracion y adaptador HTTP

`scripts/security/recovery-vercel-qa.cjs --plan|--apply <directorio-privado>` solo
acepta Preview de la rama develop. Comprueba identidad QA y aplica variables
especificas de esa rama. Separa JWT, base y Supabase de produccion. No cambia
Production ni revoca variables globales. Reutilizar el codigo remoto existente
no equivale a publicar las correcciones locales de esta recuperacion.

La Preview con commit 807f7930 registra todos los modulos y la ruta health, pero
termina en FUNCTION_INVOCATION_TIMEOUT tras 300 segundos. `server.js` exportaba
una factoria de Fastify, que construye la app sin responder a req/res. En Vercel
ahora exporta un adaptador Node que inicializa una vez, espera app.ready() y
entrega las solicitudes al servidor Fastify. Fuera de Vercel conserva la factoria
y el inicio HTTP existente. La publicacion de esta correccion esta pendiente.

```powershell
node --test apps/api/test/serverless-handler.test.js scripts/test/recovery-backup.test.cjs scripts/test/recovery-vercel-qa.test.cjs scripts/test/recovery-route-probe.test.js scripts/test/recovery-readiness.test.js scripts/test/recovery-vault.test.js
```

Las 23 pruebas pasaron, incluyendo HTTP real con Fastify, concurrencia, POST,
404, error de bootstrap, cifrado y restricciones de ambiente. Adicionalmente,
`scripts/certifications/recovery-serverless-local.cjs <evidencia-privada>` recibe
la cuenta local por stdin y arranca la API real bajo el adaptador Vercel con base
local y workers deshabilitados. Sus nueve controles de salud, login, sesion,
consultas y renovacion pasaron. No certifica el runtime remoto ni reemplaza la
certificacion funcional WEB y los gates de promocion.

Antes de publicar cambios deben existir certificaciones versionadas del flujo
completo y pasar los manifiestos de alcance/evidencia exigidos en AGENTS.md y
`docs/CHANGE_APPROVAL_QA_POLICY.md`. Este runbook no habilita omitirlos.
