# Validación — Lobby Design System V4 (fase piloto) — 2026-11-10

## Alcance aprobado

Fase piloto acotada al lobby del dashboard (`/dashboard`), con la imagen de referencia del lobby
corporativo oscuro con acentos turquesa como referencia obligatoria. El resto de la plataforma
queda sin intervenir hasta la aprobación explícita de la siguiente fase.

## Ronda 4 (ventanas emergentes de la barra)

- **La barra superior deja de usar desplegables.** «En línea», el idioma, «Herramientas», «Centro de
  comandos» y la campana abren ventanas emergentes con el mismo marco y tokens del Design System V4.
- **Marco único `ModalFrame` en tono `brand`.** Las ventanas adoptan fondo degradado profundo, línea
  turquesa superior, cabecera translúcida, icono de contexto, trampa de foco, cierre con `Escape` y
  restauración de foco. El alcance `.apex-window` redefine los tokens semánticos, así que el contenido
  heredado (`bg-surface`, `border-line`, `text-content-*`) se re-tematiza sin reescribir cada vista.
  `color-scheme: dark` dentro de la ventana mantiene oscuros los desplegables nativos.
- **Herramientas es un lanzador.** Trazabilidad, Equipo, Preferencias y Productividad dejan de ser
  `<details>` y pasan a tarjetas que abren su propia ventana mediante el evento
  `apex:open-workspace-tool` (`apps/web/lib/workspaceTools.ts`). Los motores siguen montados en el
  shell: la presencia en tiempo real, el registro de recorrido, la aplicación de preferencias al
  iniciar y la captura del prompt de instalación no se interrumpen al cerrar la ventana.
- **Conducta preservada.** El indicador de conexión sigue leyendo `navigator.onLine` y sus eventos;
  el centro de comandos conserva `Ctrl K`, el rol `combobox`/`listbox` y el foco; las notificaciones
  mantienen sus claves de almacenamiento y su contador de no leídas.

## Ronda 3 (frase de marca)

- **La frase memorable es el titular del hero.** «Creamos sistemas **a tu medida**.» sustituye a
  «Tu operación, más simple y bajo control.» como `h1`; el copy operativo queda como línea de apoyo.
- **Los dos CTA se retiraron** («Comenzar» / «Explorar módulos») junto con su destino (`startHref`),
  sus iconos y el ancla `#mis-modulos`. Una prueba prohíbe su reaparición.

## Ronda 2 (retroalimentación del dueño)

- **Panel secundario retirado.** «Continúa donde estabas» salió del lobby por decisión del dueño
  («no me aporta valor») junto con su estado, su lectura de `apex_navigation_trace_v1` y sus
  helpers. «Mis módulos» ocupa el ancho completo en grilla de cuatro columnas.
- **Cobertura fotográfica total.** Los 32 módulos del catálogo tienen fotografía propia generada
  con la misma dirección de arte y optimizada a WebP 1024×768 (24–69 KB). Se retiraron las dos
  imágenes compartidas (`module-finanzas.webp`, `module-heart.webp`).

## Cambios

| Archivo | Cambio |
|---|---|
| `apps/web/app/dashboard/page.tsx` | M — ancho completo sin panel secundario; grilla `xl:grid-cols-4`; tarjetas con `sizes` de cuatro columnas |
| `apps/web/lib/lobbyAssets.ts` | M — mapa slug→asset para los 32 módulos, sin imágenes compartidas |
| `apps/web/app/globals.css` | M — altura de la franja fotográfica de tarjeta a 9rem |
| `apps/web/public/assets/lobby/` | A 24 / D 2 — 32 fotografías de módulo + banner |
| `apps/web/test/operational-home-redesign.test.mjs` | M — prueba de cobertura y unicidad fotográfica por slug; prueba de ancho completo |
| `apps/web/test/phase-two-intelligent-experience.test.mjs` | M — el copy retirado se afirma por ausencia |
| `apps/web/components/ui/ModalFrame.tsx` | M — tono `brand`, icono de contexto, descripción y `titleId` |
| `apps/web/app/globals.css` | M — alcance `.apex-window` y sus variantes de tarjeta, opción, CTA y badges |
| `apps/web/lib/workspaceTools.ts` | A — evento `apex:open-workspace-tool` y hook de ventana |
| `apps/web/components/shell/DashboardChrome.tsx` | M — lanzador «Herramientas» y motores montados bajo la barra |
| `apps/web/components/system/{LocaleSwitcher,OfflineFirstStatus,NotificationCenter,CommandPalette,TraceabilityCenter,CollaborationPresence,ExperiencePreferences,WorldClassToolkit}.tsx` | M — de desplegable/panel a ventana V4 |
| `apps/web/test/certify-ui-ux-phase-{two,three-accessibility,three-collaboration,three-personalization,three-toolkit,three-totp}-local.mjs` | M — abren cada función desde el lanzador de ventanas |

## Validación ejecutada

- Pruebas web: `node --test "test/*.test.mjs"` desde `apps/web` — **671/671** en verde.
- Typecheck (`tsconfig.typecheck.json`) y ESLint sobre los archivos tocados: sin hallazgos (los 22
  avisos de ESLint son previos y no se tocaron).
- Navegador real (headless Edge vía CDP, perfil limpio):
  - Rondas 1–3, cuatro capturas del lobby:
    `evidence-lobby-{desktop,mobile}-{light,dark}.png`.
  - Ronda 4, 24 capturas de las ventanas (`evidence-windows-{desktop,mobile}-{theme}-{toolbar,connection,language,tools,preferences,team,commands,notifications}.png`)
    en escritorio y móvil. Cada captura se toma con la ventana abierta y espera su texto propio.
- El certificador de captura recorre la página para forzar el lazy-load y **falla** si alguna
  imagen queda con `naturalWidth = 0`; las 33 imágenes (banner + 32 módulos) cargaron en todas
  las capturas (359 px de ancho natural en escritorio, 390 px en móvil).
- Sin lógica de negocio alterada: acceso por `loadModuleAccess(MODULES)`, saludo derivado del
  correo. Sin datos inventados ni módulos fuera de autorización.

## Línea base vs después

- Antes (ronda 1): panel secundario de actividad y 21 tarjetas con degradado genérico.
- Después: módulos a ancho completo, 32 fotografías alusivas únicas, hero panorámico constante
  (oscuro en ambos temas) con «Creamos sistemas a tu medida» y sin CTAs, y barra superior con
  ventanas emergentes V4 en lugar de desplegables.

## Pendientes

1. Aprobación del dueño de esta fase piloto antes de extender el Design System V4 al resto del panel.
2. Certificadores `certify:ui-ux:phase-*` actualizados pero no ejecutados en esta máquina (requieren
   el arnés aislado con API/vista en 3310/3311); deben correr antes de promover a `develop`.
3. Capturas tomadas sobre dev server; repetir contra build de producción (`next build && next start`) cuando la fase se promueva.
4. Las imágenes se generaron con dirección de arte única (sin licencias de terceros); si el dueño
   prefiere fotografía real de la operación, se sustituyen los assets sin tocar código.

## Reproducir

Las capturas se generan con `vibe_images/cdp-capture.mjs` (lobby) y
`vibe_images/cdp-capture-windows.mjs` (ventanas), ambos clientes CDP sobre Node 24 con headless Edge
en `--remote-debugging-port=9225`, login contra `http://127.0.0.1:3000/api/v1/auth/login` (la CSP de
`apps/web` no permite `localhost` en connect-src) y navegación a `/dashboard` en el dev server del
puerto 3001. El script del lobby recorre la página, espera a que todas las imágenes carguen y solo
entonces captura; el de ventanas abre cada función y espera su texto antes de capturar.
