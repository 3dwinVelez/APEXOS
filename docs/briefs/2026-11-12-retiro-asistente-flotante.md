# Brief — Retiro del asistente flotante del chrome

- **ID**: `2026-11-12-retiro-asistente-flotante`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: «tambien requiero que retiremos la ayuda o asistente, ya que actualmente no aporta valor y es espacio que ocupamos sin necesidad» (con captura del botón flotante APEX AI sobre la esquina del lobby).

## 0. Naturaleza del cambio — superficie del chrome, no lógica

- **Qué es**: el chrome autenticado deja de montar `AiExperienceLayer`, el asistente flotante que pintaba el
  botón del cerebro con contador de recomendaciones, la bandeja de insights y la guía contextual. Desaparecen
  las tres superficies de una sola vez porque la bandeja y la guía solo se abrían desde ese botón.
- **Qué no es**: no se toca el portafolio (siguen 12 visibles / 20 retirados), ni rutas, ni permisos, ni el
  centro de comandos, ni la barra de herramientas. El módulo APEX AI Core sigue en el catálogo y la pantalla
  `/dashboard/apex-ai` no se modifica.
- **Archivos que se conservan**: `components/brain/AiExperienceLayer.tsx`, `AiAssistanceToggle.tsx`,
  `BrainPanel.tsx`, `ApexAiHeader.tsx` y `ApexIntelligencePulse.tsx` **permanecen en disco**. Retirar el
  montaje es reversible con una línea; borrar componentes no fue pedido.
- **Efecto lateral medido en la revisión de código**: el layer consultaba `/api/v1/brain/insights` en cada
  cambio de módulo para sesiones no Supabase; al desmontarlo esa petición deja de salir desde el dashboard.
- **Verificación funcional**: suite web **697/697**, `typecheck` limpio y ESLint sin errores.

## 1. Objetivo

Devolver el espacio que el asistente ocupaba sin aportar valor:

1. **Sin botón flotante.** La esquina inferior deja de mostrar el cerebro con el globo «1»; el contenido y la
   barra lateral recuperan ese espacio.
2. **Sin bandeja ni guía emergente.** El panel de recomendaciones y la guía paso a paso dejan de existir en
   el chrome; nadie abre una superficie que ya no se pinta.
3. **Contrato fijo.** Una prueba del chrome prohíbe volver a montar `AiExperienceLayer`, el encabezado AI o
   cualquier `.apex-ai-mascot`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/components/shell/DashboardChrome.tsx` | Sale el import de `AiExperienceLayer` y el bloque `<div className="technician-hide"><AiExperienceLayer /></div>` |
| `M` | `apps/web/test/operational-home-redesign.test.mjs` | El contrato del chrome prohíbe `AiExperienceLayer`, `ApexAiHeader` y `apex-ai-mascot` |
| `M` | `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png`, `evidence-portfolio-metrics.json` | Capturas y métricas recapturadas con `assistantBubbles = 0` |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 14 con el hallazgo y la medición |
| `A` | `docs/briefs/2026-11-12-retiro-asistente-flotante.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de frontend, QA, brief y equipo |

### Módulos (`change_intent.modules`)

- `web-lobby`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno. El asistente deja de montarse; sus componentes, animaciones y estilos siguen versionados.

## 3. Fuera de alcance

- La pantalla `/dashboard/apex-ai` y sus componentes internos: no cambian en esta ronda.
- `apps/api/**` y `apps/api/prisma/**`: sin cambios. El endpoint de insights sigue existiendo para la
  pantalla del módulo.
- Preferencias: no había un interruptor de asistencia que retirar; `ExperiencePreferences` no lo monta.
- Portafolio, permisos, rutas y centro de comandos: intactos.
- Promoción a `develop`/`main`, despliegues y migraciones: fuera de esta autorización.
- `.tmp/`: herramienta local de captura, no entra al commit.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cierre.
- El copy que miden los certificadores se conserva: «Bienvenido,», «Creamos sistemas», «Priorizadas para
  tu perfil», «Mis módulos», «Buscar módulos y funciones».
- Las 11 tarjetas del tenant demo y sus 11 enlaces de barra no cambian.
- No se elimina ningún archivo del repositorio.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **697/697** en verde.
2. `tsc --noEmit` sin hallazgos y ESLint sin errores.
3. Evidencia (`evidence-portfolio-metrics.json`):
   - `assistantBubbles = 0` en claro y oscuro (selector `.apex-ai-mascot`, `aria-label`/`title` de APEX AI);
   - 11 tiles, 11 enlaces de barra, 0 retirados visibles, 0 candados, desbordamiento horizontal `0`;
   - banner cargado y glyph de 44×44 px sin regresión respecto de la ronda 13;
   - buscador sin cambios («contabilidad» 10 opciones, «pyg» 1, retirados 0).
4. Las capturas muestran la esquina inferior libre del botón del asistente en ambos temas.
5. La prueba del chrome prohíbe el retorno del montaje y de la clase del botón.

## 6. Evidencia y certificación exigida

- Suite web 697/697 y `operational-home-redesign.test.mjs` en verde.
- Capturas `evidence-portfolio-lobby-{light,dark}.png` y métricas con `assistantBubbles`.
- Ronda 14 en `validacion.md`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Navegación**: tarjetas, barra lateral y centro de comandos no cambian.
- **Acceso por tenant**: `loadModuleAccess` intacto; el asistente ya respetaba ese acceso, pero se retira
  igual para todos los perfiles porque el dueño no le encuentra valor hoy.
- **Rendimiento**: se elimina una consulta a insights por cambio de módulo y los listeners de resize,
  scroll y storage del layer dejan de registrarse en el dashboard.
- **Reversibilidad**: componentes, estilos y animaciones siguen en disco; reponer el montaje es una línea.

## 8. Riesgos y rollback

- Riesgo: que un merge reponga el asistente → Mitigación: contrato del chrome en
  `operational-home-redesign.test.mjs` que prohíbe `AiExperienceLayer`, `ApexAiHeader` y `apex-ai-mascot`.
- Riesgo: que alguna pantalla dependa de la guía contextual → Mitigación: la guía solo se abría desde el
  botón retirado y no hay otro consumidor del evento.
- Rollback: revertir el commit repone import y montaje; no hay assets ni datos que restaurar.

## 9. Supuestos y preguntas abiertas

- Supuesto: el dueño quiere retirar el asistente de toda la experiencia autenticada, no solo del lobby; la
  captura muestra el botón superpuesto al chrome global.
- Decisión del dueño: el espacio y el mantenimiento del asistente no se justifican hoy.
- Pendiente declarado: si se reactiva más adelante, el componente está conservado y la prueba documenta el
  contrato que habría que revertir.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (pedido explícito del dueño).
- [x] Retirar el asistente/ayuda flotante del chrome.
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK_CON_ADVERTENCIAS`; ruteo `equipo-apexos`, `apexos-frontend` y `apexos-qa`.
- **Documentación actualizada**: este brief y `validacion.md` (ronda 14).
- **Agentes actualizados**: `apexos-frontend`, `apexos-qa`, `apexos-brief` y `equipo-apexos` (ver
  `agents/CHANGELOG.md`).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` en el mismo commit.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` →
  `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
