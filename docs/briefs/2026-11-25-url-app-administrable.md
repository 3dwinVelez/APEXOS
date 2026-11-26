# Brief — La URL de la app móvil se administra por ambiente

- **ID**: `2026-11-25-url-app-administrable`
- **Fecha**: `2026-11-25`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "no debemos hacer otras adiciones ni mas temas que no esten en el alcance por otro lado incluye la configuracion del link de la app en un apartado en el adminsitrador de configuracion de apexos donde podamos cambiar la url que se muestra en el ambiente de esa manera evitamos que realicen actividades en el ambiente que no corresponde"

## 1. Objetivo

Que el enlace a la app móvil que muestra la pantalla de acceso sea un valor administrado desde Administración APEX, guardado en la base de cada ambiente, en lugar de una cadena quemada en el artefacto. Con esto, quien entra a QA ve el enlace de la app de QA y quien entra a Producción ve el de Producción, y se evita que una persona marque su jornada en el ambiente equivocado.

Un solo valor entra en este frente: la URL de la app móvil. No se crea un marco genérico de preferencias ni se toca ninguna otra pantalla de configuración.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `docs/briefs/2026-11-25-url-app-administrable.md` | este brief |
| `M` | `apps/api/prisma/schema.prisma` | modelo `PlatformSetting` (tabla `platform_settings`) |
| `A` | `apps/api/prisma/migrations/20261125183000_platform_settings/migration.sql` | creación idempotente de la tabla y su índice único por clave |
| `A` | `apps/api/src/modules/admin/platform-config-service.js` | leer y guardar la URL de la app: validación, normalización, auditoría y ambiente |
| `M` | `apps/api/src/modules/admin/routes.js` | `GET`/`PUT /admin/platform/mobile-app` con capacidad administrativa |
| `M` | `apps/api/src/modules/admin/public-routes.js` | `GET /public/platform/mobile-app` sin sesión, con límite de peticiones |
| `M` | `apps/api/src/middleware/rbac.js` | capacidad `platform_settings` (read/edit) en la matriz de roles legacy |
| `A` | `apps/api/test/admin-platform-mobile-app-url.test.js` | permisos, validación, persistencia, auditoría y lectura pública |
| `M` | `apps/web/lib/mobileAppInstall.ts` | normalizador compartido y lectura de la URL configurada con respaldo |
| `M` | `apps/web/components/system/AppInstallBand.tsx` | la banda usa el valor configurado; el DOM certificado no cambia |
| `M` | `apps/web/app/dashboard/administracion/page.tsx` | apartado "App móvil" en el grupo Sistema con editor real |
| `M` | `apps/web/test/mobile-app-install.test.mjs` | contrato: la banda pide el valor configurado, conserva respaldo y el administrador apunta a los endpoints reales |
| `A` | `scripts/certifications/mobile-app-url-admin-local.js` | certificación de flujo completo en navegador |
| `M` | `docs/project/app-movil.md` | la URL deja de ser solo variable de build |
| `M` | `docs/DATABASE_CONVENTIONS.md` | se enuncia la excepción usada: configuración técnica de plataforma sin `tenant_id` |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md`, `.qoder/skills/**`, `agents/**/SKILL.md` | canon del equipo al día |

### Módulos (`change_intent.modules`)

- `admin`
- `platform-settings`
- `auth-login-band`
- `administracion-screen`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Los cuatro pendientes declarados en el cierre anterior (corrida del instrumento de 126 controles contra QA, alineación del canon de agentes en `develop`, decisión sobre la instancia que lee producción, borrado de la rama auxiliar). El dueño ordenó no abrir otros temas.
- `package.json`: no se agrega alias npm. El archivo trae cambios sin commitear de otro frente y commitearlo mezclaría módulos. El instrumento se corre con `node scripts/certifications/mobile-app-url-admin-local.js`.
- Promoción a `develop` o `main`, despliegue, migraciones remotas y cualquier cambio en Railway o Supabase.
- Configuración por empresa: el acceso es una pantalla previa a la empresa, así que el valor es por ambiente, no por tenant.
- El repo aparte de la app (`AppApexos`): este cambio decide a qué dirección se le envía, no cómo se comporta la app.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- La escritura del valor queda detrás de sesión válida, módulo `admin` habilitado y capacidad administrativa; la lectura pública no devuelve nada sensible (solo la URL) y está limitada en peticiones.
- Toda escritura deja fila en `AuditLog` con actor, valor anterior y valor nuevo.
- El ambiente que muestra el editor lo declara el servidor desde su propia configuración; nunca se acepta el ambiente como autoridad desde el navegador.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `npx prisma validate` y `npx prisma migrate deploy` sobre una base local limpia → verde, con `platform_settings` creada.
2. `node --test apps/api/test/admin-platform-mobile-app-url.test.js` → verde, y demuestra: `401` sin sesión en la escritura, `403` con sesión sin capacidad, `400` con URL que no es `https` o vacía, `200` con URL válida que persiste, y la lectura pública responde `https` sin necesitar sesión.
3. En el navegador, la pantalla de acceso muestra el destino conocido mientras no haya valor guardado; tras guardar `https://app.example.co` desde Administración, la guía del acceso abre con ese enlace y el botón de copiar entrega exactamente esa cadena.
4. El apartado de Administración muestra el ambiente que respondió el servidor y quién cambió el valor por última vez.
5. Si la lectura pública falla (red, 500 o valor inválido), la banda sigue funcionando con el destino quemado: nunca queda un enlace vacío.
6. `node --experimental-strip-types --test apps/web/test/mobile-app-install.test.mjs` → verde, incluidas las afirmaciones heredadas del contrato de la banda (montaje único después del formulario, cero montajes en el tablero, `rel` seguro, cero enlaces en escritorio).
7. `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage && npm run test:agents` → verde antes del commit.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/admin-platform-mobile-app-url.test.js`, `apps/web/test/mobile-app-install.test.mjs`, suite web completa como regresión.
- Certificación: `node scripts/certifications/mobile-app-url-admin-local.js`, con evidencia en `docs/qa/evidence/url-app-administrable-20261125/`.
- La certificación ejerce el flujo completo: abrir el acceso → administrar el valor → volver al acceso y verificar el enlace nuevo → restaurar el valor por defecto → provocar el fallo de la lectura y verificar el respaldo. Incluye control de mutación del instrumento.
- `certification_status` esperado: `local_passed_qa_pending` (no hay promoción en esta intervención).

## 7. Capacidades protegidas

- Acceso público sin sesión — se certifica que la banda sigue visible y funcional aunque la API no responda.
- RBAC de administración — se certifica `403` con un rol sin la capacidad y `200` con `APEX_ADMIN`.
- Aislamiento de datos — la tabla nueva es de plataforma y no contiene dato operativo de cliente; se certifica que ninguna lectura pública expone nada más que la URL.
- Contrato visual de la banda — se certifica que el DOM sigue siendo el mismo que valida la certificación de 126 controles.

## 8. Riesgos y rollback

- Riesgo: una tabla global sin `tenant_id` puede leerse como licencia para lo mismo en datos operativos → Mitigación: clave única con allowlist en el servicio (hoy solo `mobile_app.url`), documento en `docs/DATABASE_CONVENTIONS.md` y revisión del experto de base de datos y de seguridad.
- Riesgo: la lectura pública se convierte en canal de ataque o en dependencia que tumbe el acceso → Mitigación: límite de peticiones, respuesta mínima, validación `https` en el cliente y respaldo quemado.
- Riesgo: migración no aplicada en la nube → Mitigación: la banda funciona igual sin tabla (cae al respaldo); la aplicación remota queda pendiente con dueño.
- Rollback: revert de los commits de esta intervención, no `reset` ni limpieza de historia.

## 9. Supuestos y preguntas abiertas

- Supuesto: QA y Producción usan bases distintas, así que una fila por clave resuelve el "por ambiente" sin tabla puente.
- Supuesto: la pantalla de acceso sigue siendo estática; por eso el valor configurado se carga en el cliente sin hacer dinámica la ruta.
- Pregunta abierta (no bloquea): si más adelante hace falta un enlace distinto por empresa, eso es otro frente con su propio brief.

## 10. Autorizaciones requeridas

- [x] Implementar en `desarrollo` (orden del dueño en este mensaje).
- [ ] Aplicar la migración `20261125183000_platform_settings` en QA y en Producción — requiere autorización explícita.
- [ ] Promover a `develop` — requiere autorización explícita y manifiesto de alcance propio.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS` para `apps/api/prisma/**`, `apps/api/src/modules/admin`, pantallas de `apps/web` y `docs/DATABASE_CONVENTIONS.md`.
- **Agentes consultados**: `equipo-apexos`, `apexos-db-nube`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- **Documentación a actualizar**: `docs/project/app-movil.md`, `docs/DATABASE_CONVENTIONS.md`, este brief y la evidencia en `docs/qa/evidence/url-app-administrable-20261125/`.
- **Agentes a actualizar**: `apexos-db-nube` 2.10.0 → 2.11.0; `apexos-backend` 2.31.0 → 2.32.0; `apexos-seguridad` 2.43.0 → 2.44.0; `apexos-frontend` 2.48.0 → 2.49.0; `apexos-qa` 2.125.1 → 2.126.0; `equipo-apexos` 2.70.1 → 2.71.0. Controles nuevos: uno por disciplina, enunciados en `agents/CHANGELOG.md`.
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<rutas tocadas>"` en verde.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit

## 12. Cierre de la intervención (2026-11-25)

- **Inventario real del commit**: **35 rutas** (**26 M** + **9 A**, **0** borrados). La tabla de la sección 2 agrupa el canon en una fila; desglosado son siete `.qoder/skills/**/SKILL.md`, sus siete espejos en `agents/**`, `agents/registry.json` y `agents/CHANGELOG.md`. El primer borrador de esta sección decía 27 porque contaba los espejos como una sola línea.
- **Preflight**: `OK_CON_ADVERTENCIAS` sobre 16 rutas; la advertencia es que `docs/project/app-movil.md` no tiene dueño asignado y lo firma `equipo-apexos`.
- **Cobertura**: la primera corrida salió **BLOQUEADO** con `apexos-brief` en `FALTA` —este brief es su ruta y el agente no había avanzado—. Se resolvió con bump de **parche** (`2.104.2 → 2.104.3`, sin control nuevo: es cierre sobre una ruta ya dueña del agente), no con una regla inflada para complacer el candado.
- **Medición final**: contrato del API **11/11**, contrato web **19/19**, certificación `node scripts/certifications/mobile-app-url-admin-local.js --web` **28/28** en doce etapas (`build_id 7RPf_TbXOdwbM2VMO_Wna`, `head c682bdf4`), con control de mutación **2/2** visto en rojo y el blob restaurado verificado (`9f29a3792873`). Evidencia: `docs/qa/evidence/url-app-administrable-20261125/` (JSON + 3 capturas recortadas al diálogo, 174 KB en total).
- **Dos hallazgos del propio corte.** (1) El rojo **25/26** era del instrumento: leía el autor en el `<p>` hermano y el autor vive en el mismo párrafo. (2) Al arreglar la lectura saltó el defecto real que ese rojo tapaba: la ventana de Administración **no pintaba** `updated_by` aunque la API lo devolvía, así que el administrador veía qué se movió y cuándo, pero no a quién llamar. Se corrigió la pantalla (línea «Quién lo cambió» en la tarjeta), se ampliaron cuatro assert del contrato web y la pata del arnés pasó a `tipo: "producto"` con su ANTES («sin cambios todavía») y su DESPUÉS (correo con `@`).
- **Un verde que no podía fallar**: el assert de la fecha comparaba contra `"sin cambios todavia"` sin tilde mientras la etiqueta real es `"sin cambios todavía"`; se reemplazó por igualdad exacta en el ANTES y `match(/\d{1,2}\/\d{1,2}\/\d{4}/)` en el DESPUÉS, y cada literal del arnés se cotejó byte a byte contra `MOBILE_APP_ADMIN_LABELS`.
- **Criterio 5 de la sección 5, matizado**: la banda sí conserva el destino quemado cuando la lectura falla, pero el intercambio no es instantáneo si el valor cambió por fuera del API —la cache del proceso dura **20 s** y solo la invalida un guardado—. La certificación lo dice en voz alta (`cache_ms` en el detalle de la pata) en lugar de fingir propagación inmediata.
- **Lo que no se hizo**: nada de promoción, despliegue ni migración en la nube; los cuatro pendientes del turno anterior quedaron en pausa por orden expresa y se redeclaran con dueño en `agents/CHANGELOG.md`.
- **Pendientes con dueño**: (1) aplicar `20261125183000_platform_settings` en QA y Producción —dueño, autorización expresa—; (2) correr el instrumento contra el ambiente desplegado con la pantalla de Administración servida —`apexos-qa`; (3) alias npm del instrumento cuando `package.json` asiente —dueño+`apexos-qa`; (4) los cuatro del turno anterior, en pausa.

## 13. Cuenta después del empuje: promoción a `develop` y corroboración en QA (2026-11-25)

Orden del dueño que ampara este tramo, literal: *«si procede con el despliegue solo en develop porque primero es alinear develop, para este caso el cambio que estamos realizando solo debe ser en desarrollo y develop para corroborar sus funciones realiza solo estas instrucciones con mi autorizacion aun no tocaremos el ambiente de produccion»*. No ampara `main`, force push, rebase de ramas permanentes, infraestructura ni cambios en Railway/Supabase.

- **Publicación**: `origin/develop` pasó de `3aaeeb32` a **`2943da63f623f4c86834ffa6355957f1e75e4190`** en **fast-forward** (anunciado con `git push --dry-run`, línea sin `+`, antes de empujar). `origin/desarrollo` quedó en `20696115`. `origin/main` intacto en `e3c2ad17`: Producción no recibió ni la banda ni el enlace administrable.
- **Compuertas, verbatim**: `ALCANCE DE PROMOCION VALIDO: url-app-administrable-develop-20261125 (26 rutas, transporte por ascendencia del commit certificado, origen verificado contra origin/desarrollo)` · `AUTORIZACION PRE-QA VALIDA: url-app-administrable-develop-20261125` · `GOBIERNO GIT` saliendo 0 desde el worktree limpio del candidato. Suites dentro del árbol del candidato: contrato del API **11/11**, contrato web **19/19**, `prisma validate` con el literal `is valid` y el modelo `PlatformSetting` completo. Invariantes del replay **11/11** con el control de mutación del instrumento en verde (3 derivas rojas) y los hunks medidos: `schema.prisma +14/-0`, `rbac.js +7/-0`, `administracion/page.tsx +95/-2`, cero líneas ajenas perdidas.
- **Por qué no fue `replay_puntual` puro**: `develop` tiene líneas propias de otros frentes en tres archivos compartidos (`schema.prisma` con los modelos `apex-control`, `rbac.js` sin `"apex-control"` y la tarjeta «Marcaciones» del panel). Llevar los blobs de `desarrollo` habría contrabandeado ese trabajo a QA; el candado estricto de blob único no describe una fusión, así que viajan **11 rutas byte a byte** y **3 rutas por hunks medidos**, con **tres `origin_waivers` nominales** (razón + aprobación) y merge de linaje para que `d667276f` sea ancestro del candidato. El manifiesto declara `transport: "replay_puntual_con_hunks_fusionados"`, que cae en la rama de ascendencia — no se aflojó el candado, se cambió de prueba y se escribió la prueba nueva.
- **Lo que se descubrió del ambiente (y corrige la sección 12)**: el servicio de API de QA **corre `prisma migrate deploy` al arrancar**, así que la promoción aplicó sola la migración. Medido en el ledger de QA: fila `44644a58-9776-4c83-b4bf-6f7a6292160b`, terminada `2026-11-25T22:28:25.031Z`, `applied_steps_count = 1`, checksum `34031aeb5cf4ba88a514034f05193f169aab10b29da73de666fe91666657ca2a` igual al archivo. El pendiente (1) de la sección 12 queda **cerrado en QA** y sigue abierto solo para Producción.
- **Corroboración en el ambiente desplegado** (`scripts/certifications/mobile-app-url-admin-qa.js`, nuevo y versionado): **17/17** en `docs/qa/evidence/url-app-admin-develop-20261125/qa-remoto.json`. Números que importan: `/health.commit = 2943da63f623`, tabla con **6 columnas** y **0 filas** al entrar, `401`/`401` sin sesión, `403 PLATAFORMA_SOLO_SUPERADMIN` al administrador de empresa sin tocar el conteo, los cinco rechazos con nombre propio sin escribir una fila, `environment: "qa"` declarado por el servidor sin bandera del arnés, guardado visible en la lectura pública en **80 ms**, autor guardado como correo, `AuditLog` con valor anterior y nuevo, restauración devolviendo el respaldo en **175 ms** y las dos cuentas efímeras retiradas (`401` al intentar entrar después).
- **Pata de navegador contra el QA servido** (`qa-navegador.json`, `qa-navegador-sonda.json`, `qa-cierre.json`): la guía del acceso copia exactamente la URL administrada, la tarjeta de Administración dice `AMBIENTE QUE RESPONDIÓ: qa` con el autor y la hora, y el botón «Volver al destino por defecto» aparece solo cuando el campo es distinto del quemado. Es corrida **manual** medida del DOM, no arnés: eso queda dicho en la propia evidencia.
- **Residuo declarado**: en QA queda **una** fila `mobile_app.url` con el destino quemado. El modo `--retire` intentó borrarla y la capa de Prisma de la casa lo bloqueó («Operación de borrado físico bloqueada para el modelo "PlatformSetting"»); no se le dio la vuelta con SQL crudo. El enlace que ve el usuario no cambia, pero la ventana dirá «administrado en este ambiente» en lugar de «respaldo». **0 cuentas de prueba activas** al cerrar.
- **Tres errores propios de este tramo, declarados**: (1) clasifiqué seis blobs de `develop` como «ausentes» porque Git Bash me reescribía `origin/develop:<ruta>`; la divergencia era falsa y se volvió a medir con `MSYS_NO_PATHCONV=1`. (2) Al activar esa variable se me rompió `git -C /c/...` y un `&& echo APLICA LIMPIO` encadenado imprimió verde de parches que no habían aplicado; rehecho con `git apply --check -3` y salida por archivo. (3) El instrumento de suites del candidato llevaba `|| true` en el assert del schema —un verde que no podía fallar—; se cambió por exigir el literal `is valid`, la ausencia de `P10xx` y el modelo completo con su `@@map`.
- **Pendientes que quedan, con dueño**: (1) decidir el valor del enlace por ambiente (hoy QA = destino quemado) —dueño—; (2) aplicar la migración en Producción y promover `develop → main` —dueño, autorización expresa, con su propio manifiesto—; (3) arnés de navegador versionado contra el ambiente, hoy sonda manual —`apexos-qa`—; (4) alias npm del instrumento cuando `package.json` asiente —dueño + `apexos-qa`—; (5) alinear el canon del equipo en `develop`, que va atrasado —`equipo-apexos`—; (6) borrar ramas y worktrees auxiliares de este frente —dueño da la orden—.

## 14. Secuela: el botón abre la app en vez de copiar la dirección, y el frente viaja hasta Producción (2026-11-26)

Orden del dueño, literal: *«extiende el cambio del boton de manera controlada y cerrada al ambiente main aunque la url pertenezca a qa lo importante en este caso es migrar la funcion y el boton de manera correcta ya la url me encargo yo de actualizarla solo un tema adicional en ves de permitirle al usuario copiar la url genera un boton que lo lleve directamente a la url asi evitamos muchas cosas procesa el trabajo que tienes y sigue el proceso de migracion correcto desde desarrollo hasta main con estos cambios y condiciones, no debes tocar ni afectar otros temas adicionales debe ser un commit exclusivo para este cambio»*. Tres cosas ampara y una no ampara: ampara el cambio del botón, ampara el viaje `desarrollo → develop → main` de **este** frente y ampara que el enlace guardado apunte a QA mientras él decide el valor de Producción; **no** ampara tocar ningún otro frente, y por eso el commit es exclusivo y cada portón lleva su inventario cerrado.

### 14.1 Qué se cambió en el producto

El pie de la miniguía del acceso (`apps/web/components/system/AppInstallBand.tsx`) **dejó de ramificarse por dispositivo**: celular y computador reciben el mismo `<a>` con `href={url}`, `target="_blank"` y `rel="noopener noreferrer"`, con el rótulo `Abrir la app`. Lo que sigue bifurcando es el **cuerpo** del diálogo: en computador se mantiene el aviso de exclusividad (`role="note"`) y la dirección escrita en pantalla como respaldo a mano. Con eso desaparecen tres cosas del árbol:

- El estado `feedback` y el handler `copyLink()` (asíncrono, con `try/catch` del portapapeles).
- Las tres cadenas `copyLink` / `copied` / `copyBlocked` de `apps/web/lib/mobileAppInstall.ts`, y `desktopHint` reescrita para decir lo que ahora ocurre.
- Cualquier rastro de `navigator.clipboard` en la pantalla y en la librería.

El motivo no es de gustos: el portapapeles depende del permiso del navegador y de que la página esté en foco; un copiado fallido dejaba a la persona con una cadena a medias y con la sensación de que el botón no hizo nada. Abrir directo elimina el paso intermedio, y deja una señal objetiva que el arnés puede contar: **la ventana que el navegador crea**.

### 14.2 Mediciones de este corte

| Instrumento | Resultado |
|---|---|
| `node --test apps/web/test/mobile-app-install.test.mjs` (desde `apps/web`) | **19/19** |
| `npm run certify:app-install:local` (navegador real, `next start`, artefacto de producción) | **137/137**, `BUILD_ID f_4CN15EWmM1zT94jWSHT`, `head c897242041`, en `docs/qa/evidence/app-install-abrir-directo-20261126/certification.json` |
| Control de mutación del mismo arnés (devolver el botón de copiar y cambiar el rótulo) | **118/137 · 19 rojos**, en `docs/qa/evidence/app-install-control-mutacion-20261126/`, con la fuente restaurada verificada byte a byte |
| `node --test apps/api/test/admin-platform-mobile-app-url.test.js` | **11/11** |
| `node scripts/certifications/mobile-app-url-admin-local.js --web` | **28/28** (dos controles de mutación incluidos), en `docs/qa/evidence/app-install-abrir-directo-20261126/url-admin-local.json` |
| Suite completa de web: `node --test test/*.mjs test/*.js` (desde `apps/web`) | **924 pruebas · 910 pasan · 14 rojas**, TAP completo en `.tmp/suite-web.txt` (no se comitea: es scratch del puesto) |

Los números que de verdad describen el comportamiento, no solo el verde: pulsar **Abrir la app** crea **exactamente una** ventana nueva (`creadas: 1`) cuyo destino empieza por la URL de la app (`destinos: ["https://appapexos-production.up.railway.app/"]`), la guía contiene **un** enlace y **cero** botones de acción, y el acceso sigue en `/login` sin token y con **cero** intentos de login —es decir, el botón no envió el formulario—.

Los **14 rojos de la suite se atribuyen, no se declaran ajenos de memoria** (TAP leído con nombre y razón):

- **9** son archivos `test/certify-*-local.mjs` que abren navegador contra `http://127.0.0.1:3001/login` y mueren con `net::ERR_CONNECTION_REFUSED`: piden un servidor de desarrollo que en esta estación no está levantado. Es ambiente, no producto.
- **5** son aserciones de fuente en otros frentes: `accounting-pyg-interactive.test.mjs` (exige `/api/v1/accounting/organization-tree` en el editor de presupuesto), `command-palette-module-functions.test.mjs` (la ruta `/dashboard/contabilidad/pyg/ampliado` no está en el centro de comandos), `hr-offline-marking.test.mjs` (el patrón de `shouldBlockHrWriteFallback` cambió), `transport-master-access.test.mjs` y `transport-vehicle-master-catalogs.test.mjs` (buscan `access.canReadHr ? api<Employee[]>` y el `api<OrgTree>("/api/v1/transport/vehicle-accounting-structure")` en un archivo que hoy trae otro contenido).
- Los cinco archivos leyeron el árbol y **ninguno** menciona `mobileAppInstall`, `AppInstallBand` ni `mobile-app` (contado con `grep -c` sobre cada archivo: `0` en los cinco). `mobile-app-install.test.mjs` sí pasó entero: **19/19**.

Del directorio de este corte se comitean **cinco** capturas (la guía en celular y en computador, más las tres de la ventana de Administracion) y los tres JSON; el resto de los PNG que produce el arnés (bandas, tema oscuro, tablero) y el `next-start.log` quedan **fuera del árbol** por el corte de disco declarado en `docs/briefs/2026-11-18-sobreuso-disco-costos-plan-choque.md`: la autoridad es el JSON, que guarda las medidas (anchos, conteo de enlaces, `creadas`, `destinos`, `espera_enlace_ms`) y no necesita la foto para poder fallar. El control de mutación se comitea solo con su JSON por la misma razón: sus 19 rojos están nombrados ahí.

### 14.3 Dos errores propios de este tramo, declarados aquí

1. **Falso rojo del instrumento, no del producto.** La primera corrida de `mobile-app-url-admin-local.js --web` cerró **25/26** acusando a la pantalla de mostrar `ambiente "-"`. `-` es lo que pinta `apps/web/app/dashboard/administracion/page.tsx:2919` **mientras la lectura no ha llegado**, y el arnés muestreaba el diálogo en cuanto abría. No se aflojó el assert: se le añadió espera acotada (20 s, con la respuesta HTTP registrada en la evidencia —`espera_lectura_ms` y `lecturas_http`—), se archivó la corrida roja como `url-admin-local-muestreo-pronto.json` y se volvió a medir entero: **28/28**. La misma espera se instaló en los dos arneses de navegador de este frente, y en la corrida buena del acceso la espera quedó en **0 ms** en los cuatro escenarios, o sea que el producto responde antes de lo que el arnés mira.
2. **Le escribí encima la evidencia de un corte ya publicado.** `mobile-app-install-browser-local.js` toma su directorio de la variable `CERT_ARTIFACT` y su **default** es `app-install-acceso-20261125`, el corte de ayer. Correrlo sin la variable sobreescribió `certification.json` y siete PNG **commitados** de esa corrida. Se restauró el directorio contra `HEAD` (`git checkout -- docs/qa/evidence/app-install-acceso-20261125/`, ahora limpio y con su `BUILD_ID R-dJE_2uSjVBDXuUGfcyo`), y se le puso candado al instrumento: si ya existe un `certification.json` en el destino, **aborta** y manda a usar `CERT_ARTIFACT` o a declarar `--force`. La corrida de este corte se repitió después contra el mismo árbol con el arnés endurecido y quedó en su propio directorio.

### 14.4 Instrumento nuevo, versión 1 de la pata contra el ambiente

`scripts/certifications/mobile-app-install-qa.js` cierra el pendiente que la sección 13 dejó abierto: la pata de navegador contra el QA desplegado se había medido a mano. Corre contra el portal de QA (`apexos-web-qa-production.up.railway.app`), **aborta** si el origen pedido toca el project ref de Producción o si el host no es el de QA, exige la cuenta efímera sembrada por `mobile-app-url-admin-qa.js --seed-only` (la clave nunca va por línea de comandos), y se niega a escribir fuera de `docs/qa/evidence/` ni a pisar una evidencia existente. Su prueba dura: administra el enlace a un **marcador** propio (`https://apexos-api-qa-production.up.railway.app`), exige que la guía sirva ese marcador en celular y en computador, que el clic abra **una** ventana hacia él y, al final, devuelve el valor al quemado y lo verifica. Sin `--seed-only` previo no corre, y sin la compuerta del origen no toca la red.
