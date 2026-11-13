# Brief — Capa visual completa a QA (reconstrucción sobre develop)

- **ID**: `2026-11-13-capa-visual-completa`
- **Fecha**: 2026-11-13
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "por lo que veo actualmente el despliegue no trajo los cambios que agregamos, los cambios en el lobby, los colroes, la actualizacion de las pantallas revisa porfavor"
- **Decisión del dueño**: "Capa visual completa (Recomendado)" — reconstruir sobre `develop` las 16 rondas visuales, certificarlas, promoverlas y desplegar la web en QA.

## 1. Objetivo

Que QA vea exactamente la capa visual que ya vive en `desarrollo`: lobby V4 curado, tokens de
color y superficies, chrome sin asistente flotante, estados de espera homologados y `SearchSelect`,
sin arrastrar los cambios funcionales ajenos que `desarrollo` aún tiene sin promover.

## 2. Alcance exacto

El inventario autoritativo, con las 143 rutas exactas (`A`/`M`/`D`) medidas contra el tip vigente de
`origin/develop`, vive en `docs/qa/manifests/capa-visual-completa-20261113-scope.json`.

| Grupo | Rutas | Contenido |
|---|---|---|
| `apps/web/app/**` | 12 | Lobby, `[module]`, comercio, contabilidad, CxC (layout y raíz), `globals.css`, `layout.tsx` |
| `apps/web/components/**` | 15 | Chrome, barra lateral, navegación de contabilidad, `AccountingPyg`, 8 herramientas de sistema, `ModalFrame` y `feedback` |
| `apps/web/lib/**` | 6 | Catálogo de módulos, portafolio, funciones, espacio de trabajo, assets del lobby |
| `apps/web/public/assets/lobby/**` | 34 | Banner de red y retratos por módulo (conservados en disco) |
| `apps/web/test/**` | 15 | Contratos de portafolio, lobby, ambiente, operación visual y ajustes de suites existentes |
| `docs/briefs/**` | 7 | Briefs de las rondas 1-14 |
| `docs/qa/evidence/lobby-v4-20261110/**` | 60 | Evidencia visual de las rondas (capturas y métricas) |

Totales: **143 rutas — 109 A / 34 M / 0 D**. `allowed_deletions` queda vacío.

### Módulos (`change_intent.modules`)

- `web`
- `shared-ui`
- `design-tokens`
- `documentation`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `apps/api/**`, `apps/api/prisma/**`, migraciones y datos remotos: el candidato no toca backend.
- Los commits funcionales de `desarrollo` sin promover (seguridad, comercio, talento humano,
  facturas recibidas, APEX Control web): no viajan en este candidato.
- La ficha M-31 (APEX Control web) no existe en `develop`; el catálogo del candidato declara 31
  fichas y las pruebas se ajustaron a ese hecho, no al revés.
- `apps/control-tower/**` y el asistente flotante retirado: el componente `AiExperienceLayer`
  permanece en disco; solo se certifica que el chrome no lo monta.

## 4. Restricciones

- Flujo `desarrollo -> develop -> main`; esta intervención solo promueve a `develop` (QA).
- Nada se promueve sin `npm run qa:promotion:scope` y `npm run qa:preqa:evidence` en verde.
- El candidato debe ser fast-forward del tip de `origin/develop` al momento de promover.
- Sin secretos, credenciales ni rutas locales en el diff ni en la evidencia.
- Escrituras de la certificación interceptadas en el navegador; nunca llegan a la base.

## 5. Criterios de aceptación

1. `node scripts/certifications/visual-homologation-browser.cjs` con `CERT_COMMIT=beff5132` →
   `status: passed`, 100/100 comprobaciones y 34 capturas, 0 errores de consola y 0 de red.
2. `node scripts/certifications/visual-homologation-regression.cjs` → typecheck 0, lint 0, suite
   web 801 pruebas con los 4 fallos preexistentes del baseline y 0 inesperados.
3. En el lobby: 12 tarjetas visibles, 0 slugs retirados ofrecidos, un icono por tarjeta, hero con
   banner de red cargado y sin asistente flotante en el chrome.
4. En los formularios nombrados: 0 selects nativos visibles, combobox de `SearchSelect` y payload
   de escritura con los IDs numéricos del select nativo.
5. Promoción `beff5132 -> develop` por fast-forward con árbol idéntico al certificado.

## 6. Evidencia y certificación exigida

- Certificación: `scripts/certifications/visual-homologation-browser.cjs`
- Regresión: `scripts/certifications/visual-homologation-regression.cjs`
- Evidencia: `docs/qa/evidence/capa-visual-completa-20261113/`
- Acta: `docs/qa/certifications/capa-visual-completa-20261113.md`
- `certification_status` esperado: `local_passed_qa_pending`

## 7. Capacidades protegidas

- Escritura de los formularios de venta, agenda comercial e inventario — payload interceptado y
  comprobado llave por llave.
- Selectores sobre el select nativo — valor y evento `change` verificados en el DOM.
- Shell, estados de espera y ventana ampliada del PYG — hubs a 1440 y 980, más el modo expandido.
- Autenticación y navegación de hubs — login real y acceso/denegación coherentes por licencia.
- Suite web y tipos sin regresiones nuevas — comparadas contra el baseline medido en el destino.
