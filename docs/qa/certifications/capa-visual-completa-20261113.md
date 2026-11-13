# Certificación local de la capa visual completa — 2026-11-13

Cambio: `capa-visual-completa-20261113`
Promoción certificada: `desarrollo -> develop` (pre-QA). **No autoriza `main`**, ni promoción, ni despliegue.
Commit certificado: `beff513200abe22a29d05d25a586307d24487139`
Base del destino: `origin/develop` = `6589af8e1d3213b8f14b17877c8c5af5f9352f21`
Resultado funcional: **PASSED** — 100/100 comprobaciones, 34 capturas, 0 errores de consola y 0 errores HTTP.
Resultado de regresión: **PASSED** — typecheck 0, lint 0, suite web 801 pruebas con 4 fallos
preexistentes del baseline y 0 inesperados.

## Alcance certificado

El candidato es la reconstrucción de las 16 rondas visuales que viven en `desarrollo`, rebasada sobre
el tip vigente de `origin/develop`. Su diff contra `6589af8e` es exacto: **143 rutas (109 A / 34 M / 0 D)**,
sin eliminaciones.

| Grupo | Rutas | Contenido |
|---|---|---|
| `apps/web/app/**` | 12 | Lobby, ficha genérica, comercio, contabilidad, CxC (layout y raíz), `globals.css`, `layout.tsx` |
| `apps/web/components/**` | 15 | Chrome, barra lateral, navegación de contabilidad, `AccountingPyg`, herramientas de sistema, `ModalFrame`, `feedback` |
| `apps/web/lib/**` | 6 | Catálogo de módulos, portafolio, funciones, espacio de trabajo, assets del lobby |
| `apps/web/public/assets/lobby/**` | 34 | Banner de red e imágenes por módulo (conservadas) |
| `apps/web/test/**` | 15 | Contratos de portafolio, lobby, ambiente, operación visual y ajustes de suites |
| `docs/briefs/**` | 7 | Briefs de las rondas 1-14 |
| `docs/qa/evidence/lobby-v4-20261110/**` | 60 | Evidencia visual ya versionada de las rondas |

No viaja nada fuera de ese inventario: no hay `apps/api/**`, `apps/api/prisma/**`,
`apps/control-tower/**`, migraciones ni los commits funcionales de `desarrollo` ajenos a la capa visual.

## Qué se homologó

1. **Lobby V4 curado**: 12 tarjetas visibles (Inventario, Compras, Ventas, Contabilidad, Transporte,
   Talento Humano, Administración, Servicios, Gestión Comercial, Apex Heart, Gastos Menores, Comercio);
   20 slugs retirados de la oferta sin borrar su ficha; hero con banner de red, fondo ambiente y saludo
   del usuario; tarjetas con glyph lucide y sin franja fotográfica.
2. **Chrome sin asistente flotante**: el montaje de `AiExperienceLayer` sale del chrome; el componente
   permanece en disco y la prueba fija la ausencia.
3. **Tokens y superficies**: paleta V4, `.btn-secondary` legible en ambos temas, estados de error del
   lobby con tokens (`border-error/30`, `bg-error/10`, `text-error-ink`) y remapeo oscuro existente.
4. **Estados de espera homologados**: esqueleto de chrome con `aria-busy` y texto accesible; el guard
   conserva su contrato de permisos.
5. **`SearchSelect` sobre el select nativo**: combobox visible, listbox en portal, y el `<select>`
   oculto como autoridad de `name`, `required`, `FormData` y `change`.
6. **Ventana ampliada del PYG**: se conserva el modo sin barra lateral de `develop` y se certifica que
   la capa visual no lo reemplaza.

## Ambiente de ejecución

- Build de producción del candidato: `next build --webpack` (exit 0; Turbopack rechaza los enlaces
  externos del worktree aislado) y `next start -p 3002`.
- API local en `127.0.0.1:3000` contra PostgreSQL de `infra/docker-compose.yml` (puerto 55432); **no**
  es Supabase. Inquilino `demo@apex.local` (rol `APEX_ADMIN`) y sesión iniciada por la interfaz real.
- El cliente web llama `/api/v1/**` del API local; el origen `http://localhost:3002` está en
  `ALLOWED_ORIGINS`. Las lecturas viajan reales salvo maestros que el inquilino demo no tiene
  sembrados (clientes, asesores, zonas, motivos, resultados y ajustes comerciales), donde se sirve
  un fixture controlado **con cabecera CORS**.
- Las escrituras se interceptan en el navegador y se registran con su payload; nunca llegan a la base.
- Se sembró un producto sintético `RAW-001 · RAW MATERIAL HOMOLOGACION` en el inquilino demo para
  ejercer el catálogo real de productos; es dato local de certificación, no viaja en el candidato.
- Evidencia: `docs/qa/evidence/capa-visual-completa-20261113/` (JSON + 34 capturas).

## Comprobaciones funcionales (100/100)

- **Sesión real** — login por la interfaz (1).
- **Hubs del portafolio** — 13 hubs × 2 anchos (1440 y 980) × 3 comprobaciones (acceso coherente,
  sin desbordamiento, sin pantalla rota) = 78. Gastos Menores se certifica en su estado denegado
  canónico porque el inquilino demo no tiene `M-29`, idéntico al destino.
- **Lobby V4** — portafolio curado (12 tiles, 0 retirados ofrecidos), un icono por tarjeta, hero con
  banner cargado y fondo ambiente, y chrome sin asistente flotante (4).
- **Nueva orden de venta** — 0 selects nativos visibles, 2 combobox, listbox de clientes y de
  productos del API real, valor escrito en el select nativo, orden publicada, contrato del payload
  (`customer_id`, `lines[].item_id/qty/unit_price`), tema oscuro, móvil 390 y escenario de maestros
  vacíos sin escritura (11).
- **Agenda comercial** — diálogo real con `SearchSelect`, lista de clientes controlados y selección
  (3).
- **Producto nuevo** — pantalla sin rotura y móvil sin desbordamiento (2).
- **Consola** — sin errores de consola ni de red (1).

## Correcciones del arnés en esta intervención

La certificación chocó con tres causas de arnés y ninguna de producto; se corrigieron en el mismo
script (`scripts/certifications/visual-homologation-browser.cjs`):

1. **Espera de contenido**: tras resolver el guard, la pantalla puede seguir en esqueletos de acceso;
   el arnés ahora espera un `h1` con texto antes de medir.
2. **CORS en fixtures**: las respuestas interceptadas no llevaban `Access-Control-Allow-Origin`
   (web en 3002, API en 3000) y el navegador descartaba el maestro; ahora la cabecera se emite.
3. **Imagen del hero**: `currentSrc` se consultaba antes de que el `<img>` resolviera su fuente;
   ahora se espera `complete && naturalWidth > 0` y se valida el banner cargado. Se verificó además
   que un trabajo de optimización colgado en el servidor local (petición abortada) bloquea esa clave
   de caché; reiniciar el servidor la libera y una petición fresca tarda ~0,5 s.

## Invariantes del candidato

- `5cb3d665` (certificación previa sobre `8ba301c0`) quedó obsoleto al adelantarse `origin/develop`;
  se rebasó a `beff5132` y se repitieron build, certificación y regresión. La evidencia corresponde al
  commit rebasado.
- `origin/develop` incorporó el cambio de talento humano (`6589af8e`, búsqueda por documento en
  liquidación). No comparte rutas con este inventario y no se modificó.
- El candado de promoción exige fast-forward: `beff5132` desciende de `6589af8e`.

## Despliegue a QA y smoke del build real (2026-11-13)

- **Promoción:** `6589af8e..beff5132` fast-forward en `develop`; árbol desplegado
  `3d697a24…`, idéntico al certificado; 143 archivos (109 A / 34 M / 0 D).
- **Web QA:** deployment `4c8dbc1d` en `SUCCESS` sobre `beff5132`.
- **API QA:** sin redespliegue; `/health` conserva `commit: 6589af8e1d32`; sin migraciones.
- **Smoke:** `scripts/certifications/visual-homologation-qa-smoke.cjs` con **29 verificaciones y 5
  capturas** en `docs/qa/evidence/capa-visual-completa-qa-20261113/`: el lobby V4 muestra su hero
  cargado y sus 8 tarjetas curadas con glifo, sin tarjetas retiradas ni asistente flotante; el tema
  oscuro remapea la superficie de la tarjeta (`255,255,255` → `23,35,45`); Nueva orden de venta
  conserva 2 `combobox`, 2 `<select aria-hidden>` y 0 selects nativos visibles; 8 hubs accesibles sin
  desbordamiento y 4 denegaciones por licencia canónicas; 0 errores nuevos de consola y de red.
- **Sigue en manos de QA:** persistencia real de las escrituras.
