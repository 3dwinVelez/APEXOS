# Brief — Cierre de certificaciones UI/UX y centro de comandos

- **ID**: `2026-11-03-cierre-certificaciones-ui`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "termina todo lo que falta y garantiza que los agentes queden funcioanles sin pendientes"

## 1. Objetivo

Dejar en verde las seis certificaciones UI/UX que seguían fallando, cerrar el hueco real del centro de comandos y eliminar el fallo de entorno de la suite API, de modo que la suite completa y los cinco gates de agentes queden sin pendientes en `desarrollo`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/lib/moduleFunctions.ts` | Nueva función `fn-comercio-promociones` para `/dashboard/comercio/promociones`, ruta estática que había dejado de ser accesible desde el centro de comandos. |
| `M` | `apps/web/test/certify-ui-ux-phase-two-local.mjs` | Valida el dashboard vigente ("Mi operación" + "Perfil:"), abre el desplegable Herramientas para Trazabilidad, usa el atajo `Ctrl+K` correcto tras hidratación y busca "Nueva compra". |
| `M` | `apps/web/test/certify-ui-ux-phase-three-accessibility-local.mjs` | Espera hidratación y abre Herramientas antes de Preferencias; usa `Ctrl+K` correcto; espera la aplicación de contraste y movimiento reducido tras cada navegación. |
| `M` | `apps/web/test/certify-ui-ux-phase-three-collaboration-local.mjs` | Abre Herramientas antes de "Colaboración en tiempo real" y espera hidratación en ambas pestañas. |
| `M` | `apps/web/test/certify-ui-ux-phase-three-personalization-local.mjs` | Abre Herramientas antes de Preferencias (incluida la reapertura tras recarga) y espera la persistencia de densidad y tamaño de texto. |
| `M` | `apps/web/test/certify-ui-ux-phase-three-toolkit-local.mjs` | Abre Herramientas antes del Centro de productividad. |
| `M` | `apps/web/test/certify-ui-ux-phase-three-totp-local.mjs` | Abre Herramientas, espera hidratación e inyecta la configuración pública simulada de Supabase para ejercer el contrato de tres pasos. |
| `M` | `apps/api/test/offline-bootstrap.test.js` | Deshabilita Redis al importar `tenantCache`, igual que los tests contables del repositorio. |
| `A` | `docs/briefs/2026-11-03-cierre-certificaciones-ui.md` | Este brief. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/phase-one.json` | Certificación fase uno, 13 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/phase-two.json` | Certificación fase dos, 14 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/foundation.json` | Certificación de fundamentos, 7 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/accessibility.json` | Certificación de accesibilidad, 11 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/collaboration.json` | Certificación de colaboración, 5 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/personalization.json` | Certificación de personalización, 5 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/toolkit.json` | Certificación de productividad, 6 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/totp.json` | Certificación TOTP simulada, 4 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/supplier.json` | Certificación de proveedores, 6 comprobaciones. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/web-suite.txt` | Suite web completa, 598 en verde. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/api-suite.txt` | Suite API, 962 en verde y 2 omitidas. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/agents-suite.txt` | `npm run test:agents`, 42/42. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/control-suite.txt` | `npm run control:test`, 67/67. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/palette-suite.txt` | Cobertura del centro de comandos, 10/10. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/web-typecheck.txt` | `typecheck` del frontend, exit 0. |
| `A` | `docs/qa/evidence/ui-ux-phase-certifications-20261103/notes.md` | Reproducción, causas raíz y comandos de cada corrida. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Control nuevo de registro obligatorio de rutas estáticas en el centro de comandos. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control nuevo de certificación sobre el shell vigente: Herramientas, hidratación y configuración pública simulada. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Control nuevo de cierre de certificaciones en el inventario del brief. |
| `M` | `agents/apexos-frontend/SKILL.md`, `agents/apexos-qa/SKILL.md`, `agents/apexos-brief/SKILL.md` | Espejos generados por `agents:sync`. |
| `M` | `agents/registry.json` | Versiones, `updated_at` y `sha256`. |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervención. |

### Módulos (`change_intent.modules`)

- `web-test`
- `web-lib`
- `api-test`
- `qa-evidence`
- `docs-brief`
- `agents`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- No se modifica la UI: el desplegable Herramientas y los textos vigentes son intencionales; los arneses se adaptan a ellos.
- No se modifica `apps/api/src`, `apps/control-tower` ni `.qoder/skills/apexos-backend|apexos-performance|apexos-seguridad`, que tienen trabajo en curso de otro proceso.
- No se promueve a `develop` ni a `main`; esta intervención termina en `desarrollo`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- No se toca `docs/design/APEXOS_CONTROL_PLANE.md` (sin seguimiento) ni archivos de otro proceso.
- Sin secretos ni credenciales en el diff; la configuración de Supabase inyectada en el arnés es pública y simulada.

## 5. Criterios de aceptación

1. Las nueve certificaciones de navegador terminan `PASSED` y cada JSON declara `status: "passed"`.
2. `node --test test/command-palette-module-functions.test.mjs` en `apps/web` → 10/10, con `/dashboard/comercio/promociones` cubierta.
3. Suite web (`.test.mjs` y `.test.js`) → 0 fallos.
4. Suite API (`node --test --test-force-exit test/*.test.js`) → 0 fallos.
5. `npm run test:agents` → 42/42 y `npm run control:test` → 67/67.
6. `npm --workspace apps/web run typecheck` → exit 0.
7. `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde antes del push.

## 6. Evidencia y certificación exigida

- Certificaciones: `docs/qa/evidence/ui-ux-phase-certifications-20261103/*.json`.
- Suites: `web-suite.txt`, `api-suite.txt`, `agents-suite.txt`, `control-suite.txt`, `palette-suite.txt`, `web-typecheck.txt`.
- Diagnóstico y reproducción: `docs/qa/evidence/ui-ux-phase-certifications-20261103/notes.md`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Dashboard por rol y actividad — `role_context_dashboard`.
- Centro de comandos: atajo, búsqueda y cobertura de rutas — `command_palette_keyboard`, `command_palette_search`, suite de paleta.
- Navegación avanzada y trazabilidad — `advanced_breadcrumbs`, `traceability_control`.
- Idiomas y estado offline — `locale_en`, `locale_pt`, `locale_es`, `offline_status`.
- Accesibilidad — `accessible_preferences_applied`, `landmarks_*`, `labels_and_layout_*`, `keyboard_shortcut_focuses_palette`, `escape_restores_trigger_focus`.
- Colaboración en tiempo real — `presence_panel_available`, `second_session_detected`, `concurrent_edit_warning`, `session_leave_propagated`.
- Personalización persistente — `compact_density_applied`, `large_font_applied`, `favorite_and_view_saved`, `preferences_persist_after_reload`.
- Productividad y 2FA — onboarding, confianza, formato regional, copia de enlace, service worker y contrato TOTP de tres pasos.
- API offline — bootstrap y contrato sin dependencia de Redis en pruebas.

## 8. Riesgos y rollback

- Riesgo: abrir el desplegable Herramientas por click sintético (`.click()`) depende de que el `<details>` exista; mitigado con espera explícita de `details.open` y de hidratación.
- Riesgo: el arnés TOTP depende de que el build lea `window.process.env`; se comprobó en el build local actual. Si un build futuro inlina la configuración, el interceptor de fetch sigue siendo válido y la inyección resulta inocua.
- Rollback: revert del commit; no reset ni force push.

## 9. Supuestos y preguntas abiertas

- Supuesto: el entorno local sirve el build vigente en `127.0.0.1:3001` con API en `127.0.0.1:3000` y datos demo.
- Pregunta abierta: la promoción a `develop`/`main` queda pendiente de QA funcional con los manifiestos de promoción.

## 10. Autorizaciones requeridas

- [x] Push acotado a `origin/desarrollo` (autorización permanente de `AGENTS.md`).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: veredicto final `OK`; agentes requeridos `equipo-apexos`, `apexos-frontend`, `apexos-qa` (+ `apexos-brief` por `docs/briefs/**`).
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-qa`, `apexos-brief`.
- **Documentación a actualizar**: este brief y `docs/qa/evidence/ui-ux-phase-certifications-20261103/`.
- **Agentes a actualizar**: `apexos-frontend` `2.1.0` → `2.2.0`; `apexos-qa` `2.2.0` → `2.3.0`; `apexos-brief` `2.2.0` → `2.3.0`.
- **Registro**: `agents/registry.json` actualizado y entrada en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `test:agents` → `agents:preflight` → `agents:coverage` → commit → `git push origin desarrollo`.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO` (veredicto final `OK`)
- [x] Cobertura de contexto en verde (`agents:coverage`: `apexos-frontend` y `apexos-brief` en `local-ahead`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
