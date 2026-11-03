# Cierre de certificaciones UI/UX — 2026-11-03

## Entorno

- Rama: `desarrollo`
- Servidor web: `next start -p 3001` sobre `127.0.0.1:3001` (build de producción local).
- API: `127.0.0.1:3000` con datos demo; login `demo@apex.local`.
- Chrome headless vía `puppeteer-core`.

## Diagnóstico

Las seis certificaciones de fase dos y fase tres fallaban por dos causas de arnés, no por regresiones de producto:

1. **Desplegable "Herramientas"**: desde `262a88ad` (2026-09-10) `Trazabilidad`, `Colaboración en tiempo real`, `Preferencias de experiencia` y `Centro de productividad` viven dentro de `<details>` (`SecondaryWorkspaceTools` en `apps/web/components/shell/DashboardChrome.tsx`). Los arneses pulsaban los disparadores ocultos: `page.click` fallaba con "Node is either not clickable", o el panel nunca se abría.
2. **Hidratación de React**: la interacción podía ejecutarse antes de que los efectos de montaje estuvieran activos (por ejemplo `document.documentElement.dataset.density`). El atajo `Ctrl+K` se enviaba como `KeyK` y en esta versión de Puppeteer no produce el evento esperado; además no se esperaba la hidratación.

Además:

- Fase dos esperaba textos retirados: "Panel contextual" (hoy el dashboard es "Mi operación" con "Perfil:") y "Nueva orden de compra" en la paleta (hoy la acción es "Nueva compra"). "Trazabilidad" ya no está visible en la lista de productos: se abre desde Herramientas.
- TOTP: el build local no tiene `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (el `next build` no lee el `.env` de la raíz). El arnés de proveedor simulado inyecta esa configuración pública vía `window.process.env` antes de cargar la app, junto al interceptor de `/auth/v1/factors`, `/challenge` y `/verify`.
- API: `offline-bootstrap.test.js` importaba `tenantCache`, que exige `REDIS_URL` si Redis no está deshabilitado. Se aplicó el mismo patrón que `accounting-opening-balances.test.js` y `accounting-pyg-interactive.test.js`.

## Correcciones de producto

- `apps/web/lib/moduleFunctions.ts`: se registró `fn-comercio-promociones` (`/dashboard/comercio/promociones`), que dejó de estar accesible desde el centro de comandos y rompía `command-palette-module-functions.test.mjs`.

## Resultados

| Certificación | Checks | Estado |
|---|---|---|
| `certify-ui-ux-phase-one-local` | 13 | passed |
| `certify-ui-ux-phase-two-local` | 14 | passed |
| `certify-ui-ux-phase-three-foundation-local` | 7 | passed |
| `certify-ui-ux-phase-three-accessibility-local` | 11 | passed |
| `certify-ui-ux-phase-three-collaboration-local` | 5 | passed |
| `certify-ui-ux-phase-three-personalization-local` | 5 | passed |
| `certify-ui-ux-phase-three-toolkit-local` | 6 | passed |
| `certify-ui-ux-phase-three-totp-local` | 4 | passed |
| `certify-supplier-create-button-visible-local` | 6 | passed |

Suites:

- Web: 598 tests, 0 fallos.
- API: 964 tests, 962 pass, 2 skipped, 0 fallos.
- Agentes: 42 tests, 0 fallos.
- Control tower: 67 tests, 0 fallos.
- Typecheck web: sin errores.
- Centro de comandos: 10 tests, 0 fallos.

## Reproducción

```bash
cd apps/web
node test/certify-ui-ux-phase-two-local.mjs --output=/tmp/phase-two.json
node test/certify-ui-ux-phase-three-accessibility-local.mjs --output=/tmp/accessibility.json
node test/certify-ui-ux-phase-three-collaboration-local.mjs --output=/tmp/collaboration.json
node test/certify-ui-ux-phase-three-personalization-local.mjs --output=/tmp/personalization.json
node test/certify-ui-ux-phase-three-toolkit-local.mjs --output=/tmp/toolkit.json
node test/certify-ui-ux-phase-three-totp-local.mjs --output=/tmp/totp.json
```
