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

## 15. Cuenta del portón a `develop` (2026-11-26)

**Qué subió.** El candidato `9824d04f` nace sobre la punta viva de `origin/develop` (`5d46c497`) y lleva **27 rutas**: 3 de producto/prueba (`AppInstallBand.tsx`, `mobileAppInstall.ts`, `mobile-app-install.test.mjs`), 4 instrumentos, 2 documentos, 14 de evidencia y manifiestos del portón, 4 de canon del equipo (`agents/registry.json`, `agents/CHANGELOG.md` y los dos `SKILL.md` de `apexos-qa`). Cero borrados, cero `origin_waivers`. El transporte es **puntual liso**: cada ruta del diff es, blob por blob, la que vive en `origin/desarrollo`, y el antepasado común declarado (`d667276f`) es el punto real de divergencia.

**El candado se cayó primero por mi propio orden, no por el producto.** La primera corrida del portón devolvió `ALCANCE DE PROMOCION INVALIDO: el transporte puntual promete rutas que no son el blob de origin/desarrollo` con **10 rutas** —ocho de evidencia y los dos manifiestos—. El validador compara **todas** las rutas del diff neto contra el origen, y la evidencia del portón vivía solo en el worktree. Se resolvió publicando esas rutas en `desarrollo` (`63d33638`, ya empujado) y trayéndolas de vuelta al candidato; eso es lo que versiona la regla 142 de `apexos-qa` 2.131.0.

**Compuertas, todas sobre el árbol del candidato y no sobre el de origen.** Contrato del API **11/11** · contrato web **19/19** · `node --check` de los cuatro instrumentos **4/4** · los dos rechazos exigidos del arnés de ambiente **2/2** (sin `--fixture` y con `--origin` de Producción, ambos abortan antes de tocar la red) · `prisma validate` verde con el modelo `PlatformSetting` completo · invariantes del replay **17/17 carry** con el control de mutación del instrumento en **3/3 derivas vistas en rojo** · `qa:promotion:scope` → `ALCANCE DE PROMOCION VALIDO (27 rutas, transporte puntual)` · `qa:preqa:evidence` → `AUTORIZACION PRE-QA VALIDA` · `git-governance-guard promote desarrollo-to-develop` en **0**, con su control de contraste: sin `APEXOS_PROMOTION_AUTH` devuelve **1** y nombra la bandera que falta.

**Puntas y respaldo.** `git push --dry-run` mostró `5d46c497..9824d04f` (avance rápido, sin el signo más) y el empuje real dejó `origin/develop = 9824d04f`. El respaldo `backup/predirect-develop-boton-20261126` apunta a `5d46c497` y está versionado en `origin`, así que revertir es mover la rama a ese commit y no reconstruir un árbol.

**Dos cuentas de arnés que salieron del portón.** (1) El driver `suites-candidato.js` devolvía solo el conteo de pruebas, así que la verificación de `prisma validate` buscaba el literal `is valid` en la cadena `"undefined"`: ahora guarda el `stdout` y exige además que el modelo `PlatformSetting` aparezca completo con su `@@map`. (2) En un worktree sin `.env` propio, `prisma validate` respondía **P1012** por no existir `DATABASE_URL`; se le pasa una cadena **inventada** (`postgresql://validar:sinconexion@127.0.0.1:55432/validar_schema`) porque el rojo era de ambiente y no de esquema —el worktree no tiene `node_modules` ni enlaces, resuelto con `NODE_PATH` hacia el árbol principal para no repetir la caída del 2026-11-20—.

**Lo que NO se hizo en este tramo:** cero escritura en `main` y cero toque de su base, cero `force push`, cero rama nueva (el candidato vive en `HEAD` despegado dentro de `.tmp/wt-dev-boton-20261126`), cero variable de entorno en Railway, cero `git worktree remove`, cero promoción del canon a las ramas. Las cuatro rutas que quedaron en `desarrollo` por fuera del inventario (`package.json`, `next-env.d.ts`, `tsconfig.json` y el frentes HR ajenos) siguen intactas y sin stage.

**Lo que quedó medido después del empuje.** El `/health` del API de QA sigue en `5d46c49729c0` y eso **no** es un frente sin desplegar: el portón llevó **cero rutas de `apps/api`** (las 27 son web, documentos, evidencia y canon), así que el binario del API promocionado es el mismo y su lectura pública del enlace responde **200**. La pata que sí cambió es el portal, y ahí el despliegue ya corrió. Como referencia del estado real de Producción antes del viaje a `main`: `apexos-api-prod-production.up.railway.app/health` sirve `e3c2ad171946` y `/api/v1/public/platform/mobile-app` responde **404** —la función no está en Producción todavía—.

## 16. Corroboración en el QA desplegado (2026-11-26, después del portón)

**Cómo se supo que el portal ya servía el botón, sin preguntar.** El portal de QA no expone su commit, así que la identidad del artefacto se verificó **por contenido servido**: se descargaron los **10** chunks que `/login` referencia y se contaron las señales —`Abrir la app` aparece **2** veces, `Copiar enlace` **0**, `navigator.clipboard` **0**, y la URL quemada `appapexos-production` sigue presente como respaldo—. Con el árbol viejo esas dos últimas contaban **una** y **varias**; con el nuevo cuentan **cero**. Eso es una sonda de artefacto, no una suposición: la etiqueta que se retiró es la prueba de que el bundle servido es el de `9824d04f`.

**Las tres corridas, en `docs/qa/evidence/boton-abre-directo-qa-20261126/`.**
- `siembra.json`: cuenta efímera superadmin sembrada y viva (`qa.plat.web.202611261728@apexos.invalid`, rol `APEX_ADMIN`), y el servidor **se declaró solo** en `qa` al leer la administración —sin bandera del arnés—, con la credencial guardada en el fixture de `.tmp` y nunca en la línea de comandos.
- `qa-navegador.json`: **14/14, 0 rojos** contra el portal servido. Afirmado con el marcador administrado: antes de pulsar no hay guía; en celular **un solo enlace directo** hacia el marcador; la ventana abre en pestaña nueva sin exponer la ventana (`noopener`); la guía **no ofrece copiar**; en computador también está el botón directo, conserva el aviso de exclusividad y deja el enlace escrito como respaldo; pulsar crea **una** ventana hacia la URL; **no quedó ninguna ventanilla nativa**; y restaurar devuelve el destino quemado.
- `qa-cierre.json`: **6** notas de limpieza —restauración por el endpoint en **HTTP 200**, acceso público de vuelta al quemado en **194 ms**, la cuenta retirada con **login bloqueado en 401 después** y **0** cuentas de prueba activas—. El residuo declarado sigue siendo el mismo que el corte anterior: queda **una** fila `mobile_app.url` con el destino quemado porque el guardado de la casa bloquea el borrado físico de `PlatformSetting`, así que la ventana dira «administrado en este ambiente» aunque el enlace que ve el usuario sea el mismo.

**Dueño de lo que falta.** El **valor** del enlace en cada ambiente es del dueño: QA apunta hoy al destino quemado (que se autodeclara QA) y Producción no tiene la función ni la tabla. Aplicar la migración `20261125183000_platform_settings` en la base de Producción **no** está autorizado en esta intervención y exige orden expresa.

## 17. El viaje a `main` (2026-11-26, después del QA desplegado)

**La orden del dueño que autoriza este tramo.** «extiende el cambio del boton de manera controlada y cerrada al ambiente main aunque la url pertenezca a qa lo importante en este caso es migrar la funcion y el boton de manera correcta ya la url me encargo yo de actualizarla […] sigue el proceso de migracion correcto desde desarrollo hasta main con estos cambios y condiciones, no debes tocar ni afectar otros temas adicionales debe ser un commit exclusivo para este cambio».

**Por qué a main no puede subir un solo blob.** `origin/main` estaba en `e3c2ad17`, a cientos de commits de `desarrollo`, y tres rutas del frente son compartidas: `apps/api/prisma/schema.prisma`, `apps/api/src/middleware/rbac.js` y `apps/api/src/modules/admin/public-routes.js`. Llevar el blob de desarrollo habría hecho dos daños a la vez: borrar contenido propio de main y traer de contrabando lo que main nunca recibió (`device_id` de la telemetría, el código de módulo `apex-control` y 417 líneas de modelos ajenos). Se promocionó **por replay de rutas con hunks fusionados**: 45 rutas en el inventario, **42** byte a byte con `origin/desarrollo` y **3** con la excepción de origen nombrada archivo por archivo. El `git apply -3` del schema arrastraba la cola ajena de desarrollo, así que el modelo `PlatformSetting` se anexó a mano sobre el archivo de main.

**Lo que se midió, no lo que se narró.**
- Par ANTES/DESPUES con el mismo instrumento sobre el árbol: en `origin/main` puro **20** pruebas de API y **21** de web, cero rojas; en el candidato **31** y **40**, cero rojas. Sintácticos **4/4** y `prisma validate` con el literal `is valid`.
- Las tres rutas fusionadas, afirmadas línea por línea: **cero** líneas de main perdidas y **toda** línea nueva pertenece al parche de `d667276f` (`suites-despues.json`).
- `promotion-migration-check`: **31/31** invariantes válidas (carry, cero ediciones, cero borrados) y su control de mutación con **3** derivas medidas.
- Portón de alcance: **APROBADO** con 45 rutas; con `origin_waivers: []` el mismo portón responde **INVALIDO** nombrando las tres rutas. Aprobación QA: **VÁLIDA**; alterarle el ambiente o un check la bloquea. Gobernanza: **BLOQUEADO** sin `APEXOS_PROMOTION_AUTH`, salida **0** con la bandera.
- Respaldo `backup/premain-boton-20261126 = e3c2ad17`, `--dry-run` mostró `e3c2ad17..0ec1cff0` (fast-forward, cero fuerza) y el empuje quedó confirmado con `git ls-remote`.

**La base de Producción, contada antes de empujar.** El servicio de API tiene pre-deploy `npx prisma migrate deploy`, así que un despliegue escribe DDL. Se leyó el ledger en **solo lectura**: **72** filas, **71** terminadas y **una** sola sin finalizar (`20260814003500_sales_invoicing_cxc`, ajenos a este frente). El árbol del candidato trae **72** migraciones y la única pendiente en Producción es la propia, `20261125183000_platform_settings`: **cero** deuda ajena puede colarse. Este portón no ejecutó ninguna sentencia contra la base de Producción.

**Puntas después del empuje.** `origin/main = 0ec1cff0`, `origin/develop = 9824d04f`, `origin/desarrollo = 6196d18e` (los manifiestos declaran el árbol `0dd67a5b`; el commit plegado añade solo documentación, cero rutas de producto). Ningún archivo de `agents/**` viajó a main: el canon sigue su propia contabilidad, como en los portones previos de esta rama, y `docs/DATABASE_CONVENTIONS.md` se quedó fuera porque entre main y desarrollo hay 126 líneas de otros frentes.

### 17.1 El ambiente después del empuje: promovido no es desplegado, y se midió con sonda propia

El empuje a `main` **no disparó ningún despliegue**. Medido el 2026-11-26T18:02Z con `scripts` versionados en el directorio de evidencia (`sonda-produccion-post-push.js`, salidas `post-push-produccion-railway.json` y `post-push-produccion-dominio.json`) y con `railway deployment list` en solo lectura:

| Qué se leyó | Valor |
|---|---|
| `GET /health` del API de Producción | `commit: e3c2ad171946` — sigue en el punto de partida |
| `GET /api/v1/public/platform/mobile-app` | **404** (la ruta todavía no corre ahí) |
| Chunks que `/login` referencia en el portal de Producción | **10**; `Abrir la app` **0**, `Copiar enlace` **0**, `navigator.clipboard` **0**, banda en el HTML **0** |
| Último despliegue del proyecto `APEXOS PROD` | `bfc039e6` (API) y `4554ca61` (web), ambos **2026-11-24T21:50:44Z**, `meta.branch = main`, `meta.commitHash = e3c2ad17…` |
| Despliegues nuevos tras el empuje | **0** |

Dos precisiones que el informe debe dejar separadas. **(1)** El árbol promocionado ya contiene el frente completo (banda, enlace administrable, botón directo y migración), pero **el ambiente serve el binario anterior**: mientras nadie despliegue, el acceso de Producción no muestra la banda y la ventana de Administración no existe ahí. **(2)** Desplegar Producción no es una acción neutra de infraestructura: el pre-deploy del API corre `npx prisma migrate deploy`, así que desplegar **es también migrar la base de Producción**, y eso exige orden expresa del dueño según `AGENTS.md`. La cuenta del ledger citada arriba es la que acota el riesgo de ese paso (la única migración pendiente del árbol es la propia; `20260814003500_sales_invoicing_cxc` es una fila **sin finalizar** que ya estaba ahí, no una migración que este frente vaya a aplicar).

**Error propio, declarado.** Al cerrar la contabilidad corrí `mide-ledger-produccion.js` desde el árbol de `desarrollo` en vez del candidato: el mismo script devolvió **6** pendientes y un veredicto de «atención» que es cierto sobre `desarrollo` y falso sobre lo que se promocionó a `main`. La corrida buena (`head_medido 39a54b76`, `deuda_ajena_del_arbol: []`) quedó restaurada contra `HEAD` y la regla se versionó en `apexos-qa` 2.133.0: todo censo de ledger guarda el `HEAD` del árbol que leyó. Lo que queda por verificar después del despliegue está listado en `porton-main.json` → `despues_del_empuje.lo_que_hay_que_verificar_despues` (salud con `0ec1cff0`, lectura pública **200** con el quemado, censo de chunks con el botón presente y la fila `platform_settings` pasada a terminada con `applied_steps_count = 1`).

**(4) Cuarto error propio, y del mismo tipo que el del 2026-11-24 en QA: cité un host que no existe.** `docs/project/app-movil.md` afirmaba que el portal de Producción vive en `app.apexos.com.co`. Consultado por DNS sobre HTTPS en **dos resolvedores públicos** (Google y Cloudflare), ese nombre devuelve **NXDOMAIN**: nunca existió. Lo que sí existe, medido después: **`www.apexos.com.co`** → CNAME a `n98svybe.up.railway.app` (153.52.255.25), sirve el portal con **200** y **18.569** bytes, el mismo artefacto del host de Railway; la raíz `apexos.com.co` está **aparcada en GoDaddy** (3.33.130.190 / 15.197.148.33, NS `ns59/ns60.domaincontrol.com`, serial `2026112401`); y `api.apexos.com.co` tampoco resuelve, o sea que **la API de Producción no tiene dominio propio** y el portal le habla al host de Railway. Consecuencia práctica: la primera corrida de la sonda se hizo contra el host de Railway porque el nombre del documento fallaba el TLS desde el puesto (el tráfico de esta máquina sale por un proxy que no puede con ese dominio, y Chrome respondió `ERR_NAME_NOT_RESOLVED`) —un fallo de **este puesto**, no de Producción, y por eso no lo reporté como caída—. Re-corrida contra `www.apexos.com.co`, el resultado es el mismo: **0** de **10** chunks con `Abrir la app`. La regla queda versionada en `apexos-qa` 2.134.0: antes de escribir una dirección en un documento, se resuelve por un resolver público y se cita la respuesta; si un host falla desde el puesto, se distingue «no resuelve en ningún lado» de «no resuelve aquí» antes de afirmar nada del ambiente.

### 17.2 El despliegue: servido el candidato, y la base no la trajo el despliegue (2026-11-26, 18:21Z–18:37Z)

El dueño autorizó el paso con la consecuencia escrita delante («Sí, desplegar API + portal»). Se dispararon los dos servicios con `railway redeploy … --from-source` a las **18:21:24Z** (API) y **18:21:44Z** (portal), y los dos quedaron en **SUCCESS** sobre `0ec1cff04c1b` (`2c69066b-d9de…` el API, `ce9e5ed7-61b9…` el portal; los viejos de `e3c2ad17` pasaron a **REMOVED**). Lo que sirve Producción ahora, medido con los mismos instrumentos versionados:

| Qué | ANTES (18:02Z) | DESPUÉS (18:26Z–18:37Z) |
|---|---|---|
| `GET /health` del API | `e3c2ad171946` | **`0ec1cff04c1b`**, 19 módulos |
| `GET /api/v1/public/platform/mobile-app` | **404** | **200** con `{"url":"https://appapexos-production.up.railway.app"}` |
| Chunks del `/login` con `Abrir la app` | **0** de 10 | **2** (en `16blt3te1f70c.js`, 29.380 bytes) |
| `Copiar enlace` / `navigator.clipboard` | 0 / 0 | **0 / 0** |
| Banda en el HTML del acceso | 0 | **2** |
| Bytes del HTML | 18.569 | 19.960 |
| Host de Railway vs `www.apexos.com.co` | idénticos | **idénticos** (mismo censo, mismo chunk) |
| Ledger de Producción | 72 filas / 71 terminadas / pendiente la propia | **73 / 72 / ninguna**, `applied_steps_count = 1` |

**El hallazgo que cambia el cierre: el pre-deploy no corrió.** A las 18:26:30Z, ya con el binario nuevo servido, el ledger seguía sin la fila `20261125183000_platform_settings`, `GET rest/v1/platform_settings` respondía **404 PGRST205** (la tabla no existe) y los logs del API de Producción tenían **tres** `prisma:error Invalid prisma.platformSetting.findUnique()` (18:24:35Z, 18:26:16Z, 18:26:21Z). Es decir: la frase que este brief venía repitiendo desde el 2026-11-25 —«el pre-deploy del API corre `npx prisma migrate deploy`»— estaba leída de la documentación y **no** del servicio: en QA sí se cumplió (la fila `44644a58-9776…` entró sola el 2026-11-25T22:28Z) y en Producción no. El degradado funcionó como se diseñó —la banda pinta el quemado y la escritura administrada respondería **503 `CONFIGURACION_PLATAFORMA_NO_INSTALADA`** (`apps/api/src/modules/admin/platform-config-service.js:106`)—, así que no hubo corte, pero **administrar el enlace en Producción era imposible**.

**Cómo se cerró la base, en el orden que exige `AGENTS.md`.** Primero lectura: `prisma migrate status` contra el pooler de Producción (`aws-1-sa-east-1.pooler.supabase.com:5432`, project ref `jzbwzmkidfthknsohhnr`) devolvió **72** migraciones encontradas y **una** pendiente, que es la propia —cero deuda ajena, coincidiendo con el censo por REST—. Con esa medida delante se corrió `prisma migrate deploy` desde el árbol del candidato a las **18:32:05Z**: `Applying migration 20261125183000_platform_settings` / `All migrations have been successfully applied.` Re-leído: `Database schema is up to date!`, la fila terminada con `applied_steps_count = 1`, y **cero** `prisma:error` nuevos en los logs después de la migración (tres GET a la ruta pública a las 18:36Z no producen ninguno). El `UPDATE` del checksum descrito abajo es la única escritura adicional: **una** fila, **una** columna, sin DDL y sin tocar datos de clientes.

**(5) Quinto error propio: corrí el instrumento por ruta relativa desde el árbol auxiliar y ejecuté la copia vieja del script.** Pasé `LEDGER_SALIDA` creyendo que la bandera la respetaba el script nuevo, pero invocado con ruta relativa desde `.tmp/wt-main-boton-20261126` se ejecutó la versión de `main` del archivo, que **no conoce** esa bandera: no escribió el artefacto nuevo y **sobrescribió** `ledger-produccion.json` dentro del worktree con el corte posterior. El árbol auxiliar quedó sucio con un contenido que no era el de `main`. Reparado restaurando **esa ruta** contra `HEAD` del propio worktree (`git -C … checkout HEAD -- docs/qa/evidence/…/ledger-produccion.json`), y el censo bueno quedó re-corrido con el script canónico por **ruta absoluta** y salida explícita (`ledger-despues-del-despliegue.json`, `head_medido 0ec1cff0`). Regla versionada en `apexos-qa`: un instrumento se invoca desde el árbol que tiene su última versión, o por ruta absoluta; y después de correrlo se lee **qué archivo escribió**, porque una bandera nueva ignorada en silencio escribe en otro lado.

**(6) Sexto error propio: el `deploy` desde este puesto anotó el checksum de los bytes CRLF, no el del blob.** `core.autocrlf=true` materializa `migration.sql` con `\r\n`, y Prisma le calcula el SHA-256 a lo que ve: Producción registró `670d97219a25…` mientras QA y el blob de git tienen `34031aeb5cf4…`. Contrastado en los dos árboles del puesto: el **principal** tenía el archivo en **LF** (`34031aeb…`, escrito en esta sesión y nunca re-checkouteado) y el **worktree del candidato** en **CRLF** (`670d9721…`) —`git worktree add` sí aplica `core.autocrlf`—, así que la trampa es del árbol recién materializado, no de cualquier árbol de la máquina. Es exactamente la condición que `apexos-db-nube` regla 12 documentó desde el 2026-11-08: un ledger con un checksum que no corresponde al archivo versionado convierte el próximo contraste en un falso fallo y empuja a «corregir» el ledger en vez del producto. Corregido con `corrige-checksum-produccion.js`, que saca el hash canónico de `git cat-file blob` (nunca del árbol de trabajo), aborta si el project ref no es el de Producción, aborta si la fila no vale exactamente el hash CRLF esperado, y re-lee por REST para afirmar. Resultado: `LEDGER DE PRODUCCION ALINEADO CON EL BLOB`.

**Pendiente declarado con dueño: los permisos PostgREST de la tabla nueva.** En Producción, `GET rest/v1/platform_settings` con la service role responde **403 42501** («`GRANT SELECT ON public.platform_settings TO service_role`»), mientras `platform_admins` y `employees` responden **200**; en QA la misma tabla sí es legible y muestra su fila. No es un fallo del producto: los únicos consumidores de `platform_settings` son Prisma y el rol dueño —en `apps/` la ruta aparece solo en `schema.prisma:4716`, `admin/routes.js:98` y `:102`, `platform-config-service.js:106`, sus tests y la migración; no existe lectura por PostgREST de esta tabla, así que no hay respaldo silencioso que pueda caer—. Lo que sí deja es ciego al censo por REST, y por eso la verificación de este corte se apoyó en `_prisma_migrations`, en `prisma migrate status` y en los logs del API. Añadir el `GRANT` a la migración ya aplicada crearía un DDL que el archivo no describe y obligaría a promoverlo otra vez: se declara, no se ejecuta.

**Cierre.** Promovido ≠ desplegado ≠ migrado: las tres cosas son estados distintos y cada uno se comprueba con instrumento. Hoy Producción está en las tres, y lo único que falta para que el enlace muestre lo que el dueño decida es que él lo escriba desde `www.apexos.com.co` → Administración APEX → Configurar → Sistema → App móvil.
