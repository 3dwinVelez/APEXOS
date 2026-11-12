# Auditoría visual APEX OS — capa visual homologada

Fecha: 2026-11-12 · Rama: `desarrollo` · Ámbito: presentación (estilos, componentes, textos y estructura visual). Cero cambios de lógica, cálculos, validaciones, endpoints, stores, rutas, permisos, nombres de campos, valores enviados al backend ni IDs.

## 1. Método y evidencia

- Navegador real (Microsoft Edge headless) con sesión `demo@apex.local` sobre `http://127.0.0.1:3001` y API local en `http://127.0.0.1:3000`.
- 13 hubs + 3 formularios capturados antes y después a 1440 px, 980 px y 390 px (formularios también en tema oscuro).
- Evidencia versionada en `docs/qa/evidence/visual-homologation-20261112/`:
  - `before-*` (35 capturas) + `before-metrics.json`
  - `after-*` (35 capturas) + `after-metrics.json`
  - `after-nueva-ov-select-open-1440.png`, `after-agendar-visita-modal-1440.png` (selector abierto y modal de visita)
  - `after-payloads.json` (payloads reales de los tres formularios, con POST interceptados: no se creó ningún registro)
- Mediciones: desbordamiento horizontal, selects nativos visibles, selectores de búsqueda, tablas, `h1` y errores de consola por pantalla.

### Resultado medido

| Métrica | Antes | Después |
|---|---|---|
| Capturas | 35 | 35 |
| Desbordamiento horizontal (>0 px) | 0 | 0 (1440/980/390) |
| Selects nativos en Nueva OV | 2 | 0 |
| Selects nativos en Agendar visita | 4 | 0 |
| Selects nativos en hub Gestión Comercial | 3 | 3 (pendiente) |
| Selects nativos en Servicios | 6 | 6 (pendiente) |
| Selects nativos en Administración | 2 | 2 (pendiente) |
| Firmas de error de consola | 404, CSP Supabase 54321, ws colaboración, 429 transitorio | Las mismas sin el 429; ninguna firma nueva |

## 2. Hallazgos por categoría

### 2.1 Colores, tipografía y superficies (tokens)

- El proyecto ya centraliza tokens en `app/globals.css` (`--color-ink/paper/line/apex`, `--surface*`, `--text-*`, `--radius-*`, `--shadow-*`) y remapea en oscuro las literales más usadas (`html.dark .bg-white`, `html.dark .text-neutral-*`). Por eso este bloque no reescribe la paleta de 113 archivos: corrige las superficies que quedaban fuera del remapeo.
- `.control` fijaba `background: white` y no heredaba `color`; en oscuro pintaba un control claro con texto claro. Corregido a `rgb(var(--surface))` + `rgb(var(--text-strong))`.
- Estados del shell (`RouteAccessGuard`, `DashboardChrome`, `WorkspaceError`) usaban rojo/neutro literal; pasaron a `bg-surface`, `border-line`, `text-content-*`, `bg-error/10`, `text-error-ink` y `rounded-card/control`.
- Riesgo abierto: siguen existiendo hex y literales en pantallas de módulos (inventario de 269 hex previo del catálogo). No se tocaron para no alterar contraste ni jerarquía sin revisión visual pantalla por pantalla.

### 2.2 Botones y jerarquía de acciones

- La jerarquía se conserva: un solo botón primario por pantalla (`Button`/`buttonClasses`/`apex-primary-action`), secundarios con borde y acciones terciarias en texto.
- No se crearon variantes nuevas. No se eliminaron acciones salvo el atajo duplicado confirmado idéntico (ver 2.7).
- Los botones de formulario mantienen tamaño (`h-10`), foco visible y estado `disabled`; el alta de OV sigue deshabilitada hasta tener cliente, producto y cantidad.

### 2.3 Selectores

- Se creó la primitiva canónica `SearchSelect` (`apps/web/components/ui/search-select.tsx`) con comparador puro `lib/selectMatch.ts`:
  - Búsqueda por texto, palabras e iniciales, sin tildes ni mayúsculas; estado vacío con texto humano.
  - Teclado: Enter/Arrow/ Escape, `role="combobox"` + `listbox` en portal, seguimiento de scroll y resize, `aria-activedescendant`.
  - El `<select>` nativo permanece en el DOM, `sr-only`, con `name`, `required`, `FormData` y validación. Al elegir se asigna `node.value` y se despacha `change` con burbujeo: el `onChange` y el payload no cambian.
  - Lista y campo usan tokens (`bg-surface`, `border-line`, `bg-apex/10`, `text-apex-ink`); nunca muestran IDs internos, solo el texto de cada opción.
- `components/transport/TransportSearchSelect.tsx` se convirtió en alias de la primitiva. Los 24 consumidores existentes (y el alias de inventario) siguen funcionando con el mismo import y las mismas props.
- Migrados en esta intervención: Nueva orden de venta (2 selects), Agenda de visitas (4 selects del formulario y filtros). El resto queda inventariado para fases siguientes.

### 2.4 Tablas

- Se mantiene el patrón existente (`DataTable`/`SmartDataTable` + toolbar con búsqueda, filtros, columnas y paginación).
- Se corrigió solo el texto de paginación del componente compartido: `aria-label="Paginación"` y `Página {page} de {total}`.
- No se convirtieron tablas crudas: hay 92 archivos con `<table>` fuera del componente compartido; convertirlos exige revisar toolbar, selección y paginación caso por caso (ver pendientes).

### 2.5 Estados de espera, vacío y error

- El estado "Validando permisos" se resolvió **solo visualmente**:
  - `RouteAccessGuard`: tarjeta `rounded-card` con `Skeleton` y tokens en vez de caja `bg-white`.
  - `DashboardChrome`: mientras se valida el perfil se muestra un esqueleto de página (`aria-busy`, texto accesible "Validando perfil de acceso…") en lugar de una línea de texto suelta.
  - No se tocó la lógica de validación ni el orden de los gates.
- Estados vacíos y de error usan `feedback`/tokens; el error del lobby perdió el rojo literal (`bg-red-50`, `text-red-800`) por `bg-error/10`, `text-error-ink` y botón `bg-error`.

### 2.6 Campos de formulario

- Patrón visible: etiqueta arriba, marca de requerido (`*` en `text-error`), ayuda o error debajo, error anunciado con `role="alert"`.
- Los formularios migrados conservan sus campos y validaciones exactas; solo cambió el control visible de los selects.
- `SearchSelect` acepta `label`, `hint` y `error`, así que reemplaza selects sueltos sin inventar estructura nueva.

### 2.7 Redundancias y acciones duplicadas

- **Gestión Comercial**: "Ver agenda" (encabezado) y "Abrir calendario" (tarjeta inferior) apuntaban al mismo `href` (`/dashboard/gestion-comercial/agenda?calendario=1`). Confirmado como atajo idéntico: se dejó un único acceso visible ("Ver agenda", CTA primario del encabezado) y se retiró el enlace inferior conservando el bloque informativo. "Agendar visita" (`?crear=1`) es una acción distinta y se mantiene.
- **Ventas**: el hub ya expone un solo acceso "Nueva orden"; no existe duplicado "Nueva" en producto. Sin cambios.
- **"Mi cuenta" repetido**: el círculo "N" que aparece sobre la barra inferior en las capturas es el indicador de desarrollo de Next.js, no un segundo control de producto. La sesión tiene un único botón "Mi cuenta" (versión completa y compacta se excluyen por breakpoint). Documentado, sin eliminar nada.

### 2.8 Textos visibles corregidos

Todos los cambios de texto aplicados (tildes, concordancia y sentence case; sin cambiar términos de negocio):

| Archivo | Antes | Después |
|---|---|---|
| `app/dashboard/inventario/productos/nuevo/page.tsx` | Configuracion operativa | Configuración operativa |
| `app/dashboard/administracion/page.tsx` | Configuracion y gobierno | Configuración y gobierno |
| `app/dashboard/administracion/page.tsx` | Administracion APEX | Administración APEX |
| `app/dashboard/administracion/suscripciones/page.tsx` | Validando permisos de administracion de plataforma... | Validando permisos de administración de plataforma... |
| `app/dashboard/administracion/suscripciones/page.tsx` | Volver a Administracion | Volver a Administración |
| `app/dashboard/administracion/suscripciones/page.tsx` | Empresas y suscripciones es solo para superadmin | Empresas y suscripciones son solo para superadmin |
| `app/dashboard/administracion/suscripciones/page.tsx` | ...desde Administracion APEX. La creacion y configuracion global... | ...desde Administración APEX. La creación y configuración global... |
| `app/dashboard/servicios/page.tsx` | Perfil tecnico operativo | Perfil técnico operativo |
| `app/dashboard/servicios/page.tsx` | M-26 · Operacion de campo | M-26 · Operación de campo |
| `app/dashboard/servicios/page.tsx` | Ordenes listas para gestionar | Órdenes listas para gestionar |
| `app/dashboard/servicios/page.tsx` | La consulta devolvio advertencias | La consulta devolvió advertencias |
| `app/dashboard/servicios/page.tsx` | Que debes atender primero | Qué debes atender primero |
| `app/dashboard/servicios/page.tsx` | Atencion prioritaria | Atención prioritaria |
| `app/dashboard/servicios/page.tsx` | ...solicitud(es) publica(s)... referencia o tecnico... a operacion. | ...solicitud(es) pública(s)... referencia o técnico... a operación. |
| `app/dashboard/servicios/page.tsx` | Consulta de ordenes | Consulta de órdenes |
| `components/shell/Sidebar.tsx` | Limpiar busqueda (aria) | Limpiar búsqueda |
| `components/shell/Sidebar.tsx` | No hay modulos disponibles para esta busqueda. | No hay módulos disponibles para esta búsqueda. |
| `components/shell/UserSessionBadge.tsx` | Sesion no identificada | Sesión no identificada |
| `components/shell/UserSessionBadge.tsx` | Cerrar sesion | Cerrar sesión |
| `components/shell/UserSessionBadge.tsx` | Sesion activa | Sesión activa |
| `components/shell/TechnicianWorkspaceHeader.tsx` | Cerrar sesion (aria) | Cerrar sesión |
| `components/shell/RouteAccessGuard.tsx` | este modulo (respaldo) | este módulo |
| `components/system/PlatformAlerts.tsx` | Operacion interrumpida / Se detecto... detalle tecnico para diagnostico. | Operación interrumpida / Se detectó... detalle técnico para diagnóstico. |
| `components/system/PlatformAlerts.tsx` | La pantalla detecto un fallo y evito bloquear la operacion actual. | La pantalla detectó un fallo y evitó bloquear la operación actual. |
| `components/system/PlatformAlerts.tsx` | Cerrar notificacion (aria/title) | Cerrar notificación |
| `components/ui/data-table.tsx` | Paginacion / Pagina {page} de {total} | Paginación / Página {page} de {total} |
| `components/shell/DashboardChrome.tsx` | Validando perfil de acceso... | Validando perfil de acceso… (texto accesible bajo esqueleto) |

Pruebas actualizadas para fijar la copia corregida (no se relajó ninguna aserción): `test/comercio-ux-consistency.test.mjs`, `test/service-monitor-live-refresh.test.mjs`, `test/transport-theme.test.mjs`, `test/transport-search-select.test.mjs`.

### 2.9 Estructura visual

- Lobby: la rejilla de "Acciones frecuentes" pasó de 6 a 3 columnas en pantallas grandes (y su esqueleto de carga quedó en sincronía), para que las descripciones no se trunquen a 1440 px.
- No se movieron secciones, no se ocultaron datos y no se cambió el orden de lectura.

## 3. Payloads verificados (sin crear registros)

`after-payloads.json` guarda los cuerpos reales emitidos por los formularios tras interactuar con el nuevo selector (POST interceptados y respondidos en el navegador; la base local no recibió escrituras):

- Nueva orden de venta: `{"customer_id":987654,"lines":[{"item_id":3,"qty":1,"unit_price":95000}]}` — IDs numéricos tomados del valor de la opción, precio autocompletado desde el producto.
- Agendar visita (disponibilidad y creación): `{"advisor_id":222,...}` y `{"customer_id":111,"reason_id":444,"visit_date":"...","duration_minutes":60,"visit_type":"PHONE","notes":""}`.
- Nuevo producto: payload completo sin cambios (`name`, `type`, `unit`, `family_code`, `society_code`, `branch_code`, `costing_method`, `tax_rate`, `metadata{...}`).

## 4. Pendientes (decisiones humanas o fases siguientes)

1. **Migrar los selects restantes a `SearchSelect`**: 69 archivos con `<select>` fuera de la primitiva. Prioridad visible: Servicios (6), hub Gestión Comercial (3), Administración (2). Requiere revisar caso por caso para no alterar `onChange` ni payloads.
2. **Tablas crudas**: 92 archivos con `<table>` fuera de `DataTable`/`SmartDataTable`. Convertirlas implica toolbar, columnas y paginación; se propone por módulo, con certificación de navegador.
3. **Barrido de tildes del resto del portafolio**: solo se corrigieron los hubs y el shell. Quedan textos menores en pantallas internas (inventario, transporte, contabilidad, comercio, TH).
4. **Datos de demostración sin tilde**: `administracion/page.tsx` siembra áreas/centros de costo "Operacion"/"Administracion". Se dejaron igual porque son valores de catálogo que viajan al backend; corregirlos exige migración de datos, no un cambio visual.
5. **Agenda · conteo inconsistente**: la tarjeta "Programación del período" muestra "1 registros" con "0 eventos" y "No hay eventos para los filtros seleccionados". Es lógica de conteo/datos, no presentación; no se tocó.
6. **Gastos Menores a 980 px**: aparece brevemente "Acceso no autorizado" antes de hidratar (entitlement/suscripción). Es comportamiento de permisos; no se tocó.
7. **Errores de consola preexistentes**: CSP contra `localhost:54321` (Supabase local ausente), `ws://localhost:3000/collaboration/live` y un 404 de recurso. Ajenos a esta capa; se documentan para no confundirlos con regresiones.
8. **Datos locales escasos**: la base local no tiene clientes de venta, asesores ni motivos de visita; por eso las capturas muestran selects vacíos. La verificación de payloads se hizo con maestros simulados en el navegador (sin persistencia).

## 5. Pantallas revisadas

| Pantalla | 1440 | 980 | 390 |
|---|---|---|---|
| Lobby (`/dashboard`) | ✔ | ✔ | — |
| Inventario | ✔ | ✔ | — |
| Compras | ✔ | ✔ | — |
| Ventas | ✔ | ✔ | — |
| Gestión Comercial | ✔ | ✔ | — |
| Comercio | ✔ | ✔ | — |
| Contabilidad | ✔ | ✔ | — |
| Transporte | ✔ | ✔ | — |
| Talento Humano | ✔ | ✔ | — |
| Servicios | ✔ | ✔ | — |
| Apex Heart / Reportes | ✔ | ✔ | — |
| Administración | ✔ | ✔ | — |
| Gastos Menores | ✔ | ✔ | — |
| Nuevo producto (claro/oscuro) | ✔ | — | ✔ |
| Nueva orden de venta (claro/oscuro) | ✔ | — | ✔ |
| Agendar visita / modal (claro/oscuro) | ✔ | — | ✔ |

## 6. Validaciones ejecutadas

- `node --experimental-strip-types --test test/*.test.mjs` → 704/704 en verde (incluye `search-select-contract.test.mjs`).
- `npm run typecheck` → sin errores.
- `npm run lint` → 0 errores, 22 advertencias preexistentes.
- `npm run build` (`next build`) → compila y prerenderiza sin errores (exit 0).

## 7. Lo que no se tocó por seguridad funcional

- Cálculos, validaciones, payloads, endpoints, stores, hooks de datos, rutas, permisos, nombres de campos e IDs.
- No se eliminó ninguna acción salvo el atajo idéntico confirmado en Gestión Comercial.
- No se añadieron ni quitaron campos de formulario.
- No se introdujeron librerías: todo se apoya en Tailwind, tokens y primitivas existentes.
- No se convirtieron tablas ni selects fuera de los tres formularios nombrados.
