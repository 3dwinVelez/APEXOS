# Brief — Torre: conexión real con QA y PROD

- **ID**: `2026-11-03-torre-conexion-ambientes`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "veo que falta conectar los ambientes de develop y main con datos reales de la herramienta ajusta todo para que exista una conexion real"

## 1. Objetivo

Determinar por qué los ambientes `develop` y `main` no entregan datos reales, corregir el diagnóstico de la torre para que publique la causa exacta —credencial faltante frente a build sin el módulo— y exponer el build desplegado (commit y cantidad de módulos) que cada API reporta en `GET /health`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/lib/modules.js` | Sonda sin credencial para distinguir `401` (`SIN_TOKEN`) de `404` (`MODULO_NO_DESPLEGADO`); `requestModules` compartido |
| `M` | `apps/control-tower/lib/activity.js` | Misma clasificación para actividad y empresas; sin token no inventa `Authorization` |
| `M` | `apps/control-tower/lib/probes.js` | Publica `deployed` (`version`, `commit`, `modules`) desde `/health`; normaliza `commit: "unknown"` |
| `M` | `apps/control-tower/public/app.js` | Build en tab y encabezado; aviso `MODULO_NO_DESPLEGADO` con el commit afectado |
| `M` | `apps/control-tower/test/modules.test.js` | 401/404 con y sin token; la sonda no lleva credencial |
| `M` | `apps/control-tower/test/activity.test.js` | 401/404 con y sin token; token local no viaja a remotos |
| `M` | `apps/control-tower/test/environments.test.js` | `/health` publica commit, versión y módulos |
| `M` | `apps/control-tower/package.json` | `1.1.0` → `1.2.0` |
| `M` | `apps/control-tower/README.md` | Sección "Conexión real con QA y PROD" y códigos de motivo |
| `A` | `docs/briefs/2026-11-03-torre-conexion-ambientes.md` | Este brief |
| `A` | `docs/qa/evidence/tower-env-connection-20261103/` | Suite, sondas reales, snapshot saneado, UI y notas |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md`, `agents/*/SKILL.md`, `.qoder/skills/*/SKILL.md` | Controles y versiones del equipo |

### Módulos (`change_intent.modules`)

- `control-tower`
- `agents`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- No se promueve `desarrollo -> develop` ni `develop -> main`, no se despliega en Railway y no se ejecutan migraciones remotas: requieren autorización explícita e independiente.
- No se modifica `.env.local` ni se inventan credenciales. Los JWT de QA y PROD deben salir de usuarios de esos ambientes.
- No se usa la base de datos de QA/PROD como vía paralela de lectura entre empresas.
- `docs/design/APEXOS_CONTROL_PLANE.md` sigue sin seguimiento y ajeno a esta intervención.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre.
- La torre es de solo lectura; la sonda sin token es un `GET` a la ruta pública sin `Authorization`, no una prueba de credenciales.
- Ningún token, JWT ni llave aparece en logs, snapshot, capturas o diff.

## 5. Criterios de aceptación

1. `npm test` en `apps/control-tower` → 68/68 en verde.
2. Contra las APIs reales: `develop` y `main` muestran `MODULO_NO_DESPLEGADO`, no `SIN_TOKEN`, cuando la ruta responde 404.
3. El tab y el encabezado muestran el build desplegado: QA `a505e97` (18 módulos), PROD `938fc2b` (17 módulos).
4. Con un `401` en la ruta, el motivo vuelve a ser `SIN_TOKEN`, lo que confirma build con módulo y JWT pendiente.
5. `GET /api/snapshot` expone `deployed` por ambiente sin secretos.
6. Navegador real: tres tabs, aviso correcto por ambiente y consola sin errores.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/{modules,activity,environments,health}.test.js`.
- Evidencia específica: `docs/qa/evidence/tower-env-connection-20261103/` (`tower-suite.txt`, `real-probe.txt`, `snapshot-environments.json`, `ui-environments.json`, capturas).
- Certificación de navegador vigente: `npm run certify:control-tower:local` (simulación) sin cambios de pasos.
- `certification_status`: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Aislamiento por empresa — no se agrega ninguna ruta nueva ni lectura directa a la base.
- Token por ambiente — el token local no se envía a QA ni PROD, ni siquiera en la sonda.
- Solo lectura — la torre no escribe en los ambientes ni en git.

## 8. Riesgos y rollback

- Riesgo: una sonda sin credencial por ciclo. Mitigación: dos `GET` ligeros cada 10 s, con timeout y sin `Authorization`; solo cuando el ambiente no tiene token.
- Riesgo: clasificar mal un 404 de proxy como build ausente. Mitigación: el mensaje nombra el commit y la acción (desplegar), y un 401 restablece `SIN_TOKEN`.
- Rollback: revert del commit, nunca `reset --hard`.

## 9. Supuestos y preguntas abiertas

- Hecho verificado: `apex-control` nació en `2a186a63` (2026-11-02); QA corre `a505e97f9622` (29-oct) y PROD `938fc2b6f42c` (26-oct).
- Decisión pendiente del usuario: autorizar la promoción y el despliegue de un build con `apex-control`, y entregar los JWT de cada ambiente. Sin eso, los datos por módulo no pueden existir en QA/PROD.

## 10. Autorizaciones requeridas

- [ ] Ninguna adicional para este cambio en `desarrollo`.
- [ ] Fuera de este brief: autorización explícita para promover y desplegar en `develop` y `main`.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight**: `npm run agents:preflight -- --paths "apps/control-tower,docs/qa,docs/briefs,agents"`.
- **Agentes consultados**: `equipo-apexos`, `apexos-performance`, `apexos-seguridad`, `apexos-qa`; `apexos-brief` por el inventario.
- **Documentación actualizada**: este brief, `apps/control-tower/README.md`, `docs/qa/evidence/tower-env-connection-20261103/notes.md`.
- **Agentes a actualizar**: `apexos-performance` `2.3.0` → `2.4.0`; `apexos-seguridad` `2.3.0` → `2.4.0`; `apexos-qa` `2.4.0` → `2.5.0`; `equipo-apexos` `2.2.0` → `2.3.0`; `apexos-brief` `2.4.0` → `2.5.0`.
- **Registro**: `agents/registry.json` con `version`, `updated_at` y `sha256`, y entrada en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage -- --paths "<inventario exacto>"` → pruebas → commit → `git push origin desarrollo`.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde
- [ ] Sin secretos ni artefactos locales en el diff
- [ ] Documentación y agentes en el mismo commit
