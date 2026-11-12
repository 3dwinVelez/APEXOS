# Brief — Capa visual homologada lista para QA

- **ID**: `2026-11-12-homologacion-visual-qa`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "vale, ahora deja todo listo para enviar a qa esta interevencion de capa visual prepara todo pero no lo ejecutes deja todo listo y documentado, es importante validar ue todo quede certificado de la manera correcta con sus pruebas correspondientes en desarrollo cuando lo tengas listo sin errores sin bugs, me confirmas y solo yo te autorizo pasar todo a develop "QA""

## 1. Objetivo

Dejar preparado, certificado y documentado un paquete de promoción a QA que contenga **únicamente** la intervención de capa visual homologada, sin arrastrar ningún otro commit pendiente de `desarrollo`. La promoción no se ejecuta: la autoriza el propietario.

## 2. Alcance exacto

La intervención ya publicada en `desarrollo` (`346a85f8`, `97a46fdd`, `87102b6a`) se reconstruyó como **un solo commit** sobre el `develop` vigente (`3595a9bb`) en la rama local `codex/qa-capa-visual-20261112`: **100 rutas, 0 eliminaciones**.

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/dashboard/administracion/page.tsx` | Textos acentuados |
| `M` | `apps/web/app/dashboard/administracion/suscripciones/page.tsx` | Textos acentuados |
| `M` | `apps/web/app/dashboard/gestion-comercial/agenda/page.tsx` | Modal de visita con `SearchSelect`, enlace duplicado retirado |
| `M` | `apps/web/app/dashboard/gestion-comercial/page.tsx` | Textos visibles |
| `M` | `apps/web/app/dashboard/inventario/productos/nuevo/page.tsx` | Texto «Configuración operativa» |
| `M` | `apps/web/app/dashboard/page.tsx` | Estados de espera con tokens |
| `M` | `apps/web/app/dashboard/servicios/page.tsx` | Textos visibles |
| `M` | `apps/web/app/dashboard/ventas/ordenes/nueva/page.tsx` | Dos `SearchSelect` sobre el select nativo |
| `M` | `apps/web/app/globals.css` | Fondo del campo común con `--surface` |
| `M` | `apps/web/components/shell/DashboardChrome.tsx` | Esqueleto de espera con tokens |
| `M` | `apps/web/components/shell/RouteAccessGuard.tsx` | «Validando permisos» con tokens (lógica intacta) |
| `M` | `apps/web/components/shell/Sidebar.tsx` | Textos |
| `M` | `apps/web/components/shell/TechnicianWorkspaceHeader.tsx` | Textos |
| `M` | `apps/web/components/shell/UserSessionBadge.tsx` | Textos |
| `M` | `apps/web/components/system/PlatformAlerts.tsx` | Textos |
| `M` | `apps/web/components/transport/TransportSearchSelect.tsx` | Alias de cuatro líneas |
| `M` | `apps/web/components/ui/data-table.tsx` | Paginación con textos |
| `A` | `apps/web/components/ui/search-select.tsx` | Primitiva canónica |
| `A` | `apps/web/lib/selectMatch.ts` | Matcher puro, probable en Node |
| `M` | `apps/web/test/comercio-ux-consistency.test.mjs` | Contrato de textos |
| `A` | `apps/web/test/search-select-contract.test.mjs` | Contrato de la primitiva |
| `M` | `apps/web/test/service-monitor-live-refresh.test.mjs` | Textos |
| `M` | `apps/web/test/transport-search-select.test.mjs` | Alias delega en la primitiva |
| `M` | `apps/web/test/transport-theme.test.mjs` | Textos |
| `A` | `docs/design/AUDITORIA_VISUAL.md` | Auditoría por pantalla con pendientes |
| `A` | `docs/qa/evidence/visual-homologation-20261112/**` | 35 capturas antes, 34 después, métricas y payloads |

El inventario exhaustivo vive en el manifiesto de alcance, generado desde `git diff --name-status`.

### Módulos (`change_intent.modules`)

- `web`, `shared-ui`, `design-tokens`, `documentation`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Todo lo demás que separa `desarrollo` de `develop`: `apps/control-tower/**` (jamás se promueve), `apps/api/**`, `apps/api/prisma/**`, el bundle de módulos locales y sus migraciones, que viajan en su propia promoción.
- `docs/design/APEXOS_COMPONENT_CATALOG.md`: no existe en `develop`; entra con la promoción que lo introdujo.
- Comportamiento: ningún endpoint, payload, permiso o consulta cambia de forma.

## 4. Restricciones

- Trabajo local en `desarrollo` + rama candidata `codex/qa-capa-visual-20261112` en worktree aislado. Push permitido solo a `origin/desarrollo` al cierre.
- Prohibido sin autorización explícita del propietario: merge o push a `develop`, `main`, force push, deploy, migraciones remotas y cambios en Railway/Supabase.
- Sin secretos, credenciales ni URLs con contraseña en el diff ni en la evidencia.
- La evidencia se captura contra un **build de producción del commit candidato**, no contra el dev server de `desarrollo`.

## 5. Criterios de aceptación

1. `git diff --name-status origin/develop..codex/qa-capa-visual-20261112` coincide exactamente con `expected_changes` del manifiesto de alcance y no contiene eliminaciones.
2. `npm run qa:promotion:scope -- docs/qa/manifests/homologacion-visual-20261112-scope.json codex/qa-capa-visual-20261112 origin/develop` → verde.
3. `node scripts/certifications/visual-homologation-browser.cjs` sobre el build del candidato → **96/96 en verde**: 13 hubs en 1440 y 980 sin desbordamiento ni pantalla rota (Gastos menores como `documented_denied` por licenciamiento del inquilino), dos `SearchSelect` funcionando en Nueva OV con el payload intacto, agenda comercial con el selector nuevo, estado vacío sin escrituras, oscuro y móvil 390 sin desbordamiento y consola sin errores.
4. `node scripts/certifications/visual-homologation-regression.cjs` → **PASSED**: tipos y lint limpios y suite web 777/773 con 0 fallos nuevos frente a la línea base medida en `develop` (770/5).
5. `npm run qa:promotion:scope -- …` → **verde** (100 rutas exactas); `npm run qa:preqa:evidence -- …` → único bloqueo: `approval.status` pendiente.

## 6. Evidencia y certificación exigida

- Certificación navegador: `scripts/certifications/visual-homologation-browser.cjs` → `docs/qa/evidence/homologacion-visual-candidate-20261112/candidate-certification.json` + capturas.
- Certificación de regresión: `scripts/certifications/visual-homologation-regression.cjs` → `docs/qa/evidence/homologacion-visual-candidate-20261112/visual-homologation-regression.json`.
- Informe: `docs/qa/certifications/homologacion-visual-20261112.md`.
- Runbook de promocion y rollback: `docs/qa/homologacion-visual-20261112-promotion-runbook.md`.
- Resultado medido: 96/96 comprobaciones, 33 capturas, 1 escritura interceptada con payload contractual,
  0 errores de consola y 0 errores HTTP; suite 777/773 (4 fallos preexistentes, 0 nuevos).
- `certification_status`: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Contrato de escritura de venta, agenda comercial e inventario — payloads interceptados y comparados por clave.
- Selectores canónicos con búsqueda — valor en el select nativo, `change` burbujeante y `required` efectivo.
- Shell y estados de espera — sin pantalla bloqueada ni desbordamiento en 1440/980/390.
- Autenticación y navegación del portafolio — 13 hubs y frontera de sesión.
- Suite web y tipos — sin regresiones nuevas frente a `develop`.

## 8. Riesgos y rollback

- Riesgo: que el reconstruido arrastre código ajeno → Mitigación: inventario exacto generado por `git diff` y compuerta de alcance → Rollback: `git revert` del merge en `develop`; nunca `reset --hard` ni reescritura.
- Riesgo: que el visual cambie payloads → Mitigación: intercepción de escrituras con contrato por clave.
- Riesgo: que QA no reciba el commit certificado → Mitigación: `certified_commit` declarado y comparado por la compuerta.

## 9. Supuestos y preguntas abiertas

- Supuesto: el tenant demo local no tiene clientes ni asesores comerciales, así que esos dos maestros se sustituyen por juegos controlados; los productos de inventario sí vienen del API real.
- Pregunta: ninguna que altere el alcance. La autorización de promoción es del propietario.

## 10. Autorizaciones requeridas

- [ ] Autorización explícita del propietario para llevar `codex/qa-capa-visual-20261112` a `develop` (QA).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "scripts/certifications/,docs/qa/,docs/briefs/"` → `Veredicto: OK`, agentes requeridos `equipo-apexos`, `apexos-brief`, `apexos-qa`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-qa`, `apexos-frontend` (dueño del código visual), `apexos-git-guardian` (rama candidata y alcance).
- **Documentación a actualizar**: este brief, `docs/qa/certifications/homologacion-visual-20261112.md`, los dos manifiestos y el runbook de promoción.
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
