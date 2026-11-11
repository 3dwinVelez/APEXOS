# Brief — Saludo del hero con protagonismo del usuario

- **ID**: `2026-11-11-saludo-hero`
- **Fecha**: `2026-11-11`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "le peudes brindar mas protagnismo al usaurio que esta loguiado veo que la letra es algo pequeña" · (captura del hero del lobby con la píldora «Bienvenido, Demo · Demo APEX» marcada en rojo)

## 0. Naturaleza del commit — contenedor de capa visual exclusiva

Igual que las rondas 6, 7 y 8 (`dbc78e36`, `56aa28bb`, `5a0f505b`), el commit de esta ronda se
define, se certifica y se promueve como **contenedor de capa visual exclusiva**. Esta sección manda
sobre cualquier lectura posterior del diff.

- **Inventario esperado**: solo presentación web —`apps/web/app/dashboard/page.tsx`,
  `apps/web/app/globals.css` y `apps/web/test/lobby-greeting.test.mjs`—, documentación y evidencia
  (`docs/briefs/**`, `docs/qa/evidence/lobby-v4-20261110/**`) y espejos de agentes
  (`.qoder/skills/**`, `agents/**`).
- **Cero rutas funcionales**: ningún archivo en `apps/api/**`, `apps/api/prisma/**` ni
  `apps/control-tower/**`. Sin endpoints, esquema, migraciones, colas, telemetría, autenticación,
  RBAC ni aislamiento multi-tenant.
- **La lógica del saludo no cambia**: el nombre sigue saliendo de `userDisplayName()` sobre
  `localStorage.user_email` y la empresa de su fuente actual. En `page.tsx` cambia el marcado del
  saludo (componente `Avatar` existente, `<strong>` y `<span>` con marcadores); el resto de la
  página queda intacto. El texto conserva «Bienvenido,» como una sola cadena legible, contrato de
  `certify-ui-ux-phase-two-local.mjs`.
- **Verificación funcional de no-regresión**: suite web completa **691/691** y `typecheck` sin
  hallazgos; la API no se tocó.
- **Regla de promoción**: los manifiestos futuros deben declarar el paquete como capa visual
  exclusiva (`change_intent.modules: web-lobby, agentes-equipo`) con inventario A/M/D exacto; una
  ruta funcional dentro del diff rechaza el paquete y lo reconstruye.

## 1. Objetivo

Dar protagonismo visual al usuario autenticado en el hero del lobby —sin tocar negocio—, atendiendo
la observación del dueño sobre el tamaño de la letra:

1. **El nombre deja de ser una etiqueta de sistema.** Antes el saludo era una línea de 11,5 px en
   turquesa con el mismo peso para todo. Ahora es una cápsula con avatar de iniciales y jerarquía de
   tres niveles: «Bienvenido,» a 14 px, el nombre a **19 px / 700** en blanco de la paleta y la
   empresa a 14 px en acento.
2. **La cápsula se lee como identidad, no como barra.** Borde y degradado de marca, radio 999 px y
   `align-self: flex-start` para que abrace su contenido en lugar de estirarse al ancho del hero.
3. **La frase de marca sigue mandando.** El `h1` «Creamos sistemas a tu medida.» conserva su
   jerarquía (48 px escritorio / 36 px móvil); el chip crece sin competir con el titular.

**Medición que abre la ronda**: la píldora previa medía 11,5 px para todo el texto y pintaba el
nombre con el color del acento; la captura del dueño la señaló como el punto débil. La ronda cierra
con medición en el DOM de la cápsula nueva, no con una opinión.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/dashboard/page.tsx` | Import de `Avatar`; el saludo del hero pasa a `Avatar` de iniciales + `<strong class="apex-lobby-eyebrow-name">` + `<span class="apex-lobby-eyebrow-company">` dentro de la cápsula |
| `M` | `apps/web/app/globals.css` | `.apex-lobby-eyebrow` como cápsula que abraza su contenido; nuevas `.apex-lobby-eyebrow-avatar`, `-copy`, `-name` y `-company` con escala por nivel |
| `A` | `apps/web/test/lobby-greeting.test.mjs` | 2 pruebas de contrato: estructura del saludo con avatar y nombre destacado; escala tipográfica y de avatar sin desbordar el chip |
| `A` | `docs/qa/evidence/lobby-v4-20261110/evidence-greeting-{light,dark}.png`, `evidence-greeting-mobile-{light,dark}.png`, `evidence-greeting-metrics.json` | Capturas CDP del hero con login verificado y métricas medidas por vista |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 9, filas de cambios y recuento de suite |
| `A` | `docs/briefs/2026-11-11-saludo-hero.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de los agentes requeridos y entrada de la intervención |

### Módulos (`change_intent.modules`)

- `web-lobby`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- `apps/api/**`, `apps/api/prisma/**` y `apps/control-tower/**`: sin cambios.
- Datos, permisos, navegación y carga del lobby: intactos. El saludo sigue derivando del correo de
  la sesión; no se agregan campos ni consultas.
- Frase de marca del `h1`, CTAs y tarjetas de módulos: sin cambios.
- Librerías nuevas: ninguna; `Avatar` ya existía en `components/ui/avatar.tsx`.
- Animaciones: ninguna nueva; todo estático.
- Login, páginas públicas y el resto del panel: sin cambios.
- Promoción a `develop`/`main`, despliegues, migraciones remotas e infraestructura: requieren
  autorización explícita e independiente.
- `.tmp/` y `vibe_images/`: herramientas locales, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`,
  `main`, force push, merge, deploy y migración remota.
- El chip no puede desbordar: `max-width: 100%`, `align-self: flex-start`, sin `position: fixed`
  ni `absolute`; la prueba lo afirma por texto de la regla.
- El texto del lobby debe seguir conteniendo «Bienvenido,» para el certificador vigente.
- Sin secretos ni credenciales en el diff.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **691/691** en verde.
2. `node --test test/lobby-greeting.test.mjs` → **2/2**.
3. `npx tsc --noEmit` sin hallazgos y ESLint sin errores nuevos.
4. Métricas CDP (`evidence-greeting-metrics.json`): cápsula **291×49** con radio `999px` y
   degradado `rgba(6,29,38,.86)→rgba(8,205,187,.16)`; avatar `36×36` con inicial «D»; copia `14px`;
   nombre `19px`/`700`/`rgb(242,248,250)`; empresa `14px`/`rgb(8,205,187)`; `h1` `48px` (1440 px) y
   `36px` (390 px); desbordamiento horizontal `0` en las cuatro vistas.
5. Las capturas muestran sesión real (`demo@apex.local`, «Sesión activa»), no pantallas de acceso.

## 6. Evidencia y certificación exigida

- Pruebas: suite web **691/691** y `lobby-greeting.test.mjs` **2/2**.
- Evidencia: `docs/qa/evidence/lobby-v4-20261110/evidence-greeting-*.png` y
  `evidence-greeting-metrics.json`; ronda 9 en `validacion.md`.
- Capturas contra el entorno local real (API `127.0.0.1:3000`, vista `127.0.0.1:3001`) con login
  verificado antes de navegar, en escritorio (1440×1000) y móvil (390×844), claro y oscuro.
- La primera versión de la cápsula se estiró a 592 px por `align-items: stretch` del contenedor
  flex; se corrigió con `align-self: flex-start` y la evidencia se volvió a tomar. La cifra anterior
  queda registrada en `validacion.md` para no repetir el defecto.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Datos y negocio** — el nombre y la empresa provienen de la sesión como antes; sin consultas ni
  campos nuevos.
- **Jerarquía de marca** — la frase del `h1` conserva tamaño y dominancia frente al chip.
- **Layout** — chip que abraza su contenido, sin `position` fija y con desbordamiento horizontal
  `0` en escritorio y móvil.
- **Accesibilidad** — el `Avatar` ya expone rol y etiqueta; el nombre va en `<strong>` semántico y
  el contraste medido cumple sobre el hero oscuro.
- **Rendimiento** — solo CSS estático; sin JS, sin animación, sin peticiones nuevas.

## 8. Riesgos y rollback

- Riesgo: que un nombre largo desborde la cápsula → Mitigación: `min-width: 0` en la copia y
  `max-width: 100%` en el chip; la prueba de contrato lo afirma. Rollback: revert del commit.
- Riesgo: que la cápsula vuelva a estirarse por el contenedor flex → Medido: `291×49` con
  `align-self: flex-start` en las cuatro vistas. Rollback: revert del commit.
- Riesgo: romper el contrato del certificador de UI/UX → Mitigación: «Bienvenido,» permanece como
  texto continuo y la suite completa corre en verde. Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: el dueño valora el saludo como cabecera de identidad del lobby; no se extiende a otras
  pantallas en esta ronda.
- Pregunta abierta: aprobación visual del dueño sobre esta ronda; falta su revisión en pantalla.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (pedido del dueño de dar protagonismo al usuario).
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ruteo
  `equipo-apexos`, `apexos-frontend` y `apexos-qa` (apps/web, pruebas y docs/qa).
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-qa`.
- **Documentación actualizada**: este brief y `docs/qa/evidence/lobby-v4-20261110/validacion.md`
  (ronda 9).
- **Agentes actualizados**: bumps de cierre en el mismo commit (`apexos-frontend`, `apexos-qa`,
  `equipo-apexos`, `apexos-brief`).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` actualizados en el mismo commit.
- **Cobertura de contexto**: `npm run agents:coverage` en verde para las rutas tocadas.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` →
  `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
- **Publicación**: `git push origin desarrollo` con pruebas verdes y sin secretos ni artefactos.
