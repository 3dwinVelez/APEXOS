# App movil de APEXOS y su acceso desde la pantalla de ingreso

## Que es cada cosa

Hay dos aplicaciones web distintas y no conviene mezclarlas:

| | Portal de APEXOS | App movil |
|---|---|---|
| Repositorio | este (`APEXOS`) | `AppApexos`, aparte |
| Direccion | `app.apexos.com.co` y sus ambientes | `appapexos-production.up.railway.app` |
| Tecnologia | Next.js, PWA con `sw.js` y `manifest.ts` | Vite PWA, titulo "APEXOS Web Móvil" |
| Para que sirve | operacion completa: modulos, reportes, administracion | marcar jornada y registrar actividades desde el celular |
| Dispositivos | cualquier pantalla | solo celulares |

La app movil **no vive en este repositorio**. Este documento describe como se llega a ella desde la pantalla de acceso; su comportamiento y su restriccion de dispositivo los define `AppApexos`.

## La restriccion de dispositivo

La app esta configurada con `allowDesktop: false` y orientacion vertical. Si se abre desde un computador, el propio servicio lo rechaza y muestra en pantalla que es exclusiva para celulares; ademas, en escritorio no ofrece la opcion de instalar.

Esto obliga a dos cosas en el portal:

1. Nunca enviar a una persona desde un computador directo a la app, porque llega a un callejon donde no puede instalar nada.
2. Explicar antes como se instala, porque la instalacion no pasa por tiendas: se hace desde Chrome del celular.

## Como se entra a la app desde el portal

La oferta vive en la **pantalla de acceso** (`apps/web/app/login/page.tsx`), debajo del formulario y en la misma columna fija del panel: es la pantalla con la que un usuario de celular ya se cruza, y no hay que tener sesion ni empresa habilitada para verla. El tablero (`apps/web/app/dashboard/page.tsx`) **no** ofrece la descarga: ahi ya se esta dentro, y quien necesita instalar la app es quien aun no entra.

> Orden del dueno, 2026-11-25: «va en el inicio de sesion, no cuando se inicia sesion». El montaje del lobby se retiro y la banda se movio a `apps/web/components/system/AppInstallBand.tsx`.

La banda **APEXOS Web Móvil** muestra el boton **Descarga nuestra app**. El boton no es un enlace ni un envio del formulario: es `type="button"` y abre la mini-guia, y la guia decide segun el aparato.

La guia muestra siempre los cuatro pasos reales de la instalacion:

1. Abre el enlace en Chrome.
2. Toca los tres puntos.
3. Elige «Instalar app» (en algunos equipos dice «Añadir a pantalla principal» o «Crear acceso directo»).
4. Confirma y crea el acceso directo.

Despues, el pie del dialogo cambia:

- **En celular**: boton **Abrir la app**, que es un enlace directo al servicio con `target="_blank"` y `rel="noopener noreferrer"`. Cierra con la advertencia de que al abrirla se entra con el mismo correo y la misma contraseña.
- **En computador**: un aviso visible de que la app es exclusiva para celulares, el boton **Copiar enlace** para llevárselo al celular por WhatsApp o correo, y el enlace escrito en pantalla para seleccionarlo a mano si el navegador no permite copiar. No hay ningun enlace a la app en este caso.

Todo el texto vive en `apps/web/lib/mobileAppInstall.ts` (`APP_INSTALL_LABELS` e `INSTALL_STEPS`). La pantalla no escribe cadenas propias: si alguien cambia un paso alli, la prueba de contrato y la certificacion lo exigen.

## Como se sabe si es un celular

`isHandheldDevice` mira el agente del navegador y los puntos de contacto, nunca el ancho de la ventana:

- coincide con la firma habitual de Android, iPhone, iPad, iPod, Windows Phone o navegadores moviles, o
- es `MacIntel` con mas de un punto de contacto, que es como se delata un iPad moderno cuando se hace pasar por escritorio.

El ancho de pantalla no sirve porque una ventana de escritorio angosta fingiria celular, y `pointer: coarse` tampoco porque algunos portatiles con pantalla tactil lo reportan.

## Direccion de la app: se administra por ambiente

El enlace que ofrece el boton **ya no esta quemado en el artefacto**. Cada despliegue guarda el suyo en la tabla `platform_settings` (clave `mobile_app.url`) y lo sirve antes del login:

- **Lectura publica**: `GET /api/v1/public/platform/mobile-app`. No necesita sesion -el acceso es previo-, responde solo `{ url }`, lleva `cache-control: no-store` y esta limitada a 60 peticiones por minuto. Se cachea 20 segundos en el proceso del API para que abrir el acceso no pague un viaje a la base cada vez.
- **Escritura administrada**: `GET` y `PUT /api/v1/admin/platform/mobile-app` dentro de **Administracion APEX - Configurar - Sistema - App movil**. Detras de `authenticate` y de la capacidad `platform_settings` (leer: `configuracion` con access/view/configure/administer; escribir: configure/administer).
- **Quien puede cambiarlo**: la escritura la bloquea `requirePlatformAdmin`: solo `APEX_ADMIN` o un rol con `role_type: superadmin`. Un administrador de empresa ve el valor pero no puede moverlo, porque el enlace es publico y se le muestra a **todas** las empresas del ambiente; el rol grueso (`admin_empresa`, `admin:write`) no alcanza.
- **Que se valida**: `https` con dominio completo, sin usuario/clave, sin `#`, menos de 300 caracteres y sin barra final. Cada rechazo devuelve un nombre propio (`URL_APP_MOVIL_NO_HTTPS`, `URL_APP_MOVIL_CON_CREDENCIALES`, etc.) para que la pantalla lo pueda decir sin traducir un 400. La pantalla es mas dura que el API: ella solo deja escribir `https`. El API admite ademas `http` en `localhost`, `127.0.0.1` o `[::1]` para que un puesto de trabajo pueda enlazar su propia app durante una certificacion -ese valor no se puede tipear desde Administracion, y por eso no puede colarse en un ambiente real por accidente.
- **Quien lo cambio**: la columna `updated_by` guarda el **correo**, no el id. El token no viaja con el correo (las claims son `id`, `tenant_id`, `role`), asi que el servicio lee la cuenta al guardar; si no puede leerla, degrada al id: se pierde la autoria visible pero no el guardado. Cada cambio escribe ademas su `AuditLog` con el valor anterior y el nuevo.
- **Respaldo**: si la base no tiene fila, tiene un valor torcido o no responde, el acceso ofrece el destino quemado `https://appapexos-production.up.railway.app`. El boton nunca se queda sin destino, y un `http` administrado no reemplaza el respaldo.
- **Si la lectura falla**: la ventana avisa "No se pudo leer el enlace de la app" y deja el campo vacio; no pinta un destino a medias ni deja guardar sobre un valor que no se alcanzo a ver.
- **Boton «Restaurar»**: escribe el destino quemado y la respuesta se marca `restaurada: true`, para que quede dicho en voz alta que se volvio al valor por defecto.

Para el dueno, la consecuencia practica es la que pidio el 2026-11-25: **guardar en un ambiente no cambia el otro**. La ventana muestra el ambiente que respondio (`produccion`, `qa`, `pruebas` o `local`), declarado por el servidor y no por el navegador, y lo mismo repite en el aviso de alcance: para mover el enlace de Produccion hay que entrar a Produccion.

`NEXT_PUBLIC_MOBILE_APP_URL` sigue existiendo como respaldo por build (sirve cuando la API no contesta y en pruebas locales), pero dejo de ser la duena del destino: el valor administrado manda.

## Respaldo por build: `mobileAppUrl()` y su variable

`mobileAppUrl()` devuelve el valor de `NEXT_PUBLIC_MOBILE_APP_URL` cuando existe y es una URL `https` valida; si no, usa la quemada `https://appapexos-production.up.railway.app`. Es el **piso**, no la dueña del destino: el valor administrado en la base lo reemplaza cuando llega la lectura (ver seccion anterior).

No hace falta configurar ninguna variable en Railway para que el boton funcione. La variable sirve para dos casos concretos: probar el portal en un puesto local y sostener el acceso si la API no contesta. Como se define en el build, queda quemada en el artefacto; cambiarla exige reconstruir, y por eso el enlace que ve el usuario se administra en la base y no ahi.

## Lo que esta certificado y con que instrumento

| Instrumento | Que afirma |
|---|---|
| `apps/web/test/mobile-app-install.test.mjs` | contrato de la libreria y de las dos pantallas: clasificacion de dispositivos con agentes reales, copy sin deformar, un solo montaje en el acceso y despues del `</form>`, **cero** montajes en el tablero, layout apilado sin breakpoints de ventana, enlace con `rel` seguro, ausencia de enlace en escritorio |
| `npm run certify:app-install:local` | navegador real con el artefacto de produccion: banda visible **sin sesion** en el acceso, boton que no envia el formulario, guia abierta por el boton, cuatro pasos, enlace exacto en celular, aviso y copiado en computador, tema claro y oscuro, el tablero con modulos servidos **sin banda ni enlace** a la app, y que el destino de la URL responde y es la app movil |
| `apps/api/test/admin-platform-mobile-app-url.test.js` | contrato del servicio y de las dos rutas: la lectura publica no hereda el `authenticate` ni el tenant, la escritura exige capacidad y superadminico, los cinco rechazos con nombre propio, la autoria que sale del correo de la cuenta aunque el token no lo traiga, y el respaldo cuando el valor guardado no sirve |
| `node scripts/certifications/mobile-app-url-admin-local.js --web` | veintiocho chequeos sobre una base efimera local con el artefacto de produccion servido: la migracion aplicada dos veces con el mismo DDL, la matriz 401/401/403/200, el guardado que se ve en el acceso sin esperar el TTL de la cache, el respaldo cuando la fila se tuerce, y la ventana de Administracion con sesion real mostrando el ambiente que respondio, el autor con su correo y el aviso de alcance. Deja tres capturas al lado del JSON |
| `node scripts/certifications/mobile-app-url-admin-qa.js` | diecisiete controles contra el **ambiente desplegado**, no contra el puesto: que el `/health` del API de QA sirve el commit promocionado, que la tabla existe en la base que lee ese API (seis columnas), que el servidor declara `qa` por si solo -sin bandera del arnes-, la matriz 401/401/403/200, los cinco rechazos con nombre propio sin escribir una fila, que guardar se ve en la lectura publica en 80 ms, que la autoria es el correo y que el cambio dejo `AuditLog` con valor anterior y nuevo. Siembra dos cuentas efimeras y las retira por el endpoint (`--seed-only` deja una viva para la pata de navegador y `--retire` la cierra). Aborta si el env-file no declara `TARGET_ENV=qa`, si alguna URL toca el project ref de Produccion o si el host de API no es el de QA |

La corrida contra el ambiente queda en `docs/qa/evidence/url-app-admin-develop-20261125/`: `qa-remoto.json` (17/17, cuenta retirada y login bloqueado despues), `qa-navegador.json` y `qa-navegador-sonda.json` (la ventana de Administracion leida del DOM del QA desplegado: `AMBIENTE QUE RESPONDIÓ: qa`, el autor con su correo, el guardado que cambia el destino que copia la guia del acceso y el boton «Volver al destino por defecto» que desaparece cuando ya estas en el defecto), y `qa-cierre.json` (enlace devuelto al quemado en 202 ms y **cero** cuentas de prueba activas). La sonda de navegador es corrida manual: lo repetible y versionado es el instrumento de API.

La corrida local del enlace administrable queda en `docs/qa/evidence/url-app-administrable-20261125/` (`local-certification.json` con `build_id` y `head` anclados, `ventana-admin-antes.png`, `ventana-admin-despues.png`, `acceso-celular-enlace-administrado.png`). El instrumento **no** tiene alias en `package.json` todavia: se invoca con la linea de arriba, porque ese archivo trae cambios de otros frentes sin commitear y este corte no los mezcla.

La evidencia de la montura actual queda en `docs/qa/evidence/app-install-acceso-20261125/`. La corrida anterior, con la banda dentro del tablero, queda en `docs/qa/evidence/app-install-lobby-20261124/` como registro de lo que se retiro.

El copiado se mide por las dos vias: con el portapapeles del navegador (en un entorno sin portapapeles el portal reporta honestamente que no pudo copiar y muestra el enlace) y con un portapapeles grabador que afirma que la cadena copiada es exactamente la URL de la app.

## Pendientes que dependen del dueno

- La instancia enlazada hoy (`appapexos-production`) esta declarada con `environment: QA` en su propia configuracion. Desde este corte la pregunta dejo de ser de codigo o de build: es una decision de valor por ambiente que se toma escribiendo en Administracion APEX del ambiente que corresponde. **En QA no hay que aplicar nada: el servicio de API de QA corre `prisma migrate deploy` al arrancar, asi que la promocion a `develop` ya se llevo la migracion `20261125183000_platform_settings` (medido en el ledger: fila `44644a58-9776-4c83-b4bf-6f7a6292160b`, terminada 2026-11-25T22:28:25Z, `applied_steps_count = 1`, checksum `34031aeb...` igual al archivo).** En **Produccion** sigue pendiente y exige autorizacion expresa del dueno: sin esa tabla el acceso responde el respaldo quemado y la ventana de administracion avisa que la configuracion no esta instalada (503 con el nombre de la migracion), no se hace el despistado. Residuo declarado de la corrida en QA: queda **una** fila `mobile_app.url` con el destino quemado (la borro el guardado de la casa, que bloquea el borrado fisico de `PlatformSetting`), asi que la ventana dira «administrado en este ambiente» en vez de «respaldo» aunque el enlace que ve el usuario sea el mismo.
- La promocion `desarrollo -> develop` de este frente esta hecha y medida: `origin/develop` corre `2943da63f623f4c86834ffa6355957f1e75e4190` con el enlace administrable, publicada con su manifiesto de alcance (`docs/qa/manifests/url-app-admin-develop-20261125-scope.json`) y su pre-QA (`docs/qa/manifests/url-app-admin-develop-20261125-preqa.json`); el QA del API sirve ese commit segun su propio `/health` y el web de QA construye `develop`. Antes de ese frente, `develop` ya traia la banda en el acceso (`a2191e0d`, manifiestos `banda-acceso-develop-20261125-*`). Produccion (`main`, en `e3c2ad17`) no tiene la banda ni el enlace administrable y no se toca en esta intervencion.
- El QA desplegado ya esta corroborado con instrumento: **17/17** controles de API contra el ambiente (`docs/qa/evidence/url-app-admin-develop-20261125/qa-remoto.json`) y la ventana de Administracion leida del navegador en el mismo ambiente, donde el servidor se declara `qa` sin que lo fuerce ningun arnés. Queda pendiente, con dueno: **que valor quiere el dueno para cada ambiente** (hoy QA apunta al destino quemado, que se autodeclara QA) y, si se decide otro, escribirlo desde Administracion APEX de ese ambiente. Tambien queda, con `apexos-qa`: la pata de navegador contra el ambiente se midio a mano -una sonda versionada, no un arnés-, y el corte de disco sigue sin permitir capturas PNG en ramas de promocion.
