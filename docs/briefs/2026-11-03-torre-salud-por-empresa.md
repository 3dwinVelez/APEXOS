# Brief — Torre: indicador oficial de salud y vista por empresa

- **ID**: `2026-11-03-torre-salud-por-empresa`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "ya veo que las demas herramientas quedaron estrcturadas pero necesito que valides estos 2 temas, porque no esta trayendo datos de los ambientes ya que la herramienta cuenta con datos y empresas diferentes entonces deberia tener la forma de ver cada empresa y su estado por modulo, adicionalmente debemos tener vistas interacticas lso graficos deben ser el principal indicador de estado oficial con umbrales definidos de sistema optimo , en riesgo, muy mal es un ejemplo, y cada que revice el indicador pueda darle click y me lleve al detalle , debemos contar con un grafico de cada moduo y su estado actual combinar modelos modenros, necesito que este panel de control sea muy moderno y realmente me brinde informacion de valor por jerarquia empezando por lo general y llevandome al detalle bajo mi control y manipulacion"

## 1. Objetivo

Convertir la salud de la torre en un indicador oficial con umbrales publicados (Óptimo ≥ 85, En riesgo 60–84, Crítico < 60, Sin dato), navegable por jerarquía: ambiente → módulo → detalle, y empresa → módulo → detalle. Explicar en la UI, con el código de motivo, por qué un ambiente no entrega datos en lugar de mostrar ceros que parezcan sanos.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/control-tower/lib/health.js` | Cálculo de puntaje por módulo, bandas, mezcla 70/30 y `withModuleBands` |
| `A` | `apps/control-tower/test/health.test.js` | Umbrales, frescura, degradado = 65, mezcla y bandas |
| `M` | `apps/api/src/modules/apex-control/routes.js` | `GET /apex-control/tenants/:tenantId/modules` con guarda entre empresas y validación de id |
| `M` | `apps/api/src/modules/apex-control/service.js` | `getTenantModules`: valida la empresa y devuelve su salud por módulo |
| `M` | `apps/api/test/apex-control-modules.test.js` | 404 `EMPRESA_NO_ENCONTRADA`, allowlist `EMPRESA_FUERA_DE_ALCANCE`, id inválido, lectura autorizada |
| `M` | `apps/control-tower/server.js` | Ruta `GET /api/tenants/:id/modules` con límite propio y errores por motivo |
| `M` | `apps/control-tower/lib/modules.js` | `fetchModules` por empresa y códigos de motivo |
| `M` | `apps/control-tower/lib/probes.js` | Adjunta `health` y bandas a cada ambiente |
| `M` | `apps/control-tower/lib/config.js` | Expone si el token APEX del ambiente está configurado (nunca el valor) |
| `M` | `apps/control-tower/public/app.js` | Gauge, bandas, umbral, gráfico por módulo, diálogos, panel por empresa, avisos accionables |
| `M` | `apps/control-tower/public/index.html` | Contenedores `#health`, `#companyPanel` y diálogo nativo |
| `M` | `apps/control-tower/public/styles.css` | Sistema visual de gauge, bandas, gráfico, panel y diálogo, con responsive y ambos temas |
| `M` | `apps/control-tower/test/modules.test.js` | Motivos y lectura por empresa |
| `M` | `apps/control-tower/test/server.test.js` | Ruta por empresa y límite |
| `M` | `apps/control-tower/package.json` | `1.0.0` → `1.1.0` |
| `M` | `apps/control-tower/README.md` | Indicador oficial, umbrales, vista por empresa y evidencia |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Valida Resumen (gauge, `metric-tile`) y Detalle (ramas, sondas, rendimiento) |
| `A` | `docs/briefs/2026-11-03-torre-salud-por-empresa.md` | Este brief |
| `A` | `docs/qa/evidence/tower-health-charts-20261103/` | Suites, snapshot saneado, interacciones, notas y capturas |
| `M` | `docs/qa/evidence/apex-control-tower-f1/` | Certificación 37/37 y capturas vigentes |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md`, `agents/*/SKILL.md`, `.qoder/skills/*/SKILL.md` | Controles y versiones del equipo |

### Módulos (`change_intent.modules`)

- `apex-control`
- `control-tower`
- `agents`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `apps/web/**`: la limpieza de certificaciones UI de otra sesión (`5345f89b`) no se toca ni se reescribe.
- `docs/design/APEXOS_CONTROL_PLANE.md`: trabajo local del usuario, no se modifica ni se commitea.
- No se promueve a `develop` ni a `main`; no hay despliegues, migraciones remotas ni cambios de infraestructura.
- No se alteran secretos ni `.env.local`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre.
- La torre es de solo lectura; la lectura entre empresas mantiene `apex-control:read_all_tenants`, la guarda `APEX_CONTROL_CROSS_TENANT` y la allowlist.
- Los tokens cloud viven solo en `apps/control-tower/.env.local`, nunca en el panel, logs, evidencia o diff.
- Sin RLS: el middleware de tenant sigue siendo el único filtro.

## 5. Criterios de aceptación

1. `npm run control:test` → 67/67 en verde.
2. `node --test apps/api/test/apex-control-modules.test.js apps/api/test/offline-bootstrap.test.js` → 23/23 en verde.
3. `npm run certify:control-tower:local` → 37/37 con capturas.
4. En navegador: gauge y bandas con el mismo puntaje; clic en banda filtra el gráfico; clic en módulo abre el detalle; botón de fórmula abre el diálogo; empresa abre su propio gauge y gráfico; cambiar de ambiente relee la empresa y muestra `SIN_TOKEN`/`VISTA_EMPRESAS_NO_DISPONIBLE` si no hay token.
5. Un módulo `degraded` se muestra **En riesgo** (65), no **Crítico**.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/health.test.js`, `apps/control-tower/test/modules.test.js`, `apps/control-tower/test/server.test.js`, `apps/api/test/apex-control-modules.test.js`.
- Certificación: `npm run certify:control-tower:local`, evidencia en `docs/qa/evidence/apex-control-tower-f1/`.
- Evidencia específica: `docs/qa/evidence/tower-health-charts-20261103/`.
- `certification_status`: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Aislamiento por empresa — la ruta por empresa reutiliza la guarda, el permiso explícito y la allowlist; probado con 403 y 404.
- Lectura de solo lectura de la torre — sin escrituras ni git write.
- Tokens fuera del cliente — `apexTokenConfigured` es booleano; las capturas y el snapshot no contienen valores.

## 8. Riesgos y rollback

- Riesgo: recalibrar `degraded` de 55 a 65 altera puntajes publicados. Mitigación: umbrales documentados y pruebas de frontera. Rollback: revert del commit.
- Riesgo: la ruta por empresa podría ampliar alcance si se ignora la allowlist. Mitigación: prueba dedicada de 403/404 e id inválido.
- Rollback general: revert del commit, nunca `reset --hard`.

## 9. Supuestos y preguntas abiertas

- Supuesto: QA y PROD entregarán datos cuando exista `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN`; la torre no puede acuñar JWTs remotos con la clave local.
- Pregunta abierta: renovar `RAILWAY_TOKEN` y pegar `SUPABASE_ACCESS_TOKEN`/`VERCEL_TOKEN` es una decisión del usuario, fuera del código.

## 10. Autorizaciones requeridas

- [ ] Ninguna adicional para este cambio en `desarrollo`.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight**: `npm run agents:preflight -- --paths "apps/api/src/modules/apex-control,apps/api/test,apps/control-tower,docs/qa,docs/briefs,scripts/certifications,agents"` → `OK_CON_ADVERTENCIAS`; requeridos `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-qa`.
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-qa`; adicional `apexos-performance` por la tabla de ruteo de `apps/control-tower/**`.
- **Documentación actualizada**: este brief, `apps/control-tower/README.md`, `docs/qa/evidence/tower-health-charts-20261103/notes.md`.
- **Agentes a actualizar**: `apexos-backend` `2.2.0` → `2.3.0`; `apexos-seguridad` `2.2.0` → `2.3.0`; `apexos-qa` `2.3.0` → `2.4.0`; `apexos-performance` `2.2.0` → `2.3.0`; `equipo-apexos` `2.1.0` → `2.2.0`; `apexos-brief` `2.3.0` → `2.4.0`.
- **Registro**: `agents/registry.json` con `version`, `updated_at` y `sha256`, y entrada en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage -- --paths "<inventario exacto>"` → pruebas → commit → `git push origin desarrollo`.
- **Fuera de alcance**: `docs/design/APEXOS_CONTROL_PLANE.md` sin seguimiento no entra al inventario ni a la cobertura; se declara ajeno a esta intervención.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde
- [ ] Sin secretos ni artefactos locales en el diff
- [ ] Documentación y agentes en el mismo commit
