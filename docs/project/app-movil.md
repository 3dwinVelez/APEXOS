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

## Direccion de la app y variables

`mobileAppUrl()` devuelve el valor de `NEXT_PUBLIC_MOBILE_APP_URL` cuando existe y es una URL `https` valida; si no, usa la quemada `https://appapexos-production.up.railway.app`.

No hace falta configurar ninguna variable en Railway para que el boton funcione. La variable existe por si la direccion cambia de ambiente: se define en el build del portal y queda quemada en el artefacto, igual que el resto de URLs publicas del frontend.

## Lo que esta certificado y con que instrumento

| Instrumento | Que afirma |
|---|---|
| `apps/web/test/mobile-app-install.test.mjs` | contrato de la libreria y de las dos pantallas: clasificacion de dispositivos con agentes reales, copy sin deformar, un solo montaje en el acceso y despues del `</form>`, **cero** montajes en el tablero, layout apilado sin breakpoints de ventana, enlace con `rel` seguro, ausencia de enlace en escritorio |
| `npm run certify:app-install:local` | navegador real con el artefacto de produccion: banda visible **sin sesion** en el acceso, boton que no envia el formulario, guia abierta por el boton, cuatro pasos, enlace exacto en celular, aviso y copiado en computador, tema claro y oscuro, el tablero con modulos servidos **sin banda ni enlace** a la app, y que el destino de la URL responde y es la app movil |

La evidencia de la montura actual queda en `docs/qa/evidence/app-install-acceso-20261125/`. La corrida anterior, con la banda dentro del tablero, queda en `docs/qa/evidence/app-install-lobby-20261124/` como registro de lo que se retiro.

El copiado se mide por las dos vias: con el portapapeles del navegador (en un entorno sin portapapeles el portal reporta honestamente que no pudo copiar y muestra el enlace) y con un portapapeles grabador que afirma que la cadena copiada es exactamente la URL de la app.

## Pendientes que dependen del dueno

- La instancia enlazada hoy (`appapexos-production`) esta declarada con `environment: QA` en su propia configuracion. Antes de promocionar, conviene decidir si el boton debe apuntar a una instancia que lea datos de produccion; si se decide cambiarla, es una variable de build, no un cambio de codigo.
- La promocion `desarrollo -> develop` requiere su manifiesto de alcance y `npm run qa:preqa:evidence`. Produccion (`main`) no se toca en esta intervencion.
