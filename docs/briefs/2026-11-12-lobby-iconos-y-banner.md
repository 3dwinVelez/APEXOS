# Brief — Lobby con iconos de módulo y banner de red

- **ID**: `2026-11-12-lobby-iconos-y-banner`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: «analisando nuestro resultado final veo que las imagenes podrian estar generando una saturacion visual propondria colocar unos iconos modernos atractivos y el baneer cambiarlo por la imagen que te envie que quizas convina perfecto con los colores actuales» (con una imagen adjunta de constelación turquesa).

## 0. Naturaleza del cambio — superficie del lobby, no lógica

- **Qué es**: las tarjetas de módulo del lobby dejan de mostrar una franja fotográfica de 9 rem y pasan a
  una fila compacta con el icono que el catálogo ya declara para cada módulo (`module.icon`, lucide).
  El hero cambia el banner del camión por la constelación turquesa que envió el dueño.
- **Qué no es**: no se toca el portafolio (siguen 12 visibles / 20 retirados), ni el acceso por tenant, ni
  las rutas, ni el centro de comandos, ni la barra lateral. `lib/modules.ts`, `moduleFunctions.ts` y
  `moduleAccess.ts` quedan intactos.
- **Assets**: la fotografía del camión y las 32 fotografías de módulo **permanecen en disco**. Retirarlas
  sería un borrado que el dueño no pidió; el mapa `LOBBY_MODULE_IMAGES` se retira porque ya no tiene
  consumidor y `lobbyAssets.ts` publica solo `LOBBY_BANNER`.
- **Banner**: la imagen adjunta del dueño se convierte a WebP local (`852×480`, 39.840 bytes, calidad 84)
  en `apps/web/public/assets/lobby/banner-network.webp`; no hay descarga externa en tiempo de ejecución.
- **Defecto medido de paso**: con `priority` en la versión instalada de Next, el `<img>` del hero no
  recibía atributo de carga y el navegador **nunca pedía el banner**; el hero se veía como un bloque
  plano. La evidencia lo midió (`complete: false`, `naturalWidth: 0`) y se corrigió con
  `loading="eager"` explícito, que la prueba fija.
- **Verificación funcional**: suite web **697/697**, `typecheck` limpio y ESLint sin errores.

## 1. Objetivo

Bajar la saturación visual del lobby sin perder identidad ni navegación:

1. **La tarjeta se lee en un vistazo.** Icono de 2,75 rem sobre degradado de marca, nombre y área del
   módulo, flecha de destino. Sin franja fotográfica: la grilla pasa de 11 bloques de 9 rem a filas
   compactas y toda la oferta cabe en la primera pantalla.
2. **Un solo sistema de iconos.** Se usa el `icon` lucide que cada ficha ya declara; no se agrega una
   librería ni un mapa de assets nuevo.
3. **El hero usa la imagen del dueño.** La constelación turquesa reemplaza al camión y se funde con la
   paleta `--lobby-accent: 8 205 187`; el velo izquierdo se refuerza para que la red no cruce el
   titular.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/lib/lobbyAssets.ts` | Se retira `LOBBY_MODULE_IMAGES`/`lobbyModuleImage`; queda solo `LOBBY_BANNER = "/assets/lobby/banner-network.webp"` |
| `M` | `apps/web/app/dashboard/page.tsx` | Tarjeta con `module.icon` en `.apex-lobby-tile-glyph`; banner con `loading="eager"` y `priority`; esqueleto de carga de 20 rem de alto |
| `M` | `apps/web/app/globals.css` | Se retiran `.apex-lobby-tile-media*`, `.apex-lobby-tile-fallback` y `.apex-lobby-tile-icon`; entran tile flex, `.apex-lobby-tile-glyph` (claro/oscuro, hover, movimiento reducido) y el velo del hero reforzado |
| `A` | `apps/web/public/assets/lobby/banner-network.webp` | Banner del dueño convertido a WebP 852×480 |
| `M` | `apps/web/test/operational-home-redesign.test.mjs` | Afirma `LOBBY_BANNER`, `loading="eager"`, `apex-lobby-tile-glyph`, ausencia de `lobbyModuleImage`/`tile-media` y que las 32 fichas declaran icono |
| `M` | `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png`, `evidence-portfolio-metrics.json` | Capturas y métricas recapturadas: banner cargado, 11 glyphs, 0 tiras fotográficas |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 13, filas de cambios y criterios medidos |
| `A` | `docs/briefs/2026-11-12-lobby-iconos-y-banner.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de frontend, QA, brief y equipo |

### Módulos (`change_intent.modules`)

- `web-lobby`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno. Ni fotografías ni fichas se eliminan del repositorio.

## 3. Fuera de alcance

- Portafolio, permisos, rutas y centro de comandos: no cambian en esta ronda.
- `apps/api/**` y `apps/api/prisma/**`: sin cambios.
- Fotografías de módulo y `banner-truck.webp`: quedan en disco, sin uso, para revertir sin reconstruir.
- Promoción a `develop`/`main`, despliegues, migraciones e infraestructura: fuera de esta autorización.
- `.tmp/`: herramientas locales de captura, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cierre.
- El copy que miden los certificadores se conserva: «Bienvenido,», «Creamos sistemas», «Priorizadas para
  tu perfil», «Mis módulos».
- Las tarjetas siguen abriendo `moduleHome(module.slug)`; el número de tarjetas del tenant demo no cambia
  (11).
- El icono sale del catálogo; ninguna pantalla improvisa un SVG propio.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **697/697** en verde.
2. `tsc --noEmit` sin hallazgos y ESLint sin errores.
3. Evidencia (`evidence-portfolio-metrics.json`):
   - `banner.complete = true` en claro y oscuro, con recurso cargado de 665×375 px (el archivo origen
     es 852×480; se registra lo que entrega el optimizador, no el tamaño del archivo);
   - `glyphBox` de 44×44 px y `tileMedia = 0` en claro y oscuro;
   - 11 tiles, 11 enlaces de barra, 0 retirados visibles, 0 candados, desbordamiento horizontal `0`;
   - buscador sin cambios respecto de la ronda 12 («contabilidad» 10 opciones, «pyg» 1, retirados 0).
4. Las capturas muestran el hero con la constelación y el titular legible en ambos temas.
5. La prueba de contrato prohíbe el retorno silencioso de la franja fotográfica y exige la carga eager.

## 6. Evidencia y certificación exigida

- Suite web 697/697 y `operational-home-redesign.test.mjs` en verde.
- Capturas `evidence-portfolio-lobby-{light,dark}.png` y métricas con banner, glyph y ausencia de media.
- Ronda 13 en `validacion.md`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Navegación**: cada tarjeta conserva su destino (`moduleHome`); el portafolio no se reordena ni se filtra distinto.
- **Acceso por tenant**: `loadModuleAccess` intacto.
- **Rendimiento**: se elimina una petición de imagen por módulo (11 en el lobby del tenant demo) y queda una sola imagen de hero; el icono es SVG en línea de lucide.
- **Reversibilidad**: fotografías y banner anterior siguen en disco.

## 8. Riesgos y rollback

- Riesgo: que un merge reponga la franja fotográfica → Mitigación: la prueba prohíbe `.apex-lobby-tile-media` y `lobbyModuleImage` en HTML y CSS.
- Riesgo: que el banner vuelva a no cargar por depender de `priority` → Mitigación: `loading="eager"` explícito, afirmado en la prueba y medido en la evidencia.
- Riesgo: que el velo no baste y la red cruce el titular → Mitigación: gradiente izquierdo a 0,95/0,62 con transparencia en 66 %, verificado en capturas de ambos temas.
- Rollback: revertir el commit devuelve tarjetas fotográficas y banner del camión, cuyos assets nunca se borraron.

## 9. Supuestos y preguntas abiertas

- Supuesto: el dueño quiere conservar el sistema de iconos lucide del catálogo; la imagen adjunta solo
  aplica al banner.
- Decisión del dueño: las imágenes por módulo saturan; se sustituyen por iconos. No se pidió borrar assets.
- Pendiente declarado: si el dueño prefiere un banner distinto, se sustituye el WebP sin tocar código.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (pedido explícito del dueño).
- [x] Sustituir las fotografías de módulo por iconos y cambiar el banner por la imagen adjunta.
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK`; ruteo `equipo-apexos`, `apexos-brief`, `apexos-frontend` y `apexos-qa`.
- **Documentación actualizada**: este brief y `validacion.md` (ronda 13).
- **Agentes actualizados**: `apexos-frontend` 2.25.0, `apexos-qa` 2.55.0, `apexos-brief` 2.46.0 y
  `equipo-apexos` 2.33.0.
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` en el mismo commit.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` →
  `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
