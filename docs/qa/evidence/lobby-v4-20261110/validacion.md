# Validación — Lobby Design System V4 (fase piloto) — 2026-11-10

## Alcance aprobado

Fase piloto acotada al lobby del dashboard (`/dashboard`), con la imagen de referencia del lobby
corporativo oscuro con acentos turquesa como referencia obligatoria. El resto de la plataforma
queda sin intervenir hasta la aprobación explícita de la siguiente fase.

## Ronda 2 (retroalimentación del dueño)

- **Panel secundario retirado.** «Continúa donde estabas» salió del lobby por decisión del dueño
  («no me aporta valor») junto con su estado, su lectura de `apex_navigation_trace_v1` y sus
  helpers. «Mis módulos» ocupa el ancho completo en grilla de cuatro columnas.
- **Cobertura fotográfica total.** Los 32 módulos del catálogo tienen fotografía propia generada
  con la misma dirección de arte y optimizada a WebP 1024×768 (24–69 KB). Se retiraron las dos
  imágenes compartidas (`module-finanzas.webp`, `module-heart.webp`).

## Cambios

| Archivo | Cambio |
|---|---|
| `apps/web/app/dashboard/page.tsx` | M — ancho completo sin panel secundario; grilla `xl:grid-cols-4`; tarjetas con `sizes` de cuatro columnas |
| `apps/web/lib/lobbyAssets.ts` | M — mapa slug→asset para los 32 módulos, sin imágenes compartidas |
| `apps/web/app/globals.css` | M — altura de la franja fotográfica de tarjeta a 9rem |
| `apps/web/public/assets/lobby/` | A 24 / D 2 — 32 fotografías de módulo + banner |
| `apps/web/test/operational-home-redesign.test.mjs` | M — prueba de cobertura y unicidad fotográfica por slug; prueba de ancho completo |
| `apps/web/test/phase-two-intelligent-experience.test.mjs` | M — el copy retirado se afirma por ausencia |

## Validación ejecutada

- Pruebas web: `node --test "test/*.test.mjs"` — **670/670** en verde.
- Typecheck (`tsconfig.typecheck.json`) y ESLint sobre los archivos tocados: sin hallazgos.
- Navegador real (headless Edge vía CDP, perfil limpio), cuatro capturas:
  - `evidence-lobby-desktop-light.png` — 1440 px, tema claro.
  - `evidence-lobby-desktop-dark.png` — 1440 px, tema oscuro.
  - `evidence-lobby-mobile-light.png` — 390 px, tema claro.
  - `evidence-lobby-mobile-dark.png` — 390 px, tema oscuro.
- El certificador de captura recorre la página para forzar el lazy-load y **falla** si alguna
  imagen queda con `naturalWidth = 0`; las 33 imágenes (banner + 32 módulos) cargaron en todas
  las capturas (359 px de ancho natural en escritorio, 390 px en móvil).
- Sin lógica de negocio alterada: acceso por `loadModuleAccess(MODULES)`, saludo derivado del
  correo. Sin datos inventados ni módulos fuera de autorización.

## Línea base vs después

- Antes (ronda 1): panel secundario de actividad y 21 tarjetas con degradado genérico.
- Después: módulos a ancho completo, 32 fotografías alusivas únicas, hero panorámico constante
  (oscuro en ambos temas) y CTAs «Comenzar» / «Explorar módulos».

## Pendientes

1. Aprobación del dueño de esta fase piloto antes de extender el Design System V4 al resto del panel.
2. Capturas tomadas sobre dev server; repetir contra build de producción (`next build && next start`) cuando la fase se promueva.
3. Las imágenes se generaron con dirección de arte única (sin licencias de terceros); si el dueño
   prefiere fotografía real de la operación, se sustituyen los assets sin tocar código.

## Reproducir

Las capturas se generan con `vibe_images/cdp-capture.mjs` (cliente CDP sobre Node 24, headless
Edge con `--remote-debugging-port=9225`), login contra `http://127.0.0.1:3000/api/v1/auth/login`
(la CSP de `apps/web` no permite `localhost` en connect-src) y navegación a `/dashboard` en el
dev server del puerto 3001. El script recorre la página, espera a que todas las imágenes carguen
y solo entonces captura.
