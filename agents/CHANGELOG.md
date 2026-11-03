# Changelog de agentes — Equipo APEXOS

Formato: `YYYY-MM-DD` — agente — `version` — cambio. La versión sigue semver: major cambia rol/contrato, minor agrega control o especialidad, patch corrige redacción o rutas.

## 2026-11-03

### Torre apex-control

- `apexos-performance` — `1.3.0` — control nuevo: las sondas TCP deben llamar a `connect` y probarse contra un servidor efímero; un `timeout` del probe no se confunde con caída del servicio vigilado. Origen: la sonda Redis de la torre nunca conectaba y reportaba `down` con el contenedor arriba.

## 2026-11-02

### Registro y gobernanza

- Se crea `agents/` como espejo portable del equipo, con `registry.json` (versión, fecha, `sha256`, controles) y este changelog.
- Se agregan `npm run agents:sync` y `npm run agents:check`; `restore` reconstruye `.qoder/skills` desde el espejo en otra máquina.
- `AGENTS.md` incorpora la sección **Documentation, agents and publication**: toda intervención actualiza documentación y agentes, y autoriza de forma permanente y acotada `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- `docs/briefs/_TEMPLATE.md` incorpora la sección 11 obligatoria (documentación, agentes y publicación) y ajusta la restricción de push.

### Agentes

- `equipo-apexos` — `1.1.0` — roster completo (brief y auditores), validación de `registry.json` contra `origin/desarrollo`, cierre obligatorio con documentación, agentes y push acotado.
- `apexos-brief` — `1.1.0` — preflight de versiones y fechas, regla semver/sha256 para no sobrescribir versiones nuevas, sección 11 obligatoria y publicación a `origin/desarrollo`.
- `apexos-backend` — `1.1.0` — motor HR (IBC sin fallback, cierre con provisiones), tenant como único filtro, contención P2028, doble almacén, alias `/hr` y `/talento-humano`, auditoría dependiente de Redis, pruebas con Prisma falso.
- `apexos-db-nube` — `1.1.0` — migraciones idempotentes validadas dos veces, sin nube por defecto, RLS compensatorio, seeds por tenant, tipos monetarios, alineación real de esquemas.
- `apexos-frontend` — `1.1.0` — una vista por concepto, formulario consolidado, reutilización de la tubería, `next build` y rutas tipadas, evidencia en navegador y ambos temas.
- `apexos-git-guardian` — `1.1.0` — push acotado a `origin/desarrollo`, manifiesto de alcance v2, comparación contra target remoto, worktrees y recuperación sin snapshot viejo.
- `apexos-performance` — `1.1.0` — P2028 como contención, harness en `%TEMP%`, `performance:guard` bloqueante, rutas calientes y `Server-Timing`.
- `apexos-qa` — `1.1.0` — carreras del arnés vs fallos de negocio, harness aislado, puertas de evidencia, regresión HR, UI en navegador y bloqueo explícito.
- `apexos-seguridad` — `1.1.0` — RLS no universal y fuga medida por falta de contexto, service role, tokens, uploads, RBAC de HR y revisión de secretos precommit.
- `apexos-auditor-marcaciones` — `1.1.0` — estado de la remediación 2026-10-30, R-01..R-05 en `desarrollo`, `main` sin motor corregido y firma legal pendiente.
- `apexos-auditor-nomina` — `1.1.0` — R-04/R-05 implementados en `desarrollo`, evidencia local (IBC 7/7, cierre 2/2, HR 175/175), R-06..R-10 abiertos y firma legal pendiente.
