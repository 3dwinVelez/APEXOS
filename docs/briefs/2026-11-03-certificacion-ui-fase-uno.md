# Brief — Revalidación de la certificación UI fase uno

- **ID**: `2026-11-03-certificacion-ui-fase-uno`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "cual es el siguiente paso ?" / "Sí, arranca por la certificación de fase uno"

## 1. Objetivo

Dejar la certificación `certify-ui-ux-phase-one-local` ejecutable y en verde contra el código vigente, distinguiendo expectativas obsoletas del arnés de regresiones reales de producto.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/test/certify-ui-ux-phase-one-local.mjs` | La navegación del paso se valida contra el indicador `aria-current` y el panel vigente ("Clasificación"), no contra la etiqueta retirada "Existencias y dimensiones"; el chequeo de controles con nombre excluye `aria-hidden="true"` y `type="hidden"`. |
| `A` | `docs/briefs/2026-11-03-certificacion-ui-fase-uno.md` | Este brief. |
| `A` | `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/browser-certification.json` | Certificación local 13/13. |
| `A` | `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/web-phase-one-suite.txt` | Salida de la certificación bajo `node --test`. |
| `A` | `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/notes.md` | Comandos, entorno y diagnóstico. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control nuevo `certificacion-contra-codigo-vigente`. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Control nuevo `certificacion-ui-en-la-misma-intervencion`. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Control nuevo `certificacion-ui-en-el-inventario`. |
| `M` | `agents/apexos-qa/SKILL.md`, `agents/apexos-frontend/SKILL.md`, `agents/apexos-brief/SKILL.md` | Espejos generados por `agents:sync`. |
| `M` | `agents/registry.json` | Versiones, `updated_at` y `sha256`. |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervención. |

### Módulos (`change_intent.modules`)

- `web-test`
- `agents`
- `qa-evidence`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- La UI de inventario, compras y ventas no se modifica: la navegación del formulario ya funciona y se comprobó en navegador.
- Las otras seis certificaciones UI que fallaron en la suite (`phase-two`, `phase-three-*`) quedan pendientes de diagnóstico en una intervención aparte.
- El fallo `offline-bootstrap` del API es de entorno (`REDIS_URL`) y no se toca aquí.
- El hueco del command palette (`/dashboard/comercio/promociones`) queda fuera.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- No se toca el trabajo en curso de otro proceso en `apps/api`, `apps/control-tower` ni `.qoder/skills/apexos-backend`.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `node apps/web/test/certify-ui-ux-phase-one-local.mjs --output=docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/browser-certification.json` → `CERTIFICACIÓN UI/UX LOCAL PASSED: 13 comprobaciones`.
2. `node --test test/certify-ui-ux-phase-one-local.mjs` en `apps/web` → `fail 0`.
3. Los trece checks conservan su nombre y el JSON declara `status: "passed"`.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/web/test/certify-ui-ux-phase-one-local.mjs` (13 comprobaciones de navegador).
- Certificación: `node apps/web/test/certify-ui-ux-phase-one-local.mjs` con evidencia en `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Autenticación y dashboard — check `authenticated_dashboard`.
- Flujo de creación de producto en tres pasos — checks `product_three_steps`, `product_continue_not_obstructed_by_ai_help`, `product_step_navigation`.
- Accesibilidad de compras y validación de ventas — checks `purchases_controls_named`, `sales_onblur_validation`.
- Sin desbordamiento móvil en las cuatro rutas — checks `mobile_no_overflow:*`.

## 8. Riesgos y rollback

- Riesgo: que el nuevo selector dependa de una etiqueta que vuelva a cambiar → Mitigación: se ancla al `aria-current` del `StepIndicator` y al título del panel, no al texto del paso en el indicador.
- Rollback: revert del commit; no reset ni force push.

## 9. Supuestos y preguntas abiertas

- Supuesto: el entorno local sirve el build vigente en `127.0.0.1:3001` con datos demo (`demo@apex.local`).
- Pregunta abierta: si las otras seis certificaciones fallan por expectativas obsoletas o por regresiones reales (siguiente intervención).

## 10. Autorizaciones requeridas

- [x] Push acotado a `origin/desarrollo` (autorización permanente de `AGENTS.md`).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: veredicto `OK`; agentes requeridos `equipo-apexos`, `apexos-frontend`, `apexos-qa`.
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-qa` (+ `apexos-brief` por el brief).
- **Documentación a actualizar**: `docs/briefs/2026-11-03-certificacion-ui-fase-uno.md`, `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/`.
- **Agentes a actualizar**: `apexos-qa` `2.1.0` → `2.2.0`; `apexos-frontend` `2.0.0` → `2.1.0`; `apexos-brief` `2.1.0` → `2.2.0`.
- **Registro**: `agents/registry.json` actualizado y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<rutas del alcance>"` en verde para `apexos-frontend` y `apexos-brief`.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `test:agents` → `agents:preflight` → `agents:coverage` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
