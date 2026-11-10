# Brief — Fondo ambiente corporativo compartido por todas las ventanas (Design System V4)

- **ID**: `2026-11-10-fondo-ambiente-v4`
- **Fecha**: `2026-11-10`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "como podemos mejorar el fondo lo veo como triste, hay forma de darle vida sin sacrificar el performance sin volver lento el sistema y evitar que nos quede muy imvasivo tambien" · "has la recomendacion y recuerda que este fonde debe ser applicable a todas las ventanas y que el fondo tenga un valor visual mas que tener solo un fondo oscuro y tener en cuenta tambien el tema blanco y oscuro"

## 1. Objetivo

Que el panel deje de leerse como un fondo plano —papel gris en claro y negro azulado en oscuro— sin una imagen por pantalla ni un costo medible:

1. **Un solo fondo para todo el producto.** `apps/web/app/layout.tsx` monta una capa `.apex-ambient` (tres luces de la paleta corporativa, grano SVG inline y deriva compuesta por `transform`) que comparten todas las rutas, módulos y ventanas emergentes.
2. **El ambiente se ve porque el marco dejó de taparlo.** El papel lo pinta `html/body`; `.apex-app-gradient` es transparente y el override oscuro no repinta `--surface` sobre el marco. Tarjetas, tablas y hero siguen opacos: el ambiente nunca pinta dentro de una superficie.
3. **Claro y oscuro con valor propio, sin invasión.** Claro `0.12 / 0.09 / 0.06` y grano `0.03`; oscuro `0.10 / 0.18 / 0.10` y grano `0.06`, con papel `#0F1720` y superficies `#17232D`. Sin texturas que compitan con el contenido.
4. **Rendimiento igual, medido.** Misma cadencia de cuadros con y sin la capa, cero layouts, cero scripts y cero peticiones de red nuevas.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/layout.tsx` | Monta `.apex-ambient` (`aria-hidden`) con `apex-ambient-drift` y `apex-ambient-grain` una sola vez para todas las rutas |
| `M` | `apps/web/app/globals.css` | Tokens `--ambient-*` en `:root` y `html.dark`; sección `.apex-ambient` (radiales, grano inline, deriva); `.apex-app-gradient` transparente; el bloque oscuro de superficies deja de incluir el marco; `.apex-ambient-drift` sumado al bloque compartido de movimiento reducido |
| `M` | `apps/web/components/shell/DashboardChrome.tsx` | El panel de marcación exclusiva y la pantalla de validación dejan de pintar `bg-paper` propio para no tapar las luces |
| `A` | `apps/web/test/ambient-background.test.mjs` | 7 pruebas: montaje único y árbol accesible, apilado y `pointer-events`, alfas por tema sobre canales de marca, grano inline sin red, deriva solo `transform` con guardas, alto contraste/impresión y transparencia del marco |
| `A` | `docs/qa/evidence/lobby-v4-20261110/evidence-ambient-{desktop,module}-{light,dark}.png`, `evidence-ambient-dark-commands.png`, `evidence-ambient-mobile-{dark,light}.png` y `evidence-ambient-metrics.json` | Siete capturas CDP y las métricas medidas por vista (marco transparente, `z-index`, `position`, animación, sin desbordamiento) |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 6: capa, marco, temas y rendimiento medido |
| `A` | `docs/briefs/2026-11-10-fondo-ambiente-v4.md` | Este brief |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | 2.17.1 → 2.18.0; control 33: una sola capa de ambiente en el layout raíz y un marco que no la tapa |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | 2.43.0 → 2.44.0; control 57: piel compartida certificada por matriz de temas y rendimiento comparado, sin desplazar el bloque compartido de movimiento reducido |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | 2.34.0 → 2.35.0; regla 48: una piel se escribe como contrato de capa |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | 2.21.0 → 2.22.0; control 35: una queja estética se corrige en la capa que pinta y se demuestra en la vista del dueño |
| `M` | `agents/apexos-{frontend,qa,brief}/SKILL.md`, `agents/equipo-apexos/SKILL.md`, `agents/registry.json`, `agents/CHANGELOG.md` | Espejos generados por `agents:sync`, bumps de versión y entrada de la intervención |

### Módulos (`change_intent.modules`)

- `web-shell`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- `apps/api/**`, `apps/api/prisma/**` y `apps/control-tower/**`: sin cambios de lógica, esquema, endpoints ni telemetría.
- Contenido de los módulos: ninguna pantalla, tabla, tarjeta o formulario cambia su información; solo el marco compartido.
- Login y páginas públicas: conservan su composición fotográfica propia; la capa de ambiente no las modifica.
- Promoción a `develop` o `main`, despliegues, migraciones remotas e infraestructura: requieren autorización explícita e independiente.
- `vibe_images/` y `.tmp/`: herramientas locales de captura, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy y migración remota.
- Sin librerías nuevas, sin imágenes o videos de fondo, sin animación permanente más allá de la deriva compositiva (desktop y `prefers-reduced-motion: no-preference`).
- Sin secretos ni credenciales en el diff.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **678/678** en verde.
2. `node --test test/ambient-background.test.mjs` → **7/7**, incluido el marco transparente y la deriva apagada con movimiento reducido.
3. Capturas CDP: marco `rgba(0, 0, 0, 0)` en las siete vistas, `z-index: -1`, `position: fixed`, deriva activa solo en escritorio, `scrollWidth === clientWidth` (1440/1440 y 390/390).
4. Rendimiento medido con y sin la capa visible: 16,67 ms promedio, p95 16,8 ms, 0 cuadros > 33 ms, 0 layouts, 0 scripts, sin peticiones de red nuevas.
5. `npm run typecheck` y ESLint sobre `app/layout.tsx` y `components/shell/DashboardChrome.tsx` sin hallazgos.

## 6. Evidencia y certificación exigida

- Pruebas: suite web completa **678/678** y `ambient-background.test.mjs` **7/7**.
- Evidencia: `docs/qa/evidence/lobby-v4-20261110/evidence-ambient-*.png` y `evidence-ambient-metrics.json`; ronda 6 en `validacion.md`.
- Las siete capturas se toman contra el arnés aislado (API `127.0.0.1:3310`, vista `127.0.0.1:3311`), no contra el dev server de escritorio.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Legibilidad del contenido** — las superficies siguen opacas; el ambiente vive detrás de tarjetas, tablas y ventanas.
- **Rendimiento del cliente** — cadencia de cuadros y layouts medidos contra la capa oculta.
- **Accesibilidad visual** — `aria-hidden`, sin captura de punteros, apagada en alto contraste e impresión, deriva detenida con movimiento reducido.
- **Temas** — claro y oscuro conservan sus tokens; solo cambian las alfas del ambiente.
- **Negocio** — ninguna ruta, dato, autorización ni módulo se altera.

## 8. Riesgos y rollback

- Riesgo: que las luces tiñan en exceso el papel claro → Mitigación: alfas medidas por captura (`0.12 / 0.09 / 0.06`) y grano `0.03`. Rollback: revert del commit.
- Riesgo: que un marco opaco nuevo tape la capa → Mitigación: prueba que exige `.apex-app-gradient` transparente y el override oscuro sin el marco. Rollback: revert del commit.
- Riesgo: que una regla de movimiento reducido nueva desplace el bloque compartido → Mitigación: la deriva se suma al bloque compartido y la suite completa quedó 678/678. Rollback: revert del commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: el fondo se aplica a las pantallas del panel y sus ventanas; las páginas públicas mantienen su arte propio.
- Supuesto: la deriva lenta en escritorio es aceptable porque es compositiva y se apaga con movimiento reducido.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (implícita en la solicitud).
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ruteo `apexos-frontend`, `apexos-qa` (apps/web y docs/qa), `apexos-brief` y `equipo-apexos` (docs/briefs).
- **Agentes consultados**: `apexos-frontend`, `apexos-qa`, `apexos-brief`, `equipo-apexos`.
- **Documentación actualizada**: este brief y `docs/qa/evidence/lobby-v4-20261110/validacion.md` (ronda 6).
- **Agentes actualizados**: `apexos-frontend` 2.17.1 → 2.18.0 (control 33), `apexos-qa` 2.43.0 → 2.44.0 (control 57), `apexos-brief` 2.34.0 → 2.35.0 (regla 48), `equipo-apexos` 2.21.0 → 2.22.0 (control 35).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` actualizados en el mismo commit.
- **Cobertura de contexto**: `npm run agents:coverage` en verde para las rutas tocadas.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
- **Publicación**: `git push origin desarrollo` con pruebas verdes y sin secretos ni artefactos locales.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
