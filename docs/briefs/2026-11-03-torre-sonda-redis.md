# Brief — sonda Redis de la torre apex-control

- **ID**: `2026-11-03-torre-sonda-redis`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "antes de comenzar con algo deja operativa la torre de control y limpio cualquier problema que podamos tener de compilacion cuando termines me confirmas que todo este correctamente funcionando al finalizar levanta el apex control para trabajar"

## 1. Objetivo

Dejar la torre apex-control operativa en esta máquina y corregir el defecto que reportaba Redis `down` con el contenedor arriba: `redisPing` abría el socket pero nunca llamaba a `connect`, por lo que toda medición terminaba en `timeout`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/lib/probes.js` | `redisPing` conecta el socket antes de esperar `+PONG`. |
| `A` | `apps/control-tower/test/probes.test.js` | Prueba hermética con servidor TCP efímero: PONG y puerto cerrado. |
| `M` | `apps/control-tower/README.md` | Documenta la sonda TCP propia y el diagnóstico de Redis en `down`. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | Control nuevo: sondas TCP con `connect` y prueba propia. Versión `1.3.0`. |
| `M` | `agents/registry.json`, `agents/apexos-performance/SKILL.md`, `agents/CHANGELOG.md` | Espejo, sha256 y bitácora del agente. |

### Módulos (`change_intent.modules`)

- `apex-control-tower`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- API, web, esquema Prisma y migraciones: sin cambios.
- Promoción a `develop` o `main`; certificación QA y publicación.
- Credenciales reales de Railway, Vercel, Supabase, Telegram o puente.

## 4. Restricciones

- Rama: solo `desarrollo`. Sin push, merge ni migración remota en este cambio.
- Sin secretos en el diff: `.env.local` queda fuera por `.gitignore`.
- Sin cambios de contrato del panel ni del endpoint `/api/status`.

## 5. Criterios de aceptación

1. `node --test apps/control-tower/test/probes.test.js` → 2/2.
2. `npm run control:test` → 44/44 con API local en `127.0.0.1:3000`.
3. `GET /api/status` con infra local arriba → `local/redis: ok` y `detail: "PING -> PONG"`.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/probes.test.js` y suite completa de la torre.
- Certificación: pendiente `npm run certify:control-tower:local` para promoción; no se ejecutó en este cambio.
- `certification_status` esperado: `local_passed_qa_pending` al promover.

## 7. Capacidades protegidas

- Diagnóstico de infraestructura local: un Redis sano no debe reportarse caído.
- Observabilidad del panel: `overall` y alertas dependen del estado real de las sondas.

## 8. Riesgos y rollback

- Riesgo: conexión a un host/ puerto no publicado ahora reporta error de red inmediato en vez de timeout → Mitigación: detalle técnico conserva host, puerto y respuesta. Rollback: revertir el commit, no reset.

## 9. Supuestos y preguntas abiertas

- Supuesto: Redis local se publica en `127.0.0.1:6379` (contenedor `infra-redis-1`).
- Pregunta: ninguna que altere el alcance.

## 10. Autorizaciones requeridas

- [ ] Commit y `git push origin desarrollo`: pendientes de confirmación del owner al cierre.
- [ ] Certificación y promoción a `develop`: requieren autorización independiente.

## 11. Documentación, agentes y publicación (obligatoria)

- **Documentación a actualizar**: `apps/control-tower/README.md` y este brief.
- **Agentes a actualizar**: `apexos-performance` `1.2.0` → `1.3.0`; control nuevo: sondas TCP con conexión y prueba propia.
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run control:test` → commit.
- **Publicación obligatoria**: `git push origin desarrollo` al autorizar el cierre. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
