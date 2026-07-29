# APEXOS Operational Design System

Version: 2.0

Estado: Normativa QA

## Principio Rector

APEXOS adopta `Operational First Design`.

Toda decision de producto visual se evalua en este orden:

1. Rendimiento
2. Productividad
3. Claridad
4. Consistencia
5. Accesibilidad
6. Escalabilidad
7. Mantenibilidad
8. Estetica

La estetica es consecuencia de una herramienta rapida, clara y confiable. Nunca es el objetivo principal.

## Restricciones

Esta normativa aplica solo al frontend. Queda prohibido modificar como parte del Design System:

- Logica de negocio
- Backend
- API
- Base de datos
- Prisma
- RLS
- Seguridad
- Autenticacion
- Permisos y roles
- Integraciones
- Contratos entre frontend y backend

## Tokens Oficiales

### Color

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `apex` | `#14B8A6` | `#14B8A6` | Accion primaria, seleccionado, activo, progreso, link principal |
| `background` | `#F5F7F9` | `#0F1720` | Fondo general |
| `surface` | `#FFFFFF` | `#17232D` | Paneles, modales, controles |
| `text-primary` | `#17212B` | `#F2F5F7` | Titulos y contenido principal |
| `text-secondary` | `#667085` | `#9BAAB2` | Metadatos, ayuda, estados neutros |
| `border` | `#E5E7EB` | `#2A3B47` | Separadores y contornos sutiles |
| `success` | `#22C55E` | `#22C55E` | Correcto |
| `warning` | `#F59E0B` | `#F59E0B` | Advertencia |
| `error` | `#EF4444` | `#EF4444` | Error |
| `info` | `#2563EB` | `#2563EB` | Informacion |

No se permiten colores inventados por pantalla. Toda excepcion debe documentarse en el archivo de la pantalla o en una decision tecnica de QA.

### Tipografia

- Familia unica oficial: Inter.
- Alternativa permitida si se adopta formalmente: IBM Plex Sans.
- No mezclar familias.
- No usar `letter-spacing` negativo.
- No escalar fuente con ancho de viewport.

Escala:

| Token | Tamano | Uso |
| --- | --- | --- |
| `text-xs` | 12px | Badges, metadatos densos |
| `text-sm` | 14px | Tablas, formularios desktop, navegacion |
| `text-base` | 16px | Mobile, formularios tactiles |
| `text-lg` | 18px | Titulos de panel/modal |
| `text-xl` | 20px | Titulos de pantalla operativa |
| `text-2xl` | 24px | Dashboard o encabezado principal |

### Espaciado

Unica escala permitida:

`4, 8, 12, 16, 24, 32, 48`

Equivalentes Tailwind preferidos:

| px | Tailwind |
| --- | --- |
| 4 | `1` |
| 8 | `2` |
| 12 | `3` |
| 16 | `4` |
| 24 | `6` |
| 32 | `8` |
| 48 | `12` |

Evitar medidas arbitrarias salvo que protejan una restriccion funcional documentada: ancho minimo de tabla, safe area mobile, alto de viewport o posicionamiento tecnico.

### Bordes, Radio y Sombras

- Radio base: 6px u 8px.
- Cards y paneles: maximo 8px.
- Botones: 6px u 8px.
- Badges: 4px o pill solo para estados compactos.
- Bordes: sutiles, nunca protagonistas.
- Sombras: evitar por defecto; usar solo en overlays, barras sticky y elementos flotantes necesarios.

## Componentes Base Obligatorios

Toda pantalla nueva debe usar estos componentes cuando existan:

- `Button`
- `Input`
- `Select`
- `Textarea`
- `Checkbox`
- `Switch`
- `Modal`
- `Drawer`
- `Badge`
- `Alert`
- `DataTable`
- `Card`
- `Tabs`
- `Navbar`
- `Sidebar`
- `Layout`
- `Skeleton`
- `Loading`
- `EmptyState`
- `Breadcrumbs`
- `Pagination`

Queda prohibido crear componentes locales equivalentes sin justificarlo.

## Botones

- Solo un boton primario visible por pantalla o flujo activo.
- Acciones secundarias usan variante secundaria, ghost o menu.
- Acciones destructivas usan `error`, no `apex`.
- Botones de icono deben usar iconos Lucide y `aria-label`.
- En desktop, altura comun: 36px o 40px.
- En mobile, altura minima: 48px; accion principal operativa: 56px.

## Tablas

Las tablas son el componente central del ERP.

Requisitos:

- Header sticky cuando la tabla exceda una pantalla.
- Densidad compacta en desktop.
- Busqueda y filtros cercanos al titulo de la tabla.
- Acciones de fila agrupadas cuando haya mas de dos.
- Paginacion o virtualizacion para listas largas.
- Anchos minimos definidos para evitar saltos de layout.
- Estados de carga, vacio y error consistentes.

No envolver tablas en cards decorativas si el borde/scroll propio resuelve la estructura.

## Formularios

- Labels visibles.
- Ayuda corta solo donde reduzca errores.
- Errores cerca del campo.
- Inputs desktop: 36px o 40px.
- Inputs mobile: minimo 48px.
- Formularios desktop pueden usar multiples columnas.
- Formularios mobile deben dividirse en pasos o tareas cortas.

## Estados

Cada pantalla debe tener:

- Cargando
- Vacio
- Error recuperable
- Exito o confirmacion
- Disabled o permiso insuficiente cuando aplique

Los estados deben usar la paleta oficial y textos accionables.

## Animacion y Movimiento

Permitido:

- Transiciones de color/foco de 120ms a 180ms.
- Entrada de modal/drawer si no retrasa interaccion.
- Spinner solo durante trabajo real.

Prohibido:

- Animaciones permanentes decorativas.
- Blur/backdrop filter como estilo base.
- Gradientes decorativos en pantallas operativas.
- Microinteracciones que muevan el layout.

## Performance

Cada componente debe minimizar:

- JS montado
- DOM innecesario
- Re-render
- Estados globales
- CSS arbitrario
- Iconos duplicados
- Imagenes sin optimizacion

Componentes pesados deben usar lazy loading, memoizacion o virtualizacion cuando el volumen lo justifique.

