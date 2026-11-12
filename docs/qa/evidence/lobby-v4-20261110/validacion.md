# Validación — Lobby Design System V4 (fase piloto) — 2026-11-10

## Alcance aprobado

Fase piloto acotada al lobby del dashboard (`/dashboard`), con la imagen de referencia del lobby
corporativo oscuro con acentos turquesa como referencia obligatoria. El resto de la plataforma
queda sin intervenir hasta la aprobación explícita de la siguiente fase. La capa de fondo de la
ronda 6 es la excepción deliberada: vive en el layout raíz porque el dueño pidió que el fondo sea
«aplicable a todas las ventanas», sin cambiar el contenido ni la lógica de ningún módulo.

## Ronda 13 (iconos de módulo y banner de red)

- **El dueño señaló saturación en las imágenes.** «Las imágenes podrían estar generando una saturación
  visual; propondría colocar unos iconos modernos atractivos y el banner cambiarlo por la imagen que te
  envié». Las tarjetas de módulo pierden la franja fotográfica de 9 rem y pasan a una fila compacta con
  el icono lucide que cada ficha ya declara (`module.icon`); el hero estrena la constelación turquesa
  adjunta, convertida a WebP local de 852×480.
- **Un solo asset nuevo, cero borrados.** `LOBBY_MODULE_IMAGES` y `lobbyModuleImage()` salen de
  `lib/lobbyAssets.ts` porque ya no tienen consumidor, pero las 32 fotografías y `banner-truck.webp`
  siguen en disco: revertir la ronda es un `git revert`, no una reconstrucción de assets.
- **Defecto medido en el camino.** Con `priority` en la versión instalada de Next, el `<img>` del hero no
  recibía atributo de carga y el navegador no pedía el banner: `complete: false`, `naturalWidth: 0` y el
  hero quedaba como bloque plano. Se corrigió con `loading="eager"` explícito; la prueba lo fija y la
  evidencia mide el banner ya cargado (`complete: true`, recurso de 665×375 px) en ambos temas; el
  archivo origen es de 852×480 y la medición registra el recurso que entrega el optimizador.
- **Medido, no afirmado.** Con sesión real: banner cargado en ambos temas, `glyphBox` de 44×44 px,
  `tileMedia = 0`, 11 tiles, 11 enlaces de módulo, 0 retirados visibles, 0 candados y desbordamiento
  horizontal 0. El buscador conserva el contrato de la ronda 12.
- **Verificación.** Suite web **697/697**, `typecheck` limpio y ESLint sin errores (22 avisos previos).

## Ronda 12 (Contabilidad vuelve a la oferta)

- **Corrección del dueño sobre el corte.** «Veo que estás eliminando visuales que no te pedí … has
  eliminado de la visual el módulo de Contabilidad sin autorización». El slug `contabilidad` sale de
  `RETIRED_MODULE_SLUGS` y sus **11 funciones vuelven** al centro de comandos; el portafolio queda en
  **12 visibles / 20 retirados** sobre 32 fichas. La ficha, sus pantallas y sus assets nunca se
  borraron, así que la reversión fue quitar el slug del set.
- **Sin tocar lo que sí se pidió.** Tesorería, Proyectos, APEX Control, APEX AI Core, Facturación y
  Cartera y CxC siguen retirados, y CxC conserva la guardia que redirige al lobby. La tarjeta y el
  enlace «Cuentas por cobrar» de Contabilidad siguen fuera: su destino es una ruta bloqueada, y
  restaurarlos devolvería al usuario al lobby desde una acción anunciada.
- **Medido, no afirmado.** Con sesión real: **11 tiles** en el lobby (12 publicados menos Gastos
  Menores, sin derecho en el tenant demo), 11 enlaces de módulo en la barra, 0 slugs retirados en
  tiles o barra, 0 candados y desbordamiento horizontal 0 en ambos temas. En el buscador
  «contabilidad» devuelve **10 opciones** (ficha, facturas electrónicas, saldos iniciales, PYG,
  asientos, cuentas por pagar…) y «pyg» devuelve «Ver PYG por vehiculo»; «tesoreria», «proyectos»,
  «apex control», «apex ai», «cuentas por cobrar» y «crm» siguen en 0.
- **Rutas.** `/dashboard/contabilidad` y `/dashboard/contabilidad/facturas-recibidas` cargan su
  pantalla real; las cuatro URLs de CxC siguen terminando en `/dashboard`.
- **Verificación.** Suite web **697/697**, `module-portfolio.test.mjs` **6/6** (32 fichas / 12
  visibles / 20 retirados), `typecheck` limpio y ESLint sin errores.

## Ronda 11 (Cartera y CxC se bloquea con redirección)

- **El dueño pidió cerrar el acceso, no solo la oferta.** «Bloquear las rutas de CxC con redirección»: la raíz `/dashboard/cxc` y sus cuatro subrutas vuelven al lobby con `redirect("/dashboard")`. Las pantallas permanecen en el repositorio detrás de la guardia para cuando el módulo vuelva, pero ya no se renderizan.
- **La guardia vive en el layout, no en cada pantalla.** Las cuatro vistas de CxC son componentes cliente y no pueden redirigir por sí mismas; `app/dashboard/cxc/layout.tsx` corta cualquier subruta —actual o futura— y `app/dashboard/cxc/page.tsx` cubre la raíz, que antes caía en la ficha genérica con 404.
- **Una ruta bloqueada no puede seguir siendo destino.** Salen la tarjeta «Cuentas por cobrar» de `/dashboard/contabilidad` y la entrada de `contabilidad-nav`, y se elimina el override `moduleHome("cxc")`, que apuntaba a la bandeja ya cerrada. `moduleHome` vuelve a ser el templado `/dashboard/<slug>`.
- **Medido, no afirmado.** Las cuatro URLs —`/dashboard/cxc`, `/documentos`, `/retenciones` y `/clientes/1/estado-cuenta`— terminan en `/dashboard` con sesión real; el lobby conserva 10 tiles, 10 enlaces, 0 candados y desbordamiento horizontal 0 en ambos temas; «cuentas por cobrar» devuelve 0 opciones y las seis rutas heredadas de los otros retirados siguen cargando su pantalla.
- **Verificación.** Suite web **697/697** (`module-portfolio.test.mjs` 6/6 con la guardia asertada: layout y página redirigen y la oferta ya no nombra `/dashboard/cxc`), `typecheck` limpio y ESLint sin errores.

## Ronda 10 (curaduría del portafolio: 11 visibles y 21 retirados)

- **El corte salió de pantallas, API y certificación, no del campo `status`.** El catálogo tiene 32
  fichas; 14 solo abrían la página genérica `[module]` y 5 visibles estaban mal clasificadas como
  «En construcción» (Ventas, Facturación, Tesorería, Transporte y Talento humano).
- **Se retiraron 21 fichas sin borrarlas**: Punto de venta, Costos, Presupuestos, Producción,
  Recetas, Calidad, Devoluciones, Comercio exterior, Activos, CRM, Planeación de demanda,
  Facturación, Facturación electrónica, Configuración inicial, Suscripciones, Contabilidad,
  Tesorería, Proyectos, APEX Control, APEX AI Core y **Cartera y CxC**. Conservan ficha y fotografía
  en el repositorio; solo dejan de ofrecerse.
- **Una sola marca manda en los cuatro consumidores.** `RETIRED_MODULE_SLUGS` en `lib/modules.ts`
  alimenta `PORTFOLIO_MODULES`; el lobby, la barra lateral, el buscador y la ficha `[module]` la
  respetan. La barra deja de pintar candados de retirados y el slug retirado responde **404** aunque
  el tenant conserve su código en `active_modules`.
- **Siete retirados conservan ruta operativa: se retiran de la oferta, no del código.** Facturación,
  Contabilidad, Tesorería, Proyectos, APEX Control y APEX AI Core tenían pantalla raíz publicada;
  Cartera y CxC nunca tuvo ficha propia y en esta ronda conservó sus cuatro subrutas. Salen del
  lobby, la barra, el buscador y las acciones frecuentes —se retiraron 17 entradas de función (2 de
  Facturación, 11 de Contabilidad, 1 de Tesorería y 3 de CxC)— pero sus rutas siguen respondiendo
  para quien las tenga guardadas. La prueba del portafolio declara las excepciones: seis con ruta
  heredada y una con subrutas sin ficha raíz; **la ronda 11 cerró esa última con redirección**.
- **Consecuencia declarada: dos superficies quedan solo por URL.** El monitor de Facturas recibidas
  (`/dashboard/contabilidad/facturas-recibidas`) pierde su única entrada de oferta al retirar
  Contabilidad, y Cartera y CxC pierde sus tres entradas (documentos, cartera y retenciones); sus
  pantallas siguen cargando pero ya no se anuncian en el centro de comandos. La bandeja de CxC se
  cerró del todo en la ronda 11; Facturas recibidas sigue accesible por URL.
- **Cifra final acordada con el dueño: 11 visibles / 21 retirados.** El catálogo tiene un módulo con
  id no numérico (`AI-CORE`, APEX AI Core) que la tabla previa omitió. La secuencia de decisiones
  fue: 18/14 aprobados, 17/15 al retirar Facturación, 12/20 cuando el dueño marcó con X Contabilidad,
  Tesorería, Proyectos, APEX Control y APEX AI Core, y 11/21 al pedir ocultar Cartera y CxC «aún no
  tiene funcionalidad».
- **Seeds intactos por decisión del dueño.** No se tocó `apps/api`; los códigos retirados que algún
  tenant tenga habilitados quedan invisibles para la oferta, pero siguen en sus datos. Queda como
  deuda declarada alinear `SEED_MODULES` y el plan crown en una ronda de backend aparte.
- **Evidencia.** `evidence-portfolio-lobby-{light,dark}.png` y `evidence-portfolio-metrics.json` con
  sesión verificada: **10 tiles** en el tenant demo (11 publicados menos Gastos Menores, que no está
  habilitado), 0 retirados en tiles o barra, 10 enlaces de módulo, 0 candados, buscador sin fichas ni
  funciones retiradas («tesoreria», «proyectos», «apex control», «apex ai», «pyg», «cuentas por
  cobrar» y «crm» → 0), `punto-de-venta` y `configuracion-inicial` con 404, las seis rutas heredadas
  cargando su pantalla (incluido el monitor de facturas recibidas), las cuatro URLs de CxC
  redirigiendo al lobby (ronda 11), Inventario, Ventas, Compras, Comercio y mallas abriendo
  pantallas reales y desbordamiento horizontal 0 en ambos temas.
- **Verificación.** Suite web **697/697** (6 pruebas de `module-portfolio.test.mjs`, incluidas la
  excepción de rutas heredadas y la guardia de CxC), `typecheck` limpio y ESLint sin errores (22
  avisos preexistentes).

## Ronda 9 (el saludo del hero da protagonismo al usuario)

- **El hueco vino de la pantalla del dueño, no de una suposición.** Sobre la captura del hero marcó
  la píldora «Bienvenido, Demo · Demo APEX»: el nombre del usuario se leía a 11,5 px, en turquesa y
  con el mismo peso que el resto de la línea, así que el saludo parecía una etiqueta de sistema.
- **El saludo pasa a cápsula con identidad.** `.apex-lobby-eyebrow` se vuelve una cápsula que abraza
  su contenido (`align-self: flex-start`) con borde y degradado de marca, avatar de iniciales
  (componente `Avatar` existente, 36 px) y tres niveles de texto: «Bienvenido,» a 14 px, el nombre
  a **19 px / 700** en blanco de la paleta (`rgb(242 248 250)`) y la empresa a 14 px en acento. La
  frase de marca del `h1` sigue mandando (48 px escritorio, 36 px móvil); el chip no la compite.
- **La caja se midió.** La primera versión se estiró a 592 px porque, como hijo flex en columna, la
  cápsula adoptaba `align-items: stretch`: se corrigió con `align-self: flex-start` y quedó en
  **291×49** con radio 999 px. El contrato de caja no cambia: sin `position` fija ni absoluta,
  `max-width: 100%`, `min-width: 0` en la copia y desbordamiento horizontal `0` en escritorio
  (1440×1000) y móvil (390×844).
- **Se conserva el contrato del certificador.** El texto sigue conteniendo «Bienvenido,» como una
  sola cadena legible en `innerText`, que es lo que exige `certify-ui-ux-phase-two-local.mjs`.
- **Verificación.** Suite web **691/691** (dos pruebas nuevas en `lobby-greeting.test.mjs`),
  `typecheck` sin hallazgos y ESLint sin errores (22 avisos preexistentes). Sin datos ni lógica:
  el nombre sigue saliendo de `userDisplayName()` sobre `localStorage.user_email`; el cambio es
  presentación y marcadores.
- **Evidencia.** `evidence-greeting-{light,dark}.png` y
  `evidence-greeting-mobile-{light,dark}.png` recortadas al hero con login verificado
  (`demo@apex.local`, «Sesión activa»), más `evidence-greeting-metrics.json` con las medidas por
  vista (cápsula, radio, degradado, avatar, tamaños y colores de cada nivel, `h1` y
  desbordamiento).

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
| `apps/web/app/dashboard/page.tsx` | M — ronda 9: el saludo del hero usa `Avatar` de iniciales, nombre en `<strong>` destacado y empresa en acento, sobre marcadores `apex-lobby-eyebrow-*` |
| `apps/web/app/globals.css` | M — ronda 9: `.apex-lobby-eyebrow` como cápsula que abraza su contenido, con avatar, copia, nombre y empresa por nivel tipográfico |
| `apps/web/test/lobby-greeting.test.mjs` | A — 2 pruebas de contrato: estructura del saludo con avatar y nombre, y escala tipográfica sin desbordar el chip |
| `docs/qa/evidence/lobby-v4-20261110/evidence-greeting-*.png` y `evidence-greeting-metrics.json` | A — cuatro capturas del hero (escritorio/móvil, claro/oscuro) con métricas medidas |
| `apps/web/lib/modules.ts` | M — ronda 10: `RETIRED_MODULE_SLUGS`, helpers y listas del portafolio (12 visibles / 20 retirados tras la ronda 12); estados corregidos en Ventas, Facturación, Tesorería, Transporte y Talento humano |
| `apps/web/app/dashboard/page.tsx`, `apps/web/components/shell/Sidebar.tsx` | M — filtran por `PORTFOLIO_MODULES` y enlazan con `moduleHome`; los retirados dejan de pintarse |
| `apps/web/components/system/CommandPalette.tsx`, `apps/web/app/dashboard/[module]/page.tsx` | M — el buscador exige portafolio y la ficha genérica de un retirado responde 404 |
| `apps/web/lib/moduleFunctions.ts`, `apps/web/lib/operationalWorkspace.ts` | M — salen 6 entradas de oferta (2 de Facturación, 1 de Tesorería y 3 de CxC) y vuelven las 11 de Contabilidad en la ronda 12; sus rutas siguen operativas |
| `apps/web/test/module-portfolio.test.mjs` | A — 6 pruebas del corte (fichas, pantallas con cinco excepciones de ruta heredada y una bloqueada, consumidores, 404, estados y funciones) |
| `apps/web/test/command-palette-module-functions.test.mjs`, `apps/web/test/commercial-visit-selection.test.mjs` | M — contrato actualizado al filtro de portafolio, a `moduleHome`, a la exención de rutas de un retirado, a que PYG vuelve con Contabilidad y a que CxC deja de ofrecerse |
| `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png` y `evidence-portfolio-metrics.json` | A — lobby y métricas del corte con sesión real |
| `apps/web/lib/lobbyAssets.ts` | M — ronda 13: sale el mapa slug→fotografía; queda solo `LOBBY_BANNER = "/assets/lobby/banner-network.webp"` |
| `apps/web/app/dashboard/page.tsx` | M — ronda 13: tarjeta compacta con `module.icon` en `.apex-lobby-tile-glyph`; banner con `loading="eager"` y esqueleto de 20 rem |
| `apps/web/app/globals.css` | M — ronda 13: se retiran las reglas de tira fotográfica y entran tile flex, glyph claro/oscuro con hover y velo izquierdo del hero a 0,95/0,62 |
| `apps/web/public/assets/lobby/banner-network.webp` | A — constelación turquesa del dueño en WebP 852×480 (39.840 bytes) |
| `apps/web/test/operational-home-redesign.test.mjs` | M — ronda 13: afirma banner, carga eager, glyph, ausencia de tira fotográfica y las 32 fichas con icono |
| `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png` y `evidence-portfolio-metrics.json` | M — ronda 13: recaptura con banner cargado, glyph 44×44 y `tileMedia = 0` |

## Validación ejecutada

- Pruebas web: `node --test "test/*.test.mjs"` desde `apps/web` — **697/697** en verde (6 nuevas de
  la ronda 10, 2 de la ronda 9, 4 de la ronda 8 y 7 del fondo ambiente).
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
  - Ronda 9, cuatro capturas del hero (`evidence-greeting-{desktop,mobile}-{light,dark}.png`) y
    `evidence-greeting-metrics.json`, con login verificado: cápsula 291×49 con radio 999 px,
    avatar 36×36 «D», nombre 19 px/700 `rgb(242 248 250)`, copia 14 px, empresa 14 px acento,
    `h1` 48 px (escritorio) / 36 px (móvil) y desbordamiento horizontal `0`.
  - Ronda 10, dos capturas del lobby con el corte (`evidence-portfolio-lobby-{light,dark}.png`) y
    `evidence-portfolio-metrics.json`, con login verificado: 10 tarjetas del portafolio para el
    tenant demo (11 publicadas menos Gastos Menores, sin derecho en ese tenant), `retiredVisible`
    y `retiredLabelsInSidebar` vacíos, 10 enlaces de módulo en la barra, 0 botones bloqueados y
    desbordamiento horizontal `0` en ambos temas. El buscador deja de devolver los retirados
    («tesoreria», «proyectos», «apex control», «apex ai», «pyg», «crm» y «cuentas por cobrar» → 0
    opciones; «punto de venta» y «presupuesto» solo devuelven funciones de Comercio y Gestión
    Comercial, que siguen visibles) y las fichas genéricas (`/dashboard/punto-de-venta`,
    `/dashboard/configuracion-inicial`) responden 404. Las seis rutas heredadas —`/dashboard/facturacion`,
    `/dashboard/contabilidad`, `/dashboard/tesoreria`, `/dashboard/proyectos`, `/dashboard/apex-control`
    y `/dashboard/apex-ai`— siguen cargando su pantalla, igual que el monitor
    `/dashboard/contabilidad/facturas-recibidas`; las cuatro URLs de Cartera y CxC —`/dashboard/cxc`,
    `/documentos`, `/retenciones` y `/clientes/1/estado-cuenta`— terminan en `/dashboard` por la
    guardia de la ronda 11. Compras, Comercio, Inventario, Ventas y mallas abren pantallas reales.
  - Ronda 12, mismas dos capturas y métricas regeneradas tras devolver Contabilidad: **11 tarjetas**
    (12 publicadas menos Gastos Menores), 11 enlaces de módulo, `retiredVisible` y
    `retiredLabelsInSidebar` vacíos, 0 candados y desbordamiento `0` en ambos temas; «contabilidad»
    devuelve 10 opciones y «pyg» una, mientras «tesoreria», «proyectos», «apex control», «apex ai»,
    «cuentas por cobrar» y «crm» siguen en 0; `/dashboard/contabilidad` y su monitor de facturas
    recibidas cargan, y las cuatro URLs de CxC siguen terminando en `/dashboard`.
  - Ronda 13, mismas dos capturas y métricas regeneradas tras sustituir fotografías por iconos y el
    banner: `banner.complete` verdadero con 665×375 px servidos en ambos temas, `.apex-lobby-tile-glyph`
    de 44×44 px como primer glyph de cada tarjeta, `tileMedia = 0` (ninguna tira fotográfica), 11 tiles,
    11 enlaces de barra, 0 retirados visibles, 0 candados y desbordamiento `0` en ambos temas. El primer
    muestreo del hero salió plano porque el `<img>` no se solicitaba (`complete: false`,
    `naturalWidth: 0`); la causa se midió en el DOM (sin atributo de carga con `priority` en esta versión
    de Next) y se corrigió con `loading="eager"` antes de recapturar.
- Rendimiento del fondo medido en el arnés (2 s de desplazamiento, escritorio): con y sin la capa,
  16,67 ms promedio, p95 16,8 ms, 0 cuadros sobre 33 ms, 0 layouts y 0 scripts; ninguna petición de
  red nueva.
- El certificador de captura recorre la página para forzar el lazy-load y **falla** si alguna
  imagen queda con `naturalWidth = 0`. En las rondas con fotografía cargaban las 33 imágenes
  (banner + 32 módulos, 359 px de ancho natural en escritorio y 390 px en móvil); desde la ronda 13
  queda una sola petición de imagen —el banner de la constelación— y la medición exige que llegue
  completa en ambos temas.
- Certificadores de navegador contra el arnés aislado: **45/45** (ver ronda 5 y `cert-*.json`).
- Sin lógica de negocio alterada: acceso por `loadModuleAccess(MODULES)`, saludo derivado del
  correo. Sin datos inventados ni módulos fuera de autorización.

## Línea base vs después

- Antes (ronda 1): panel secundario de actividad y 21 tarjetas con degradado genérico.
- Después (ronda 13): módulos a ancho completo en tarjetas compactas con el icono lucide de su ficha,
  hero con la constelación turquesa del dueño (oscuro en ambos temas) y «Creamos sistemas a tu medida»
  sin CTAs, barra superior con ventanas emergentes V4 en lugar de desplegables, y un fondo ambiente
  corporativo compartido por todas las pantallas y ventanas. Las 32 fotografías de módulo y el banner
  del camión quedan en disco sin pintarse, para revertir la ronda sin reconstruir assets.

## Pendientes

1. Aprobación del dueño de esta fase piloto antes de extender el Design System V4 al resto del panel.
2. Capturas tomadas sobre dev server; repetir contra build de producción (`next build && next start`) cuando la fase se promueva.
3. Desde la ronda 13 las tarjetas pintan iconos del catálogo y el hero usa el banner del dueño; las
   fotografías siguen en disco sin uso. Si se retoman, se reengancha `lobbyAssets.ts` sin tocar la
   estructura de la tarjeta.
4. Los seeds del backend (`SEED_MODULES` y el plan corona en
   `apps/api/src/modules/auth/service.js`) siguen habilitando `M-01…M-27` por decisión del dueño:
   el corte es de catálogo y no de suscripción, así que los 20 retirados siguen viajando en
   `active_modules` aunque ninguna superficie los ofrezca. Alinearlos es una ronda de backend aparte.
   Los cinco retirados con ruta raíz publicada (Facturación, Tesorería, Proyectos, APEX Control y
   APEX AI Core) las conservan accesibles por URL directa; el monitor de Facturas recibidas ya no es
   una asimetría desde la ronda 12, porque vuelve a anunciarse con Contabilidad. Cartera y CxC ya no
   presenta asimetría: su raíz y sus subrutas redirigen al lobby desde la ronda 11.

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
