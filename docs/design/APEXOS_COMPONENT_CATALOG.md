# Catálogo de componentes y homologación UI — APEXOS

Versión: 1.0 — 2026-11-03

Índice normativo para construir pantallas en `apps/web`. No reemplaza los estándares; los ordena para que una pantalla nueva no invente un patrón distinto.

## 1. Lectura previa obligatoria

1. `docs/design/APEXOS_OPERATIONAL_DESIGN_SYSTEM.md` — tokens y principio rector.
2. `docs/design/APEXOS_DESIGN_STANDARDS.md` — prohibiciones y estructura de pantalla.
3. `docs/design/APEX_OS_POLITICA_DISENO_PRODUCTO.md` — política de producto.
4. `docs/design/APEXOS_DESKTOP_GUIDELINES.md` y `APEXOS_MOBILE_GUIDELINES.md`.
5. `docs/design/APEX_OS_TABLE_STANDARDIZATION_CHECKLIST.md`.
6. `docs/project/filosofia-producto-ui.md` y `docs/project/validacion-frontend-css.md`.

## 2. Tokens oficiales (usar solo estos)

Definidos en `apps/web/tailwind.config.ts` y `apps/web/app/globals.css`:

| Grupo | Clases canónicas |
|---|---|
| Superficies | `bg-paper`, `bg-surface`, `bg-surface-soft`, `bg-surface-muted` |
| Texto | `text-content-strong`, `text-content-body`, `text-content-muted`, `text-content-subtle` |
| Bordes | `border-line`, `border-apex`, `border-success`, `border-warning`, `border-error`, `border-info` |
| Marca y estados | `bg-apex`, `text-apex`, `bg-success`, `bg-warning`, `bg-error`, `bg-info` |
| Radios | `rounded-control`, `rounded-card`, `rounded-overlay` |
| Sombras | `shadow-card`, `shadow-overlay` |
| Espaciado | `p-page`, `gap-section` |
| Tipografía | `font-sans` (Inter) |

Prohibido: colores hex en JSX, `style={{ color: ... }}` para temas, tamaños de fuente fuera de la escala de Tailwind, espaciados arbitrarios (`mt-[13px]`) y nuevos tokens sin actualizar el design system.

Clases CSS de comportamiento ya existentes: `apex-page-shell`, `apex-section-card`, `apex-standard-table*`, `apex-select`, `apex-cell`, `apex-primary-action`, `apex-secondary-action`, `apex-eyebrow`, `apex-dense-actions`, `apex-workspace-shell`, `apex-virtual-row`.

## 3. Catálogo de primitivas

| Patrón | Primitiva canónica | Import | Cuándo usarla | Alternativa prohibida |
|---|---|---|---|---|
| Acción de módulo | `ActionCard` | `@/components/ui/ActionCard` | Landings y accesos principales | Tarjetas decorativas sin acción |
| Contenedor de sección | `Card`, `CardHeader`, `CardBody` | `@/components/ui/card` | Bloques de contenido | `div` con borde y sombra propios |
| Diálogo | `ModalFrame` | `@/components/ui/ModalFrame` | Crear, editar, confirmar, historial | Modal propio con `fixed inset-0` |
| Panel lateral | `Drawer` | `@/components/ui/drawer` | Detalle rápido sin perder contexto | Modal para todo |
| Tabla simple | `DataTable` | `@/components/ui/data-table` | Tablas de una sola vista sin selección | `<table>` con estilos propios |
| Tabla de registros | `SmartDataTable` + `DataColumn` | `@/components/ui/data-table` | Listados con orden, columnas, paginación y selección | Listado con `map` de tarjetas |
| Botón | `Button` (`primary`, `secondary`, `ghost`, `danger`; `compact`, `default`, `touch`) | `@/components/ui/button` | Toda acción | `<button>` con clases ad hoc |
| Campos | `Input`, `Select`, `Textarea` | `@/components/ui/form-controls` | Formularios con label, hint y error | Inputs sueltos sin label |
| Rejilla y secciones de formulario | `FormGrid`, `FormSection`, `StepIndicator` | `@/components/ui/layout` | Formularios largos y asistentes | Tarjetas apiladas con campos solapados |
| Pestañas | `TabsList`, `TabLink`, `TabButton` | `@/components/ui/tabs` | Navegación interna | Menús propios |
| Feedback | `Badge`, `Alert`, `Skeleton`, `EmptyState` | `@/components/ui/feedback` | Estados, errores, vacíos y carga | Texto plano sin estado |
| Números editables | `ZeroFriendlyNumberInput` | `@/components/ui/ZeroFriendlyNumberInput` | Valores numéricos con cero amigable | `type="number"` con ceros forzados |
| Selects nativos | clase `apex-select` | `apps/web/app/globals.css` | Popup tematizado | `<select>` sin `apex-select` |

Regla: si una pantalla necesita una primitiva que no existe, primero se propone, se agrega a este catálogo y se implementa como componente compartido. No se crea un componente local que duplique uno existente.

## 4. Pantallas de referencia

Se copia el patrón, no el código completo:

| Patrón | Referencia | Qué homologar |
|---|---|---|
| Landing de módulo | `apps/web/app/dashboard/gastos-menores/page.tsx`; `apps/web/app/dashboard/transporte/page.tsx` | Encabezado, KPIs, `ActionCard`, accesos |
| Listado con modal | `apps/web/app/dashboard/comercio/clientes/page.tsx`; `apps/web/app/dashboard/comercio/productos/page.tsx` | `SmartDataTable`, toolbar, `ModalFrame`, `Button` |
| Formulario de creación | `apps/web/app/dashboard/inventario/productos/nuevo/page.tsx`; `apps/web/app/dashboard/ventas/ordenes/nueva/page.tsx` | `FormGrid`, `FormSection`, validación y botones |
| Espacio de trabajo operativo | `apps/web/components/gastos-menores/GastosMenoresWorkspace.tsx` | Navegación interna, filtros y estados |
| Detalle dentro del listado | `apps/web/app/dashboard/comercio/clientes/page.tsx` | Abrir por el dato, un solo botón de regreso |

Si la pantalla de referencia no cubre el caso, se elige la más cercana y se documenta la diferencia. No se usa una pantalla con tablas crudas como referencia.

## 5. Checklist de homologación

Antes:

- [ ] Identificar la pantalla de referencia del mismo patrón.
- [ ] Listar las primitivas que se van a usar; si falta una, justificarlo.
- [ ] Verificar que el flujo reutiliza la tubería existente y no crea una vista paralela.

Durante:

- [ ] Encabezado compacto con título, contexto y acción principal.
- [ ] KPIs y acciones con las mismas jerarquías que la referencia.
- [ ] Tablas con `SmartDataTable`/`DataTable`; sin `<table>` nuevo.
- [ ] Modales con `ModalFrame`; formularios con `form-controls` y `layout`.
- [ ] Estados vacío, carga y error con `feedback`.
- [ ] Tokens oficiales; cero hex y cero espaciados arbitrarios.
- [ ] Selects con `apex-select`; foco de celdas con `apex-cell`.
- [ ] Ambos temas y móvil (objetivos táctiles, una mano).

Después:

- [ ] Captura en tema claro y oscuro.
- [ ] Comparación lado a lado con la pantalla de referencia.
- [ ] `npm run lint`, typecheck y build.
- [ ] `npm run verify:web-assets` cuando aplique.
- [ ] Declarar si no se pudo probar en navegador.

## 6. Prohibiciones con evidencia

- 269 colores hex hardcodeados en `apps/web/app` y `apps/web/components`; varios fuera de la paleta (`#146C63`, `#31d7c5`). No se agregan más.
- 93 archivos con `<table>` propio frente a 8 que importan `DataTable`. Las pantallas nuevas no engordan esa cifra.
- Modales propios en lugar de `ModalFrame`, y `<select>` sin `apex-select`.
- `dark:` de Tailwind responde a `prefers-color-scheme`, no al tema de la app; para el tema usar clases acopladas a `html.dark` (`apex-cell`).
- Vistas duplicadas del mismo concepto, tarjetas apiladas con campos solapados y más de un botón de regreso al módulo padre.

## 7. Cómo agregar un patrón

1. Verificar que no existe en este catálogo.
2. Proponer la primitiva y su API mínima.
3. Agregarla como componente compartido en `apps/web/components/ui/`.
4. Documentarla en este catálogo y en el estándar correspondiente.
5. Usarla en una pantalla de referencia y capturar evidencia.
