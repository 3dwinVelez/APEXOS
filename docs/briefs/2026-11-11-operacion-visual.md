# Brief — Operación visual: gráficos, tablas y estados vacíos

- **ID**: `2026-11-11-operacion-visual`
- **Fecha**: `2026-11-11`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "como en esta parte solo estamos atacando la parte visual procede con intervenir y mejorar la puentuacion en cuanto capa visual" · (contexto: tabla comparativa de calificación visual entregada el mismo día)

## 0. Naturaleza del commit — contenedor de capa visual exclusiva

Igual que las rondas 6 y 7 (`dbc78e36`, `56aa28bb`), el commit de esta ronda se define, se
certifica y se promueve como **contenedor de capa visual exclusiva**. Esta sección manda sobre
cualquier lectura posterior del diff.

- **Inventario esperado**: solo presentación web —`apps/web/app/globals.css`,
  `apps/web/components/accounting/AccountingPyg.tsx`,
  `apps/web/app/dashboard/comercio/ComercioCharts.tsx`, `apps/web/components/ui/feedback.tsx` y
  `apps/web/test/visual-operation.test.mjs`—, documentación y evidencia (`docs/briefs/**`,
  `docs/qa/evidence/lobby-v4-20261110/**`) y espejos de agentes (`.qoder/skills/**`, `agents/**`).
- **Cero rutas funcionales**: ningún archivo en `apps/api/**`, `apps/api/prisma/**` ni
  `apps/control-tower/**`. Sin endpoints, esquema, migraciones, colas, telemetría, autenticación,
  RBAC ni aislamiento multi-tenant. En los tres archivos de componente solo cambia `className`: la
  misma caja, los mismos datos, la misma conducta. `feedback.tsx` retira la utilidad
  `text-apex` del envoltorio del icono porque la regla de token del estado vacío ya pinta el color
  en claro y oscuro; el icono sigue siendo el mismo `ReactNode`.
- **Verificación funcional de no-regresión**: suite web completa **689/689** y `typecheck` sin
  hallazgos; la API no se tocó.
- **Regla de promoción**: los manifiestos futuros deben declarar el paquete como capa visual
  exclusiva (`change_intent.modules: web-operation, agentes-equipo`) con inventario A/M/D exacto;
  una ruta funcional dentro del diff rechaza el paquete y lo reconstruye.

## 1. Objetivo

Subir la nota de la capa visual de la operación —no del negocio— cerrando los tres huecos que la
tabla comparativa del 2026-11-11 dejó abiertos, sin tocar una sola ruta funcional:

1. **Gráficos con piel de producto (5/10).** Los SVG de Recharts heredaban colores por atributo de
   presentación: rejilla y ejes casi invisibles en oscuro y ticks sin jerarquía. Se viste por CSS
   sobre las clases reales de Recharts, con tokens de ambos temas.
2. **Tablas densas con lectura de tablero (6/10).** El encabezado estándar repetía el peso del
   cuerpo. Ahora es un rótulo (11 px, mayúsculas, `0.06em`, tinta apagada), las cifras usan
   `tabular-nums`, la primera columna se afirma como identidad y el hover es tinte de marca.
3. **Estados vacíos y de error con oficio.** `EmptyState` era una línea de texto entre bordes: pasa
   a bloque punteado con degradado tenue y anillo de marca en el icono, re-tematizado por token y
   plano en alto contraste.

**Medición que abre la ronda**: `evidence-operation-metrics.json` del servidor local real (claro y
oscuro, 1440×1000) — 3 tarjetas de gráfico con tick `rgb(155 170 178)` y rejilla
`rgba(45 212 191 / 0.1)` en oscuro; tabla de 24 filas con encabezado `uppercase`, `0.66px`, `11px`
y cifras `tabular-nums`; estado vacío con borde `dashed`, degradado y anillo
`rgba(45 212 191 / 0.07)`; desbordamiento horizontal `0` en todas las vistas.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/globals.css` | Sección «Operación: gráficos, tablas y estados»: piel de Recharts (rejilla, ejes, ticks, leyenda, cursor de tooltip), rótulo y cifras de `.apex-standard-table`, hover de fila, viewport oscuro, y `.apex-empty`/`.apex-empty-icon` en claro, oscuro y alto contraste |
| `M` | `apps/web/components/accounting/AccountingPyg.tsx` | Clase marcadora `apex-chart-card` en el contenedor del gráfico de resultado por sección (solo `className`) |
| `M` | `apps/web/app/dashboard/comercio/ComercioCharts.tsx` | Clase marcadora `apex-chart-card` en `ChartShell` (solo `className`) |
| `M` | `apps/web/components/ui/feedback.tsx` | Clases marcadoras `apex-empty` en la raíz y `apex-empty-icon` en el envoltorio del icono; se retira `text-apex`, que la regla de token reemplaza |
| `A` | `apps/web/test/visual-operation.test.mjs` | 4 pruebas de contrato: piel de gráficos sin propiedades de caja, marcador en ambos gráficos, tabla (rótulo, cifras, hover, oscuro) y estado vacío (borde, degradado, anillo, color oscuro, alto contraste) |
| `A` | `docs/qa/evidence/lobby-v4-20261110/evidence-operation-charts-{light,dark}.png`, `evidence-operation-table-{light,dark}.png`, `evidence-operation-empty-{light,dark}.png`, `evidence-operation-metrics.json` | Capturas CDP del entorno local y métricas medidas por vista |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 8 |
| `A` | `docs/briefs/2026-11-11-operacion-visual.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de los agentes requeridos y entrada de la intervención |

### Módulos (`change_intent.modules`)

- `web-operation`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- `apps/api/**`, `apps/api/prisma/**` y `apps/control-tower/**`: sin cambios.
- Datos, consultas, filtros, permisos y navegación: intactos. Los gráficos y tablas conservan sus
  series, columnas y recuentos; solo cambia cómo se pintan.
- Librerías nuevas: ninguna. Recharts y Tailwind ya estaban; la piel es CSS puro.
- Animaciones: ninguna nueva; todo estático.
- Login, lobby y páginas públicas: sin cambios.
- Promoción a `develop`/`main`, despliegues, migraciones remotas e infraestructura: requieren
  autorización explícita e independiente.
- `.tmp/` y `vibe_images/`: herramientas locales, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`,
  `main`, force push, merge, deploy y migración remota.
- La piel no puede mover la caja: prohibido `width|height|margin|padding|top|left|position` en las
  reglas de gráfico (la prueba lo afirma por texto de la regla).
- Alto contraste restaura superficies planas: rejilla a línea plena, hover sin tinte, estado vacío
  sin degradado.
- Sin secretos ni credenciales en el diff.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **689/689** en verde.
2. `node --test test/visual-operation.test.mjs` → **4/4**.
3. `npx tsc --noEmit` sin hallazgos.
4. Métricas CDP (`evidence-operation-metrics.json`): en oscuro tick
   `rgb(155, 170, 178)` y rejilla `rgba(45, 212, 191, 0.1)`; 3 tarjetas de gráfico de
   `1134x300`; tabla con `uppercase` / `0.66px` / `11px` y `tabular-nums` en ambos temas; estado
   vacío con `border: dashed`, degradado `rgba(45, 212, 191, 0.05)`, anillo
   `rgba(45, 212, 191, 0.07)` y icono `rgb(153, 246, 228)` en oscuro; desbordamiento horizontal
   `0` en las seis vistas.
5. Las capturas muestran sesión real (`demo@apex.local`, «Sesión activa»), no pantallas de acceso
   denegado.

## 6. Evidencia y certificación exigida

- Pruebas: suite web **689/689** y `visual-operation.test.mjs` **4/4**.
- Evidencia: `docs/qa/evidence/lobby-v4-20261110/evidence-operation-*.png` y
  `evidence-operation-metrics.json`; ronda 8 en `validacion.md`.
- Capturas contra el entorno local real (API `127.0.0.1:3000`, vista `127.0.0.1:3001`), con login
  verificado antes de navegar: la primera captura del estado vacío devolvió una pantalla de
  «Acceso no autorizado» por una corrida sin contexto de rol y se descartó; la válida se volvió a
  tomar con side bar y sesión activa.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Datos y negocio** — series, columnas, recuentos y filtros no cambian; la API no se toca.
- **Legibilidad** — contraste de ticks y rótulos medido en el DOM en ambos temas.
- **Layout** — cero cambios de caja; desbordamiento horizontal `0` en las seis vistas.
- **Accesibilidad** — alto contraste restaura rejilla plena, hover neutro y estado vacío plano.
- **Rendimiento** — solo CSS estático; sin JS, sin animación, sin peticiones nuevas.

## 8. Riesgos y rollback

- Riesgo: que la piel de Recharts dependa de un cambio de librería → Mitigación: selectores sobre
  clases públicas de Recharts y prueba de contrato; si la librería cambia, la prueba cae antes que
  la pantalla. Rollback: revert del commit.
- Riesgo: que el `!important` heredado del tema oscuro (`html.dark .text-apex`) gane sobre el color
  del icono → Medido: el icono quedó en `rgb(153, 246, 228)`; la utilidad retirada ya no compite.
  Rollback: revert del commit.
- Riesgo: que el hover de fila reste legibilidad → Mitigación: tinte al 6 % y alto contraste sin
  tinte. Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: la tabla estándar la mejora `StandardTableExperience` en tiempo de ejecución; las
  reglas se anclan a esa clase para no crear una segunda variante de tabla.
- Supuesto: el tooltip de Recharts se pinta con estilo inline y queda fuera de esta ronda; la piel
  cubre ejes, rejilla, leyenda y cursor.
- Pregunta abierta: el dueño aún no ha visto la ronda 8 en su pantalla; falta su aprobación visual.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (pedido del dueño de intervenir la capa visual).
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ruteo
  `apexos-frontend`, `apexos-qa` (apps/web y docs/qa) y `equipo-apexos` (docs/briefs).
- **Agentes consultados**: `apexos-frontend`, `apexos-qa`, `equipo-apexos`.
- **Documentación actualizada**: este brief y `docs/qa/evidence/lobby-v4-20261110/validacion.md`
  (ronda 8).
- **Agentes actualizados**: bumps de cierre en el mismo commit (`apexos-frontend`,
  `apexos-qa`, `equipo-apexos`, `apexos-brief`).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` actualizados en el mismo commit.
- **Cobertura de contexto**: `npm run agents:coverage` en verde para las rutas tocadas.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage`
  → pruebas → commit → `git push origin desarrollo`.
- **Publicación**: `git push origin desarrollo` con pruebas verdes y sin secretos ni artefactos.
