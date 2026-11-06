# Brief — Pasada UX del módulo Comercio

- **ID**: `2026-11-06-comercio-ux-pasada`
- **Fecha**: `2026-11-06`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "realiza una validacion completa de todo el modulo de comercio donde revicemos, ventanas emergentes bien diseñadas, campos modernos, busquedas modernas inteligentes (evitar listas), adaptar pantallas correctamnete, etiuetas modernas y funcionales todo basandonos en un buen rendimiento y experiencia de usuario todo debe ser guiado para que el usuario final con solo ver la pantalla entienda en donde esta y que debe hacer, evitar colocar textos obvios sobre el modulo, acotar todos estos ajustes visuales y de experiencia de usuario, ajustar y preparar el commit con todo el modulo funcional y validado completamente con sus pruebas correspondientes tanto de funcionalidad de colores, temas, botones transiciones, etc.. y brindame un resumen de la intervencion y el commit listo para migrar este modulo a develop de manera controlada y bajo mi autorizacion explicita"

## 1. Objetivo

Que las once pantallas de Comercio y su vitrina pública se comporten como un solo producto: la
misma búsqueda etiquetada, la misma capa modal con foco atrapado, el mismo botón y el mismo enlace,
los mismos estados vacíos que dicen qué hacer, y una tinta de texto que se lee en los dos temas.
Nada de esto cambia una regla de negocio: se corta la deriva visual que dejó cuatro formas
distintas de hacer la misma cosa en un mismo módulo.

## 2. Corrección de diagnóstico registrada

La revisión previa señaló un desborde horizontal en móvil de 390 px. Medido en Chromium real
(`document.documentElement.scrollWidth` contra `window.innerWidth`, en las once rutas, en las dos
anchuras), **el desborde no existe**: `scrollWidth === innerWidth === 390` en todas. El trabajo
derivado de ese hallazgo (re-hacer el grid responsivo) se canceló antes de escribir código. Este
brief deja constancia para que nadie vuelva a pedirlo.

### 2.1 Lo que encontró la certificación (y no era del arnés)

- **El foco no volvía al disparador en NINGÚN diálogo del producto.** `CommandPalette` montaba un
  `keydown` global con `[]` que, ante cualquier `Escape`, hacía `setOpen(false)` y
  `setTimeout(() => trigger.current?.focus(), 0)` — aunque el palette estuviera cerrado. `ModalFrame`
  devolvía el foco al botón que abrió el diálogo y, un tick después, el palette se lo llevaba a su
  propio botón de la barra. El check `el_foco_vuelve_al_disparador` lo midió en Chromium: el foco
  terminaba en «Centro de comandos». Se corrigió la causa (el escuchador de `Escape` ahora vive en
  un efecto con `open` y se desmonta al cerrar), no el check. Afecta a todos los módulos: es
  alcance compartido declarado en el inventario.
- **La etiqueta accesible estaba duplicada.** Los `SearchField` del módulo llevaban `aria-label` con
  el detalle del filtro y, a la vez, la etiqueta visible por defecto «Buscar»: el nombre accesible
  y lo que se veían en pantalla eran frases distintas. Los nueve campos del módulo pasan a
  nombrarse con `label=` visible (`Buscar productos`, `Buscar compras`, `Buscar créditos por número,
  cliente o estado`, …) y el detalle de qué campos cubre sigue en `placeholder` + `hint`.
- **El recuento filtrado no era medible por contrato.** `main [aria-live="polite"]` devolvía la
  píldora «En línea» de `OfflineFirstStatus` (también vive dentro de `<main>`), así que la
  certificación comparaba dos veces la misma píldora y declaraba conformidad sin filtrar nada. Los
  siete contadores del módulo («N de M productos», «N de M ventas», …) llevan ahora
  `id="conteo-resultados"` y la certificación lee ese ancla.
- **Búsqueda certificada con datos reales.** Los términos «P-0001» y «Águila» no existen en el
  tenant sembrado: devolvían cero filas antes y después, lo que hacía el check inocuo. La
  certificación lee de `comercio_products` un código real y la primera palabra acentuada de un
  nombre real, y exige `1 de N productos` con espacios sobrantes y el mismo recuento escribiendo
  la palabra con tilde y sin ella.
- **Ortografía visible de la vitrina y de las pantallas.** El barrido se extendió de
  `configuracion` a las once pantallas, `shared.tsx` y `storefront.tsx`; las cadenas corregidas
  están en el diff («Catalogo», «Envio a domicilio», «Limpiar busqueda», «Numero de cuotas»,
  «minimos», «informacion sobre un producto», «facturacion», «proxima entrada», «descripcion
  publicada», «Vista rapida»). La prueba `los textos que ve el cliente conservan la ortografia
  completa` ahora barre también la vitrina y se autoverifica con una falta conocida.

### 2.2 Lo que resultó ser del arnés (y por eso se corrigió el arnés)

- **El contraste de la insignia «HASTA -20%» estaba mal medido, no mal pintado.** La cerificación
  reportó 1,25:1 en la vitrina móvil. La cadena real es `rgba(190 18 60 / 0.9)` de la insignia sobre
  la tarjeta `rgb(227 231 230)` del tema claro del comercio: lo que el navegador pinta es
  `rgb(194 39 77)` y la letra blanca llega a **5,7:1**. El fallo estaba en `soporteDe`, que recorría
  hacia arriba tratando al ancestro como si estuviera *delante* del nodo (mezcla invertida) y, además,
  no dividía por el alfa resultante. Con la mezcla source-over correcta el rojo desaparece sin tocar
  una sola línea de producto. La medición que no reproduce el algoritmo de pintura del navegador no
  es evidencia: se corrigió el medidor y se dejó constancia.
- **Los 26 rojos táctiles iniciales eran en parte armazón de la plataforma.** `LocaleSwitcher`
  (18×36) y `ContextBreadcrumbs` (22×22) se pintan en `DashboardChrome.tsx:68-69`, fuera de Comercio.
  La medición separa ahora el armazón (se reporta en evidencia, no se exige) de los blancos del
  módulo (son el gate). Arreglar el armazón desde un commit de Comercio es alcance no pedido.

### 2.3 Lo que sí era de producto

- **WCAG 2.5.8 (mínimo 24×24 px).** Cinco enlaces de la portada (`Ajustar stock y mínimos` y los
  cuatro `Ver caja|Ver reportes|Ver todas|Ver productos` de `Panel`) medían 16-20 px de alto en
  móvil, y en la vitrina las filas de departamentos del pie (16×171) y los dos enlaces de ayuda.
  Todos llevan ahora `min-h-6` (24 px) sin cambiar su tipografía.
- **`--sf-ink-muted-t` y `--sf-ink-faint-t` bajaban de 4,5:1.** El motor los trataba como texto
  decorativo (3,8:1 y por debajo) cuando cargan las referencias «Ref. P-0019», los contadores y el
  microcopy del pie. Subidos a la cota AA en el motor, en el fallback CSS y en el panel de
  auditoría de la configuración, y la prueba de fórmula los fija.
- **El acento de marca como texto suspendía AA sobre su propio tinte.** La pestaña activa de
  Configuración («Negocio») pintaba `text-apex` (`15 118 110`) sobre `bg-apex/10` y medía **4,45:1**.
  El mismo par aparece en los chips de porcentaje, los números de paso y los presets de Reportes. Se
  agregó la tinta aditiva `--color-apex-ink` (17 94 88 en claro, con su pareja en oscuro y los dos
  contrastes altos) y Comercio adoptó `text-apex-ink` para TEXTO, dejando `text-apex` para bordes,
  rellenos, iconos y el cuadro de la casilla. No se tocó `components/ui/tabs.tsx`, que usa el mismo
  par: lo usan Contabilidad, Talento Humano y Compras, y repintar una primitiva global desde un
  commit de módulo es lo que la gobernanza prohíbe meter de contrabando. Queda como deuda declarada
  con su medida.

### 2.4 La barrida de ortografía del cierre (segunda pasada, más dura)

El primer contrato de ortografía leía el fuente con una lista de treinta y tantas palabras y
distingue mayúsculas. Por eso se colaron las faltas al inicio de frase: `"Creditos vigentes"`,
`anuracion`, `Envios registrados`. La revisión manual de las once pantallas, la cabecera, la
vitrina y `shared.tsx` dejó **115 correcciones de texto visible** y el contrato se reescribió para
que esa clase de fuga no pueda repetirse.

- **Tres reglas independientes, todas insensibles a mayúsculas.** (a) vocabulario curado con la
  forma sin tilde; (b) regla estructural: toda terminación `-cion`/`-sion` del texto suelto es
  `-ción`/`-sión` en español —y el plural `-ciones` no lleva tilde, así que la regla va por
  terminación y no por palabra, lo que cubre vocablos que nadie lista a mano—; (c) eñe:
  `campana`→`campaña`, `disenado`→`diseñado`, `dueno`→`dueño`, `manana`→`mañana`,
  `senal`→`señal`, `anos`→`años`.
- **Se cambió el objeto del barrido: del fuente crudo al texto extraído.** Ahora solo se examinan
  cadenas entrecomilladas, entre backticks o entre `>` y `<`, y además con un espacio o inicial
  mayúscula. Es la única forma de que el contrato sea usable: sobre la línea cruda,
  `const [limite, setLimite] = useState(tamano)` se reportaba como falta de tilde. Un contrato que
  marca identificadores como defecto se ignora a la segunda semana y se convierte en ruido.
- **Autoverificación en las dos direcciones.** Cinco frases con falta conocida deben disparar
  exactamente una detección cada una —incluida una mayúscula al inicio de frase, que es la clase
  que se coló— y tres formas de código legítimo no deben disparar ninguna. Sin la segunda mitad, el
  contrato solo demuestra que sabe gritar.
- **Falsos positivos retirados con la regla en la mano, no «por si acaso»:** `Apariencia` ya estaba
  bien escrito (no existe «apariencia»), `periodo` es variante válida de `período`, `solo` sin tilde
  cumple la norma RAE de 2014, `examen`/`imagen`/`caracteres` son llanas y solo llevan tilde en el
  plural (`exámenes`), y `cuando`/`como`/`que`/`quien` relativos no se acentúan. Corregirlos habría
  «arreglado» texto correcto y hundido la confianza en el barrido.
- **Un valor por defecto del backend se dejó a propósito.**
  `apps/api/src/modules/comercio/service.js:1332` (`|| "Conteo fisico"`) y `:1694` (`|| "Anulacion"`)
  siguen sin tilde. El frontend corrige sus etiquetas y siempre envía un motivo no vacío, así que ese
  default solo se activa si otro cliente llama sin motivo. Metirlo en este commit habría arrastrado
  `apps/api/src/**` —y con él a `apexos-backend` y `apexos-seguridad`— a un cambio de etiquetas de
  pantalla. Queda como deuda menor con su ruta exacta.
- **Dos artefactos del propio lote de reemplazos, cazados por las validaciones:** un par asimétrico
  de backticks que dejó un template literal sin cerrar en
  `apps/web/app/dashboard/comercio/promociones/page.tsx:260` (lo detuvo el typecheck, no la lectura
  superficial) y una clase mal compuesta, `text-error-ink-ink`, en `productos/page.tsx:475` (la dejó
  la sustitución de `text-rose-600`). Se registran porque una corrección en lote sin typecheck ni
  revisión del diff es exactamente la forma en que se publica una pantalla en blanco.

### 2.5 El rojo que solo aparecía a veces: un estado de error sin provocar no es certificación

La corrida de las puertas de cierre —con el módulo ya corregido— devolvió
`CERTIFICATION_FAIL {"fallidos":["objetivos_tactiles_ok_portada_movil_oscuro"]}` con un único
blanco por debajo de 24 px: el botón **«Reintentar»** de la portada (20×66). La corrida anterior
había dado 286 en verde. La diferencia no fue el código: fue que en esta corrida la petición
`/api/v1/comercio/dashboard` falló y la pantalla mostró su estado de error.

- **El defecto era real** y estaba fuera de la matriz: el control de reintento del aviso de error
  era un `<button>` de 20 px. Es un blanco de dedo, no un enlace en medio de un párrafo, así que la
  excepción de WCAG 2.5.8 no lo ampara. Sube a `inline-flex min-h-6 items-center` y la prueba de
  fuente fija el piso para que nadie lo vuelva a dejar suelto.
- **El check era una lotería, y eso también era un defecto del arnés.** Un control que solo existe
  cuando algo falla no puede depender de que algo falle: la certificación ahora **provoca** el
  estado (intercepta la petición del tablero y la aborta), mide el botón sobre lo que el navegador
  pintó y exige 24 px. La corrida pasó de 286 a **287 checks** y el detalle quedó fijado en
  `browser-local.json` como `{"presente":true,"alto":24,"ancho":66}`.
- **Regla que sale de aquí** (`apexos-qa` regla 33, control `estado-de-error-se-provoca-en-la-certificacion`):
  todo estado de error, vacío o de permiso que la certificación mida tiene que ser alcanzable por
  construcción. Si el camino normal no lo provoca, se provoca desde el arnés (petición abortada,
  tenant sin datos, rol sin permiso) o el check no cuenta como evidencia. Y el piso se fija también
  en la prueba de fuente, porque un arnés puede provocar mal el estado.

## 3. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/web/components/ui/SearchField.tsx` | Campo de búsqueda compartido: `type="search"`, etiqueta asociada por `htmlFor`, ayuda por `aria-describedby`, botón «Limpiar» con nombre accesible y regions `aria-live` del recuento |
| `A` | `apps/web/components/ui/useOverlayA11y.ts` | Aro de accesibilidad para capas que no pasan por `ModalFrame` (carrito y vista rápida de la vitrina): Escape cierra, Tab no se escapa, el fondo no se desplaza y el foco vuelve al disparador |
| `M` | `apps/web/components/ui/button.tsx` | Sale `buttonClasses(variant, size, className)`: la tinta, el alto y el anillo de foco de un enlace-accion salen de la misma fuente que el `<button>` |
| `M` | `apps/web/components/ui/ModalFrame.tsx` | Velo y diálogo entran con `apex-backdrop-enter` / `apex-dialog-enter` |
| `M` | `apps/web/components/ui/data-table.tsx` | Encabezados con `scope="col"` |
| `M` | `apps/web/components/transport/TransportSearchSelect.tsx` | La lista del combobox sigue al scroll cuando el selector vive dentro de una capa con scroll (escucha en fase) |
| `M` | `apps/web/components/system/CommandPalette.tsx` | **Bug de producto encontrado por la certificación**: el centro de comandos escuchaba `Escape` aunque estuviera cerrado y, un tick después, movía el foco a su propio botón de la barra. Rompía la promesa «el foco vuelve al disparador» en **todos** los diálogos del producto, no solo en Comercio. El escuchador de `Escape` ahora se monta solo con el palette abierto |
| `M` | `apps/web/components/comercio/shared.tsx` | `ModuleHeader` publica la brújula «Comercio › área › pantalla» con `aria-current="page"`; `useVentana()` para ventanear listados; el enlace de la brújula y la casilla `Check` tienen blanco táctil de 24 px (la casilla mide sobre su `<label>`, que es el área que el dedo alcanza) |
| `M` | `apps/web/components/comercio/storefront.tsx` | Carrito y vista rápida usan `useOverlayA11y` (se jubiló el Escape artesanal); los blancos táctiles de la vitrina (chips de departamento, cerrar, quitar, flechas, stepper, filas del pie) crecen a 24-44 px en móvil |
| `M` | `apps/web/components/comercio/storefront-theme.ts` | `INK_TARGETS` sube `muted` y `faint` a la cota AA: son niveles que llevan texto legible (referencias, contadores, microcopy), no decoración |
| `M` | `apps/web/app/tienda/storefront.css` | Fallback `:root` alineado con lo que produce el motor (la prueba de paridad lo verifica) |
| `M` | `apps/web/app/tienda/[code]/page.tsx` | Rutas de la vitrina: los dos avisos de enlace mal formado con ortografía completa («Link no válido», «La dirección de la tienda está incompleta. Pide el link otra vez al comercio.») |
| `M` | `apps/web/test/comercio-storefront-theme.test.mjs` | Los dos niveles de tinta que fallaban entran en la lista de cotas exigidas y se actualiza el literal del tema default |
| `M` | `apps/web/app/globals.css` | Tokens de tinta `--color-success-ink` / `--color-warning-ink` / `--color-error-ink` / `--color-apex-ink` en claro, oscuro y los dos modos de contraste alto; animación del velo apagada con movimiento reducido |
| `M` | `apps/web/tailwind.config.ts` | `success-ink`, `warning-ink`, `error-ink` y `apex-ink` como colores utilizables |
| `M` | `apps/web/app/dashboard/comercio/page.tsx` | Portada: sin jerga de módulo, textos con ortografía completa, tintas de texto accesibles, enlaces-acción de 24 px y el botón «Reintentar» del aviso de error llevado a 24 px de alto |
| `M` | `apps/web/app/dashboard/comercio/productos/page.tsx` | `SearchField`, ventana móvil, `text-error-ink` en lugar de `text-rose-600` suelto |
| `M` | `apps/web/app/dashboard/comercio/vender/page.tsx` | Búsqueda de mostrador con `SearchField`; aviso de crédito con ortografía completa |
| `M` | `apps/web/app/dashboard/comercio/ventas/page.tsx` | `SearchField`, ventana móvil, estado vacío de anulación explicado |
| `M` | `apps/web/app/dashboard/comercio/cartera/page.tsx` | `SearchField`, ventana móvil, tintas accesibles |
| `M` | `apps/web/app/dashboard/comercio/clientes/page.tsx` | `SearchField`, ventana móvil, ortografía completa |
| `M` | `apps/web/app/dashboard/comercio/compras/page.tsx` | `SearchField`, ventana móvil, ortografía completa |
| `M` | `apps/web/app/dashboard/comercio/gastos/page.tsx` | `SearchField`, ventana móvil, tintas accesibles |
| `M` | `apps/web/app/dashboard/comercio/promociones/page.tsx` | `SearchField` en el selector de productos, ventana en productos y audiencia, envío por WhatsApp con `buttonClasses`, ortografía completa |
| `M` | `apps/web/app/dashboard/comercio/reportes/page.tsx` | `SearchField` en movimientos; los cuatro huecos de datos pasan de relleno mudo a `EmptyState` con acción (mostrador, clientes) |
| `M` | `apps/web/app/dashboard/comercio/configuracion/page.tsx` | Tintas accesibles en los medidores de contraste y avisos |
| `M` | `apps/web/app/dashboard/comercio/ComercioCharts.tsx` | Ejes y series de los gráficos con ortografía completa («Día 7», «Promedio 7 días», «Ventas del día») |
| `M` | `apps/web/test/comercio-reports-charts.test.mjs` | El contrato de Reportes sigue el nuevo texto: presets, hoja «Ventas por día», `SearchField` en movimientos y los cuatro títulos de estado vacío que ahora explican qué hacer |
| `A` | `apps/web/test/comercio-ux-consistency.test.mjs` | Catorce pruebas de contrato de fuente: brújula en todas las pantallas, búsqueda compartida obligatoria, hooks antes del gate por componente, aro de capas, animaciones apagadas con movimiento reducido, enlace-acción con la misma fuente, encabezados de tabla, combobox que sigue al scroll y el palette que no roba el foco del diálogo. La ortografía visible se mide sobre texto extraído (comillas, backticks y nodos JSX de las catorce fuentes del módulo, vitrina y gráficos incluidos) con tres reglas —vocabulario curado, terminación `-ción`/`-sión` y eñe— y autoverificación en las dos direcciones: cinco faltas conocidas deben dispararse y tres formas de código legítimo no |
| `A` | `scripts/certifications/comercio-ux-local.js` | Certificación de navegador real: 11 rutas × 2 anchuras × 2 temas midiendo desbordes, nombres accesibles, blancos táctiles y contraste sobre el fondo pintado, más diálogo, foco, Escape, ventana móvil, selector dentro de capa, carrito y vista rápida de la vitrina, movimiento reducido y el **estado de error de la portada provocado** (se aborta `/api/v1/comercio/dashboard` para medir el botón «Reintentar» en vez de esperar que el ambiente falle) |
| `A` | `docs/qa/evidence/comercio-ux-pasada-20261106/` | Capturas, `browser-local.json` y `recorrido.json` de la corrida |
| `M` | `package.json` | Alta de `certify:comercio-ux:local` |
| `M` | `docs/design/APEXOS_COMPONENT_CATALOG.md` | Registro de `SearchField`, `useOverlayA11y`, `buttonClasses` y las tintas `*-ink` |
| `M` | `agents/CHANGELOG.md`, `agents/registry.json`, `.qoder/skills/apexos-frontend/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-brief/SKILL.md`, `.qoder/skills/equipo-apexos/SKILL.md` | Controles nuevos + bump + `updated_at` (espejo `agents/` vía `agents:sync`) |
| `A` | `docs/briefs/2026-11-06-comercio-ux-pasada.md` | Este documento |

### Módulos (`change_intent.modules`)

- `comercio` (presentación y accesibilidad de sus pantallas y de su vitrina pública)
- `ui-compartido` (`SearchField`, `buttonClasses`, `ModalFrame`, `data-table`, `TransportSearchSelect`)

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 4. Fuera de alcance

- Reglas de negocio, endpoints, esquema Prisma y migraciones: cero cambios en `apps/api/**`.
- El color semántico global (`--color-success`, `--color-warning`, `--color-error`): se deja
  intacto porque lo consumen Servicios, Talento Humano, Transporte y la torre. Lo que se agrega
  son tintas de TEXTO nuevas, adoptadas solo dentro de Comercio. Repintar el verde de todo el
  producto por un problema de contraste en un módulo es exactamente el cambio transversal que la
  gobernanza prohíbe meter de contrabando.
- Reescribir los 37 botones que aún usan `apex-primary-action` / `apex-secondary-action`: los dos
  estilos comparten el anillo de foco global, el radio (`--radius-control`) y superan la cota de
  24 px, así que la diferencia es de 4 px de alto. Sustituirlos es cosmético y toca once archivos;
  se registra como deuda, no como hallazgo.
- La marca `<main>` de la vitrina pública (su raíz es un `div#inicio`): pendiente declarado.
- El armazón del shell, medido y reportado aparte por la certificación (`armazon_menor_de_24` en
  `recorrido.json`): `LocaleSwitcher` mide **18×36 px** y `ContextBreadcrumbs` **22×22 px**, y ambos
  se pintan en `apps/web/components/shell/DashboardChrome.tsx:68-69` para todos los módulos. Son blancos
  por debajo de 24 px, pero corregirlos desde una pasada de Comercio cambia la barra de todas las
  pantallas del producto; se abre su propio brief.
- Las pestañas de `apps/web/components/ui/tabs.tsx`, que combinan `bg-apex/10` con `text-apex` igual
  que las de Comercio: la misma corrección aplica, pero las consumen Contabilidad, Talento Humano y
  Compras. Deuda declarada con su medida (4,45:1 en claro).
- Promoción a `develop`/`main`, push, despliegues, Supabase nube: requieren autorización
  independiente del dueño.

## 5. Criterios de aceptación

1. Cada pantalla de Comercio dice dónde está el usuario: `nav[aria-label="Ubicación en Comercio"]`
   con `aria-current="page"` en las diez pantallas hijas; la portada es el centro y no lleva brújula.
2. Ninguna lista del módulo tiene un `<input>` de búsqueda artesanal: toda búsqueda es
   `SearchField` (etiqueta, ayuda, limpiar, recuento anunciado) e ignora acentos y mayúsculas.
3. Las capas (diálogo, carrito, vista rápida) atrapan el foco, cierran con Escape, devuelven el
   foco al disparador, bloquean el scroll del fondo y no se animan con movimiento reducido.
4. Un listado largo no pinta todo el registro del tenant: va ventaneado y el botón «Ver N más»
   amplía sin recargar.
5. Los estados vacíos y los huecos de datos dicen qué hacer y llevan a la pantalla que lo resuelve.
6. El texto de estado (verde/ámbar/rojo) llega a 4,5:1 sobre el fondo pintado en claro y oscuro,
   en contraste alto también.
7. Un enlace que dispara una acción (WhatsApp, descarga) usa la misma tinta, alto y foco que el
   botón: `buttonClasses()`.
8. La ortografía completa llega a todo lo que ve el cliente; los comentarios del código siguen sin
   tildes, por convención del repo.
9. `node --test apps/web/test/comercio-ux-consistency.test.mjs` en verde, `npm run
   certify:comercio-ux:local` en verde, typecheck y lint limpios y las suites de web/API sin
   regresión.
10. El estado de error de la portada se certifica provocándolo (petición del tablero abortada) y su
    botón «Reintentar» mide 24 px en el navegador, no solo en el fuente.

## 6. Restricciones

- Rama: solo `desarrollo`. **Commit local, sin push**: el usuario pidió el commit listo para
  migrar a `develop` bajo su autorización explícita, no la migración.
- Los credenciales del demo local solo entran por variable de entorno, con el mismo patrón que el
  resto de certificaciones versionadas del repo.
- Un 5xx nunca es conformidad: la certificación declara el check rojo, no lo perdona.
- Los cambios en primitivas compartidas (`ModalFrame`, `data-table`, `button.tsx`,
  `TransportSearchSelect`) deben ser aditivos: ninguna otra pantalla del producto puede cambiar de
  aspecto ni de comportamiento.

## 7. Evidencia

- `docs/qa/evidence/comercio-ux-pasada-20261106/browser-local.json` — checklist completo de la
  certificación de navegador con sus limitaciones declaradas.
- `docs/qa/evidence/comercio-ux-pasada-20261106/recorrido.json` — contraste mínimo y conteo de
  blancos táctiles por ruta, pantalla física y tema.
- `docs/qa/evidence/comercio-ux-pasada-20261106/portada-390-error-provocado.png` — la portada en
  390 px con el estado de error provocado y el «Reintentar» de 24 px.
- `docs/qa/evidence/comercio-ux-pasada-20261106/gates-cierre.txt` — transcripción de las puertas de
  cierre: agentes (sync/check/42 pruebas/preflight `OK`/coverage `OK`), contrato de fuente 14/14,
  suite web de fuente 648/648, las nueve certificaciones de navegador de `apps/web` 9/9 en serie —
  en paralelo dos revientan su `waitForFunction` de 30 s por disputarse el dev-server, carga del
  arnés y no del producto—, subset Comercio del API 69/69, typecheck limpio, lint 0 errores / 22
  avisos y `CERTIFICATION_OK {"total":287}`.
- Capturas de portada, clientes y reportes en 1440 oscuro, y de clientes/productos/vitrina en 390.
