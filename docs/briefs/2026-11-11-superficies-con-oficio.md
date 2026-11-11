# Brief — Superficies con oficio: el fondo deja de leerse apagado

- **ID**: `2026-11-11-superficies-con-oficio`
- **Fecha**: `2026-11-11`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "continuando con esta intervencion termina de brindarme una propuesta para el fondo de la herramienta y que esta no este tan apagada" · (elección del dueño: «Superficies con oficio»)

## 0. Naturaleza del commit — contenedor de capa visual exclusiva

Al igual que el commit `dbc78e36` (ronda 6, brief `2026-11-10-fondo-ambiente-v4.md`), el commit de
esta ronda se define, se certifica y se promueve como **contenedor de capa visual exclusiva**: no
altera ningún proceso funcional de la herramienta. Esta sección manda sobre cualquier lectura
posterior del diff.

- **Inventario esperado**: solo presentación web —`apps/web/app/globals.css`,
  `apps/web/components/shell/Sidebar.tsx`, `apps/web/components/shell/DashboardChrome.tsx`,
  `apps/web/test/ambient-background.test.mjs`—, documentación y evidencia (`docs/briefs/**`,
  `docs/qa/evidence/lobby-v4-20261110/**`) y espejos de agentes (`.qoder/skills/**`, `agents/**`).
- **Cero rutas funcionales**: ningún archivo en `apps/api/**`, `apps/api/prisma/**` ni
  `apps/control-tower/**`. Sin lógica de negocio, endpoints, esquema, migraciones, colas,
  telemetría, autenticación, RBAC ni aislamiento multi-tenant. Los cambios en `Sidebar.tsx` y
  `DashboardChrome.tsx` agregan únicamente clases marcadoras al `className` existente: no cambian
  marcación, validación ni ningún flujo.
- **Verificación funcional de no-regresión**: suite web completa **680/680**, incluidas las pruebas
  funcionales existentes; la API no se tocó.
- **Regla de promoción**: los manifiestos futuros deben declarar el paquete como capa visual
  exclusiva (`change_intent.modules: web-shell, agentes-equipo`) con inventario A/M/D exacto; una
  ruta funcional dentro del diff rechaza el paquete y lo reconstruye.

## 1. Objetivo

Que la herramienta deje de leerse «apagada» en el tema oscuro sin sacrificar rendimiento ni
invadir el contenido, partiendo de un diagnóstico medido:

1. **El diagnóstico manda la palabra a las superficies.** Seis variantes de fondo simuladas por
   inyección temporal sobre el entorno local con muestreo de píxeles reales: subir las alfas del
   ambiente movió el papel visible ~1 unidad RGB (imperceptible) porque costado, barra y tarjetas
   son opacos por contrato. La palanca real es el oficio de esas superficies.
2. **Costado con gradiente opaco.** `aside.apex-chrome-sidebar`: degradado vertical de la misma
   familia cromática (`#182730` → `#0D161C`) y filo turquesa al 14%; sigue opaco, no translúcido.
3. **Barra superior trabajada.** Header real del panel de marcación: fondo cálido translúcido
   (`rgb(20 32 41 / 0.94)`) y línea inferior turquesa al 12%. Barra de herramientas del dashboard:
   filo inferior de 1 px turquesa al 10% a todo el ancho, sin banda de fondo.
4. **Tarjetas de sección elevadas.** `.apex-section-card`: en oscuro borde turquesa 14% + anillo
   1 px al 5% + sombra; en claro sombra suave neutra. Solo `box-shadow`/`border-color`: cero
   cambios de caja.
5. **Ambiente alzado donde asoma.** Alfas oscuras `0.13 / 0.22 / 0.13` (antes `0.10 / 0.18 / 0.10`)
   y grano claro `0.04` (antes `0.03`). Todo CSS estático: sin animación nueva, sin JS, sin red.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/globals.css` | Grano claro `0.03 → 0.04`; alfas oscuras `0.13 / 0.22 / 0.13`; sombra base en `.apex-section-card`; sección «Oficio del marco»: gradiente del costado, barra superior, filo de la barra de herramientas, halo+sombra de tarjeta en oscuro y restauración plana en alto contraste |
| `M` | `apps/web/components/shell/Sidebar.tsx` | Clase marcadora `apex-chrome-sidebar` en el `aside` (solo `className`) |
| `M` | `apps/web/components/shell/DashboardChrome.tsx` | Clase marcadora `apex-chrome-topbar` en el header de marcación y en la barra de herramientas del dashboard (solo `className`) |
| `M` | `apps/web/test/ambient-background.test.mjs` | Dos pruebas nuevas: intensidades fijadas por tema y contrato del marco sin layout shift; 9 pruebas en total |
| `A` | `docs/qa/evidence/lobby-v4-20261110/evidence-craft-desktop-{light,dark}.png`, `evidence-craft-module-{light,dark}.png`, `evidence-craft-module-card-dark.png`, `evidence-craft-mobile-dark.png`, `evidence-craft-commands-dark.png`, `evidence-craft-metrics.json` | Seis capturas CDP del entorno local y las métricas medidas por vista |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 7 |
| `A` | `docs/briefs/2026-11-11-superficies-con-oficio.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de los agentes requeridos y entrada de la intervención |

### Módulos (`change_intent.modules`)

- `web-shell`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- `apps/api/**`, `apps/api/prisma/**` y `apps/control-tower/**`: sin cambios.
- Contenido de los módulos: ninguna pantalla, tabla o formulario cambia su información.
- Animaciones nuevas: todo lo de esta ronda es CSS estático; la única animación del producto sigue
  siendo la deriva de la ronda 6 con sus mismas guardas.
- Login y páginas públicas: conservan su composición.
- Promoción a `develop`/`main`, despliegues, migraciones remotas e infraestructura: requieren
  autorización explícita e independiente.
- `vibe_images/` y `.tmp/`: herramientas locales, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`,
  `main`, force push, merge, deploy y migración remota.
- El oficio de las tarjetas no puede mover la caja: prohibido `width|height|margin|padding|
  border-width` en la regla (la prueba lo afirma).
- Alto contraste restaura superficies planas y quita sombras.
- Sin secretos ni credenciales en el diff.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **680/680** en verde.
2. `node --test test/ambient-background.test.mjs` → **9/9**, incluidas intensidades fijadas por
   tema y el contrato del marco sin layout shift.
3. Métricas CDP (`evidence-craft-metrics.json`): costado con `linear-gradient` y borde derecho
   `rgba(45, 212, 191, 0.14)` en oscuro; barra de herramientas con filo `rgba(45, 212, 191, 0.1)`;
   tarjeta con borde `rgba(45, 212, 191, 0.14)` y sombra de anillo; grano `0.04` claro / `0.06`
   oscuro; sin desbordamiento horizontal (1440/1440 y 390/390).
4. `npm --workspace apps/web run typecheck` sin hallazgos.
5. El tema claro no gana bandas de color: costado y barra planos, solo sombra suave de tarjeta.

## 6. Evidencia y certificación exigida

- Pruebas: suite web **680/680** y `ambient-background.test.mjs` **9/9**.
- Evidencia: `docs/qa/evidence/lobby-v4-20261110/evidence-craft-*.png` y
  `evidence-craft-metrics.json`; ronda 7 en `validacion.md`.
- Las capturas se toman contra el entorno local real (API `127.0.0.1:3000`, vista
  `127.0.0.1:3001`), no contra el arnés aislado.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Legibilidad del contenido** — las superficies siguen opacas; alto contraste restaura lo plano.
- **Rendimiento del cliente** — todo estático: sin animación nueva, sin JS, sin peticiones de red.
- **Accesibilidad visual** — alto contraste sin gradientes ni sombras.
- **Temas** — claro casi intacto (solo grano y sombra de tarjeta); oscuro gana el oficio.
- **Layout** — cero cambios de caja en tarjetas (afirmado por prueba).
- **Negocio** — ninguna ruta, dato, autorización ni módulo se altera.

## 8. Riesgos y rollback

- Riesgo: que el gradiente del costado reste legibilidad al texto de navegación → Mitigación:
  tonos de la misma familia cromática y contraste del texto sin cambiar; verificado en capturas.
  Rollback: revert del commit.
- Riesgo: que la sombra de tarjeta mueva layouts → Mitigación: solo `box-shadow`/`border-color`
  con prueba que prohíbe propiedades de caja. Rollback: revert del commit.
- Riesgo: que el alto contraste herede gradientes → Mitigación: regla explícita que restaura
  superficies planas y quita sombras, afirmada por prueba. Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: el dueño eligió la opción «Superficies con oficio» entre tres propuestas medidas; las
  variantes descartadas (solo ambiente reforzado, combinada audaz) quedan documentadas en la
  conversación y en la ronda 7 de `validacion.md`.
- Supuesto: la barra de herramientas del dashboard no es sticky; su filo inferior es decorativo y
  se desplaza con el contenido.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (elección del dueño entre las propuestas).
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ruteo
  `apexos-frontend`, `apexos-qa` (apps/web y docs/qa) y `equipo-apexos` (docs/briefs).
- **Agentes consultados**: `apexos-frontend`, `apexos-qa`, `equipo-apexos`.
- **Documentación actualizada**: este brief y `docs/qa/evidence/lobby-v4-20261110/validacion.md`
  (ronda 7).
- **Agentes actualizados**: pendiente de cierre (bumps en el mismo commit).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` actualizados en el mismo commit.
- **Cobertura de contexto**: `npm run agents:coverage` en verde para las rutas tocadas.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage`
  → pruebas → commit → `git push origin desarrollo`.
- **Publicación**: `git push origin desarrollo` con pruebas verdes y sin secretos ni artefactos.
