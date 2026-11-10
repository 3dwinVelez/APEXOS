# Validación — Lobby Design System V4 (fase piloto) — 2026-11-10

## Alcance aprobado

Fase piloto acotada al lobby del dashboard (`/dashboard`), con la imagen de referencia del lobby
corporativo oscuro con acentos turquesa como referencia obligatoria. El resto de la plataforma
queda sin intervenir hasta la aprobación explícita de la siguiente fase.

## Cambios

| Archivo | Cambio |
|---|---|
| `apps/web/app/dashboard/page.tsx` | M — lobby V4: hero con banner panorámico, acciones frecuentes, tarjetas fotográficas de módulos, panel «Continúa donde estabas» |
| `apps/web/lib/lobbyAssets.ts` | A — mapa slug→asset y constante del banner |
| `apps/web/app/globals.css` | M — tokens `--lobby-*` y clases `.apex-lobby-*` (alcance limitado a la clase del lobby) |
| `apps/web/public/assets/lobby/*.webp` | A — 11 imágenes generadas y optimizadas (38–56 KB c/u) |
| `apps/web/test/operational-home-redesign.test.mjs` | M — contrato de copy del lobby V4 + prueba de banner/tarjetas |
| `apps/web/test/phase-two-intelligent-experience.test.mjs` | M — literales renombrados |

## Validación ejecutada

- Pruebas web: `node --test "test/*.test.mjs"` — **669/669** en verde.
- Typecheck (`tsconfig.typecheck.json`) y ESLint en verde (fix de `@next/next/no-assign-module-variable` renombrando `module` → `mod`).
- Navegador real (headless Edge vía CDP, perfil limpio):
  - `evidence-lobby-desktop-light.png` — tema claro, 1440 px.
  - `evidence-lobby-desktop-dark.png` — tema oscuro, 1440 px.
  - `evidence-lobby-mobile-light.png` — tema claro, móvil.
  - Imágenes verificadas cargadas (`naturalWidth > 0`); en móvil las tarjetas bajo el fold cargan con lazy-load tras scroll medido (comportamiento esperado de `next/image`).
- Rendimiento percibido (dev server): DCL ~135–176 ms escritorio, ~630 ms móvil; banner con `priority`, tarjetas con `fill` + `sizes`.
- Sin lógica de negocio alterada: acceso por `loadModuleAccess(MODULES)`, traza de `apex_navigation_trace_v1`, saludo derivado del correo. Sin datos inventados (el estado vacío de «Continúa donde estabas» se muestra honesto).

## Línea base vs después

- Antes: lobby en tema claro con tarjetas estáticas de icono, sin banner, sin fotografía.
- Después: hero panorámico constante (oscuro en ambos temas), tarjetas fotográficas alusivas por módulo con fallback de degradado corporativo, CTAs «Comenzar» y «Explorar módulos».

## Pendientes

1. Aprobación del dueño de esta fase piloto antes de extender el Design System V4 al resto del panel.
2. La evidencia de móvil en tema oscuro no se capturó (la clara valida el layout; el oscuro hereda las mismas clases y quedó medido en escritorio).
3. Capturas tomadas sobre dev server; repetir contra build de producción (`next build && next start`) cuando la fase se promueva.
4. Las imágenes se generaron con dirección de arte única (sin licencias de terceros); si el dueño prefiere fotografía real de la operación, se sustituyen los assets sin tocar código.

## Reproducir

Las capturas se generaron con `vibe_images/cdp-capture.mjs` (cliente CDP sobre Node 24,
headless Edge con `--remote-debugging-port=9225`), con login contra `http://127.0.0.1:3000/api/v1/auth/login`
(la CSP de `apps/web` no permite `localhost` en connect-src) y navegación a `/dashboard` en el
dev server del puerto 3001.
