# Validación — Lobby Design System V4 (fase piloto) — 2026-11-10

## Alcance aprobado

Fase piloto acotada al lobby del dashboard (`/dashboard`), con la imagen de referencia del lobby
corporativo oscuro con acentos turquesa como referencia obligatoria. El resto de la plataforma
queda sin intervenir hasta la aprobación explícita de la siguiente fase. La capa de fondo de la
ronda 6 es la excepción deliberada: vive en el layout raíz porque el dueño pidió que el fondo sea
«aplicable a todas las ventanas», sin cambiar el contenido ni la lógica de ningún módulo.

## Ronda 8 (capa visual de operación — gráficos, tablas y estados vacíos)

- **El hueco se fijó con una medición, no con una opinión.** La tabla comparativa del 2026-11-11
  calificó visualización de datos en 5/10 y tablas/estados en 6/10: los gráficos heredaban colores
  por atributo de presentación de Recharts (rejilla casi invisible en oscuro, ticks sin jerarquía),
  el encabezado de tabla repetía el peso del cuerpo y el estado vacío era una línea de texto entre
  dos bordes.
- **Gráficos con piel de producto.** Superficie `.apex-chart-card` para el contenedor; por CSS sobre
  las clases públicas de Recharts baja la rejilla a `rgb(var(--color-line) / 0.6)` (oscuro
  `rgba(45 212 191 / 0.1)`), los ejes a línea plena, los ticks a `--text-muted` con
  `tabular-nums` (oscuro `rgb(155 170 178)`), la leyenda a 12 px y el cursor del tooltip a un velo
  turquesa. Todo exceptuando caja y posición.
- **Tablas con lectura de tablero.** El encabezado estándar es rótulo (11 px, mayúsculas,
  `letter-spacing: 0.06em`, tinta apagada); las celdas usan `tabular-nums`, la primera columna se
  afirma como identidad y el hover pinta tinte de marca al 6 %. En oscuro, filo turquesa al 16 % en
  el encabezado y viewport con halo. Alto contraste deja el hover en superficie neutra.
- **Estados vacíos con oficio.** `.apex-empty` pasa a bloque punteado con degradado tenue del papel
  y `.apex-empty-icon` a anillo de marca con halo de 6 px; en oscuro el icono sube a
  `rgb(153 246 228)` y el bloque a un velo turquesa al 5 %. Alto contraste quita el degradado. El
  envoltorio del icono retira la utilidad `text-apex` porque el `!important` heredado del tema
  oscuro sobre esa utilidad estaba tapando el token del estado vacío.
- **Evidencia con sesión verificada.** La primera captura del estado vacío devolvió una pantalla de
  «Acceso no autorizado» por una corrida sin contexto de rol y se descartó; la válida se tomó con
  `demo@apex.local` y «Sesión activa» visibles en el costado. `evidence-operation-metrics.json`
  mide, en claro y oscuro: 3 tarjetas de gráfico `1134x300` con tick y rejilla por tema, tabla de
  24 filas con encabezado `0.66px`/`11px` y cifras `tabular-nums`, estado vacío con borde
  `dashed`, degradado, anillo e icono por tema, y desbordamiento horizontal `0` en las seis vistas.
- **Verificación.** Suite web **689/689** (cuatro pruebas nuevas en `visual-operation.test.mjs`),
  typecheck sin hallazgos. Sin lógica de negocio: los tres archivos de componente solo cambian
  `className` y la API no se tocó. Todo CSS estático: sin animación, sin JS y sin red nuevos.

## Ronda 7 (superficies con oficio — el fondo deja de leerse apagado)

- **El diagnóstico se midió, no se adivinó.** Se probaron seis variantes de fondo por inyección
  temporal sobre el entorno local y se muestrearon píxeles reales de las capturas: subir las alfas
  del ambiente (tres intensidades) movió el papel visible ~1 unidad RGB — imperceptible. La causa es
  estructural: las superficies que el ojo lee (costado, barra, tarjetas) son opacas por contrato, así
  que la capa ambiente solo asoma en los huecos. La palabra «apagada» vivía en las superficies del
  marco, no detrás de ellas.
- **Costado con gradiente opaco.** `aside.apex-chrome-sidebar` gana un degradado vertical de la misma
  familia cromática (`#182730` arriba → `#0D161C` abajo) y filo turquesa al 14% en el borde derecho.
  Sigue siendo opaco y no deja ver el ambiente: cambia el matiz, no la transparencia.
- **Barra superior y barra de herramientas.** El header real del panel de marcación gana fondo
  cálido translúcido (`rgb(20 32 41 / 0.94)`) y línea inferior turquesa al 12%; la barra de
  herramientas del dashboard (fila de píldoras) gana un filo inferior de 1 px turquesa al 10% a todo
  el ancho, sin banda de fondo.
- **Tarjetas de sección con halo y sombra.** `.apex-section-card` pasa de rectángulo plano a
  superficie trabajada: en oscuro, borde turquesa al 14% + anillo de 1 px al 5% + sombra de
  elevación; en claro, sombra suave neutra. Todo dibujado con `box-shadow` y `border-color` — cero
  cambios de caja (la prueba lo afirma: ninguna propiedad de `width|height|margin|padding`).
- **Ambiente oscuro alzado y grano claro.** Las alfas del tema oscuro suben de `0.10 / 0.18 / 0.10`
  a `0.13 / 0.22 / 0.13` para que los huecos entre tarjetas respiren, y el grano claro sube de
  `0.03` a `0.04` para no perder textura sobre blanco. El claro sigue intacto en lo demás.
- **Alto contraste restaura lo plano.** Con `data-contrast="high"` el costado y la barra vuelven a
  superficie plana y las tarjetas pierden la sombra: el oficio nunca compite con la legibilidad.
- **Verificación.** Suite web **680/680** (dos pruebas nuevas: intensidades fijadas por tema y
  contrato del marco sin layout shift), typecheck sin hallazgos. Capturas y métricas por vista en
  `evidence-craft-*` y `evidence-craft-metrics.json`: gradiente del costado, filo turquesa y sombra
  de tarjeta confirmados en escritorio, módulo, móvil y ventana de comandos, en claro y oscuro, sin
  desbordamiento horizontal. Todo CSS estático: sin animación nueva, sin JS y sin peticiones de red.

## Ronda 6 (fondo ambiente en todas las ventanas)

- **Una sola capa para todo el producto.** `apps/web/app/layout.tsx` monta `.apex-ambient` una vez
  (`aria-hidden`, tres luces de la paleta corporativa, grano SVG inline y deriva compuesta por
  `transform`): toda ruta y toda ventana emergente comparten el mismo fondo, sin repetirlo por
  pantalla ni pedir recursos de red.
- **El marco dejó de taparlo.** El dueño veía el fondo «triste» porque `.apex-app-gradient` pintaba
  un papel opaco encima del ambiente. Ahora el marco es transparente (el papel lo sigue pintando
  `html/body`), el override oscuro ya no repinta `--surface` sobre el marco y el panel de marcación
  exclusiva no pinta `bg-paper` propio. La capa queda sobre el papel y debajo de tarjetas, tablas y
  ventanas (`z-index: -1` dentro de `body { isolation: isolate }`). En oscuro el papel baja a
  `#0F1720` y las superficies siguen en `#17232D`, lo que da separación sin tocar ninguna tarjeta.
- **Claro y oscuro con intensidades propias.** Claro usa `0.12 / 0.09 / 0.06` y grano `0.03` para
  dar profundidad al papel sin teñir el blanco; oscuro usa `0.10 / 0.18 / 0.10` y grano `0.06` para
  evitar el negro plano. Las capturas confirman marco transparente en ambos temas y en todas las
  vistas (`evidence-ambient-metrics.json`).
- **Rendimiento medido, no supuesto.** Con la capa visible y oculta, durante 2 s de desplazamiento
  en escritorio: **16,67 ms** de cuadro promedio, **p95 16,8 ms**, **0** cuadros sobre 33 ms,
  **0** layouts y **0** scripts. La capa no añade ninguna petición de red (la única imagen es el
  `apex-icon.svg` que ya existía). La deriva solo corre en escritorio (≥1024 px) y con
  `prefers-reduced-motion: no-preference`; se apaga en el bloque compartido de movimiento reducido,
  con `html[data-reduced-motion="true"]`, en alto contraste y en impresión.
- **Ventanas incluidas.** Con el centro de comandos abierto el ambiente sigue detrás del velo y las
  tarjetas y tablas permanecen opacas y legibles; el fondo no compite con la información.

## Ronda 5 (certificación aislada de las ventanas)

- **Los seis certificadores de navegador corrieron contra el candidato aislado.** Arnés en `%TEMP%`
  sobre el commit `fbd1c195`, PostgreSQL clonado, API en `127.0.0.1:3310` y vista en `127.0.0.1:3311`,
  con compuerta de red que solo admite loopback. Recuento real: **45 comprobaciones en verde**
  (fase 2: 14; accesibilidad: 11; colaboración: 5; personalización: 5; productividad: 6; TOTP: 4),
  cada una con su JSON en este directorio (`cert-*.json`).
- **El arnés se reparó antes de medir.** Su copia aislada había perdido el `.git`, la compuerta de
  red y los `node_modules`; se reconstruyó materializando el HEAD sin tocar caché ni artefactos, se
  volvieron a enlazar los paquetes y se inyectaron `APEX_LOCAL_WEB_URL` y `APEX_LOCAL_API_URL`,
  que faltaban y hacían caer los certificadores al puerto `3000`.
- **Tres rojos eran de hidratación, no de las ventanas.** `Ctrl K` se perdía si se pulsaba antes de
  que React hidratara; el login tecleado en frío quedaba limpio al hidratar y el reintento concatenaba
  credenciales en headless (`400`); y una pestaña de fondo no dispara `focusin` con `focus()`
  programático. Los certificadores ahora esperan, limpian el campo y reintentan acotado, y la edición
  concurrente se simula con clic y tecla reales. Ningún cambio de producto.

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
| `apps/web/app/layout.tsx` | M — capa `.apex-ambient` única para todas las rutas y ventanas |
| `apps/web/app/globals.css` | M — tokens y estilos del fondo ambiente; marco transparente y superficies oscuras sin el marco |
| `apps/web/components/shell/DashboardChrome.tsx` | M — el panel de marcación deja de pintar `bg-paper` propio |
| `apps/web/test/ambient-background.test.mjs` | A — 7 pruebas del ambiente: montaje único, apilado, temas, grano inline, deriva, reducción de movimiento, alto contraste/impresión y marco transparente |
| `docs/qa/evidence/lobby-v4-20261110/evidence-ambient-*.png` y `evidence-ambient-metrics.json` | A — siete capturas (lobby y módulo en claro/oscuro, comandos y móvil en ambos temas) con métricas medidas |
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
| `apps/web/test/certify-ui-ux-phase-two-local.mjs` | M — `Ctrl K` reintentado hasta medir la apertura; copy del lobby vigente |
| `apps/web/test/certify-ui-ux-phase-three-collaboration-local.mjs` | M — login que rellena tras hidratar; edición concurrente con clic y tecla reales |
| `apps/web/test/certify-ui-ux-phase-three-toolkit-local.mjs` | M — login que rellena tras hidratar |
| `docs/qa/evidence/lobby-v4-20261110/cert-*.json` | A — seis certificaciones medidas en el arnés aislado |
| `apps/web/app/globals.css` | M — ronda 8: piel de Recharts, rótulo y cifras de `.apex-standard-table`, viewport oscuro y `.apex-empty`/`.apex-empty-icon` por tema |
| `apps/web/components/accounting/AccountingPyg.tsx`, `apps/web/app/dashboard/comercio/ComercioCharts.tsx` | M — marcador `apex-chart-card` en el contenedor del gráfico (solo `className`) |
| `apps/web/components/ui/feedback.tsx` | M — marcadores `apex-empty`/`apex-empty-icon`; retiro de `text-apex` que tapaba el token del icono |
| `apps/web/test/visual-operation.test.mjs` | A — 4 pruebas de contrato de la operación visual sin propiedades de caja |
| `docs/qa/evidence/lobby-v4-20261110/evidence-operation-*.png` y `evidence-operation-metrics.json` | A — seis capturas (gráficos, tabla y estado vacío en claro/oscuro) con métricas medidas |

## Validación ejecutada

- Pruebas web: `node --test "test/*.test.mjs"` desde `apps/web` — **689/689** en verde (4 de ellas
  nuevas de la ronda 8, además de las 7 del fondo ambiente).
- Typecheck (`tsconfig.typecheck.json`) y ESLint sobre los archivos tocados: sin hallazgos.
- Navegador real (headless Edge vía CDP, perfil limpio):
  - Rondas 1–3, cuatro capturas del lobby:
    `evidence-lobby-{desktop,mobile}-{light,dark}.png`.
  - Ronda 4, 24 capturas de las ventanas (`evidence-windows-{desktop,mobile}-{theme}-{toolbar,connection,language,tools,preferences,team,commands,notifications}.png`)
    en escritorio y móvil. Cada captura se toma con la ventana abierta y espera su texto propio.
  - Ronda 6, siete capturas del fondo (`evidence-ambient-{desktop,module}-{light,dark}.png`,
    `evidence-ambient-dark-commands.png` y `evidence-ambient-mobile-{dark,light}.png`) más
    `evidence-ambient-metrics.json`, que mide marco transparente, `z-index: -1`, `position: fixed`,
    deriva activa solo en escritorio y ancho de desplazamiento igual al del cliente (390/390 y
    1440/1440, sin desbordamiento).
  - Ronda 8, seis capturas de operación (`evidence-operation-{charts,table,empty}-{light,dark}.png`)
    más `evidence-operation-metrics.json`, tomadas con login verificado (`demo@apex.local`): piel de
    gráficos, densidad de tabla y estado vacío medidos en el DOM, con desbordamiento horizontal `0`.
    La primera captura del estado vacío salió como pantalla de «Acceso no autorizado» y se descartó.
- Rendimiento del fondo medido en el arnés (2 s de desplazamiento, escritorio): con y sin la capa,
  16,67 ms promedio, p95 16,8 ms, 0 cuadros sobre 33 ms, 0 layouts y 0 scripts; ninguna petición de
  red nueva.
- El certificador de captura recorre la página para forzar el lazy-load y **falla** si alguna
  imagen queda con `naturalWidth = 0`; las 33 imágenes (banner + 32 módulos) cargaron en todas
  las capturas (359 px de ancho natural en escritorio, 390 px en móvil).
- Certificadores de navegador contra el arnés aislado: **45/45** (ver ronda 5 y `cert-*.json`).
- Sin lógica de negocio alterada: acceso por `loadModuleAccess(MODULES)`, saludo derivado del
  correo. Sin datos inventados ni módulos fuera de autorización.

## Línea base vs después

- Antes (ronda 1): panel secundario de actividad y 21 tarjetas con degradado genérico.
- Después: módulos a ancho completo, 32 fotografías alusivas únicas, hero panorámico constante
  (oscuro en ambos temas) con «Creamos sistemas a tu medida» y sin CTAs, barra superior con
  ventanas emergentes V4 en lugar de desplegables, y un fondo ambiente corporativo compartido por
  todas las pantallas y ventanas, con las superficies y el contenido intactos.

## Pendientes

1. Aprobación del dueño de esta fase piloto antes de extender el Design System V4 al resto del panel.
2. Capturas tomadas sobre dev server; repetir contra build de producción (`next build && next start`) cuando la fase se promueva.
3. Las imágenes se generaron con dirección de arte única (sin licencias de terceros); si el dueño
   prefiere fotografía real de la operación, se sustituyen los assets sin tocar código.

## Reproducir

Las capturas se generan con `vibe_images/cdp-capture.mjs` (lobby) y
`vibe_images/cdp-capture-windows.mjs` (ventanas), ambos clientes CDP sobre Node 24 con headless Edge
en `--remote-debugging-port=9225`, login contra `http://127.0.0.1:3000/api/v1/auth/login` (la CSP de
`apps/web` no permite `localhost` en connect-src) y navegación a `/dashboard` en el dev server del
puerto 3001. El script del lobby recorre la página, espera a que todas las imágenes carguen y solo
entonces captura; el de ventanas abre cada función y espera su texto antes de capturar.

La ronda 6 usa un cliente CDP equivalente sobre el arnés aislado: inicia sesión, fija
`apex_theme` en `localStorage`, recorre lobby, módulo de inventario, centro de comandos y móvil en
los dos temas, y escribe las capturas y `evidence-ambient-metrics.json` en este directorio:

```bash
node .tmp/recovery-isolated-launch.cjs script <repo>/.tmp/capture-ambient.cjs
```

Los seis certificadores se corren contra el arnés aislado del candidato, uno por script, con la
vista y la API del arnés (3311/3310) y su JSON en este directorio, por ejemplo:

```bash
node .tmp/recovery-isolated-launch.cjs script <copia>/apps/web/test/certify-ui-ux-phase-two-local.mjs --output=<repo>/docs/qa/evidence/lobby-v4-20261110/cert-phase-two.json
```

Cada certificador lee `APEX_LOCAL_WEB_URL` y `APEX_LOCAL_API_URL` (el arnés las inyecta) y usa la
cuenta demo local; la salida es su recuento de comprobaciones y el JSON con `status: "passed"`.
