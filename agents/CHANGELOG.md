# Changelog de agentes — Equipo APEXOS

Formato: `YYYY-MM-DD` — agente — `version` — cambio. La versión sigue semver: major cambia rol/contrato, minor agrega control o especialidad, patch corrige redacción o rutas.

## 2026-11-03

### Contexto vivo y frescura de agentes

- Se agrega `npm run agents:preflight`: compara semver, `updated_at` y `sha256` contra `origin/desarrollo`, bloquea con `INTEGRAR_REMOTO`/`CONFLICTO` y rutea las rutas de la intervención a los agentes obligatorios.
- `AGENTS.md` incorpora el protocolo de contexto vivo y la tabla de ruteo obligatorio; la sección de documentación exige preflight antes de editar y al cierre.
- `docs/briefs/_TEMPLATE.md` sección 11 declara agentes consultados y exige preflight sin bloqueos.
- `equipo-apexos` — `1.3.0` — el despacho parte del preflight; no cierra sin agentes consultados y actualizados.
- `apexos-brief` — `1.2.0` — el preflight es puerta del brief y define los agentes consultados.
- `apexos-git-guardian` — `1.2.0` — reglas de frescura: fetch permitido, veredictos bloqueantes y prohibición de sobrescribir referencias remotas.

### Contrato de equipo y entrenamiento de contenido

- Se crea `docs/project/CONTRATO_EQUIPO_APEXOS.md` (v2): regla de oro del contexto vivo, preflight, tabla de dueños, contrato obligatorio por agente, checklist universal, evidencia, handoff y antipatrones.
- Se crea `agents/TEMPLATE_SKILL.md` como plantilla de `contract: 2` para migrar el resto del equipo.
- `apexos-frontend` — `2.0.0` — migra a `contract: 2`; homologación obligatoria antes que creatividad, catálogo de componentes y pantallas de referencia, tokens sin hex, dos temas, evidencia de navegador. Nuevos controles: `contrato-v2`, `catalogo-componentes`, `pantallas-referencia`, `homologacion-obligatoria`, `tokens-sin-hex`.
- `apexos-db-nube` — `2.0.0` — migra a `contract: 2`; convención de tablas snake_case plural, checklist de tabla nueva, migración forward-only, índices por tenant y dinero en `Decimal`. Nuevos controles: `contrato-v2`, `convencion-tablas`, `checklist-tabla-nueva`, `migracion-forward-only`, `indices-tenant`, `dinero-decimal`.
- `docs/design/APEXOS_COMPONENT_CATALOG.md` ordena tokens, primitivas, pantallas de referencia y prohibiciones medidas (269 hex, 93 tablas crudas frente a 8 `DataTable`).
- `docs/DATABASE_CONVENTIONS.md` documenta el estado medido (191 modelos, 639 columnas `tenant_id`, 216 `Float` heredados) y las reglas para no repetir la deuda.
- `agents:check` valida que todo agente con `contract: 2` tenga las secciones obligatorias, en orden, no vacías y con lecturas existentes.
- `npm run agents:coverage` se vuelve bloqueante: cada agente dueño de una ruta debe tener bump local frente a `origin/desarrollo` y mención en la sección más reciente de este changelog.
- El preflight deja de perder el primer carácter de la primera ruta de `git status --porcelain` y de marcar `CONFLICTO` en ediciones locales del mismo día cuando `origin/desarrollo` ya está contenido en `HEAD`.
- `equipo-apexos` — `1.4.0` — el cierre exige `agents:coverage` y no admite actualizar al dueño en una intervención posterior.
- `apexos-brief` — `1.3.0` — la sección 11 declara dueño por ruta y exige cobertura en verde.
- `apexos-git-guardian` — `1.3.0` — la secuencia de cierre incluye `agents:coverage`; sin cobertura no hay commit ni push.

### Fase 2: backend, seguridad y QA

- `apexos-backend` — `2.0.0` — migra a `contract: 2`; contexto de tenant obligatorio, permisos explícitos por guardas, JWT HS256 con `timingSafeEqual`, rate limit por tenant, `Server-Timing` por fases, P2028 como contención, doble almacén, auditoría dependiente de Redis, subidas con firma real y torre fuera de `apps/api`. Nuevos controles: `contrato-v2`, `tenant-context-obligatorio`, `permisos-explicitos`, `jwt-hs256`, `rate-limit-por-tenant`, `uploads-firma-real`, `torre-fuera-api`.
- `apexos-seguridad` — `2.0.0` — migra a `contract: 2`; el tenant como única frontera donde no hay RLS, secretos fuera del repositorio y del cliente, JWT sin atajos, uploads por firma, dependencias justificadas, hallazgos con reproducción y tokens cloud de la torre solo en servidor. Nuevos controles: `contrato-v2`, `tenant-unico-filtro`, `jwt-timing-safe`, `uploads-firma-real`, `dependencias-justificadas`, `torre-tokens-server-only`, `hallazgos-con-reproduccion`.
- `apexos-qa` — `2.0.0` — migra a `contract: 2`; certificación bloqueante, manifiesto v2 exacto contra el target remoto, capacidades protegidas juntas, arnés vs producto, aprobación explícita de `main`, evidencia sin datos personales y harness aislado. Nuevos controles: `contrato-v2`, `certificacion-bloqueante`, `manifiesto-v2-exacto`, `capacidades-juntas`, `arnes-vs-producto`, `aprobacion-main-explicita`, `evidencia-sin-pii`, `harness-aislado`.

### Fase 3: proceso, orquestación y auditores

- `agents:sync` y `agents:check` exigen `contract: 2` a todo agente registrado; un agente nuevo o una regresión a `contract: 1` bloquea la sincronización y la validación. La suite `test:agents` verifica que los once agentes cumplen el contrato y sus lecturas obligatorias existen.
- `apexos-performance` — `2.0.0` — migra a `contract: 2`; presupuesto bloqueante medido a concurrencia 10 (frontend document 1000 ms, API 1000 ms, Supabase REST 700 ms), p95 por ambiente en vez de promedio global, sondas TCP verificadas contra servidor efímero, escritura de volumen solo en Nyvora QA, inframestructura solo con autorización. Nuevos controles: `contrato-v2`, `p95-por-ambiente`, `sondas-verificadas`, `escritura-solo-nyvora-qa`, `infra-con-autorizacion`.
- `apexos-brief` — `2.0.0` — migra a `contract: 2`; rutas verificadas antes de citarlas, inventario A/M/D exacto como insumo del manifiesto v2, criterios observables, gates `preqa`/`approval` declarados desde el brief y prohibición de secretos. Nuevos controles: `contrato-v2`, `rutas-verificadas`, `criterios-observables`, `gates-preqa-aprobacion`, `sin-secretos`.
- `apexos-git-guardian` — `2.0.0` — migra a `contract: 2`; gate de alcance v2 con entradas exactas y `allowed_deletions`, candidato contra el target remoto vigente, evidencia pre-QA y de aprobación con sus campos obligatorios, y prohibición de operaciones destructivas sin autorización. Nuevos controles: `contrato-v2`, `gate-alcance-v2`, `candidato-vs-target-remoto`, `evidencia-preqa`, `evidencia-aprobacion`, `sin-operaciones-destructivas`.
- `equipo-apexos` — `2.0.0` — migra a `contract: 2`; despacho por ruteo del preflight, conflictos resueltos por gobernanza, cobertura bloqueante, auditores solo para dictamen, torre de solo lectura y confirmación de acciones irreversibles. Nuevos controles: `contrato-v2`, `auditores-solo-dictamen`, `torre-solo-lectura`, `confirmacion-irreversible`.
- `apexos-auditor-marcaciones` — `2.0.0` — migra a `contract: 2`; tres pasadas separadas, cita `archivo:linea`, reproducción obligatoria antes de reportar, configuración real del tenant, anonimización y sin veredicto legal propio. Nuevos controles: `contrato-v2`, `tres-pasadas`, `cita-archivo-linea`, `reproducir-antes-de-reportar`, `sin-veredicto-legal`.
- `apexos-auditor-nomina` — `2.0.0` — migra a `contract: 2`; recálculo independiente por concepto, cuadre preview/liquidación/cierre/aportes/provisiones, delta económico por P0, tres pasadas y sin veredicto legal propio. Nuevos controles: `contrato-v2`, `tres-pasadas`, `delta-economico`, `sin-veredicto-legal`.

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
