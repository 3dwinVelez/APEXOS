# Brief 2026-11-07 — Plan de promociones `desarrollo` → `develop`: 509 rutas repartidas en paquetes

## Origen

Instrucción vigente del dueño: *continua lo que falta para subir todo a develop*. Antecedente inmediato: la auditoría por blob de la divergencia (`docs/project/divergencia-desarrollo-develop-20261107.md`, tarea #38) y la ronda 7C del Comercio, que ya cerró su propio paquete con PR #83 mergeado en `2cb064e2`.

## Detonante: «subir todo» como merge de rama completa no es conforme

Medido contra el target vigente `origin/develop = 2cb064e2` (merge-base de las dos ramas: `0b03f3fd`):

| Medida | Valor |
|---|---|
| Rutas distintas `origin/develop..origin/desarrollo` | **509** (338 `A` / 79 `M` / 92 `D`) |
| Modificadas en ambas ramas (conflicto bilateral de contenido) | 79 |
| Conflictos que produciría un merge de rama completa (`git merge-tree --write-tree`) | **25** (11 de código) |
| Rutas que el merge borraría de `develop` | **92** |

Las 92 `D` no son basura: son funcionalidad ya liberada en `develop` que `desarrollo` nunca retrointegró (`hr/payrollWorkdays.js`, `hr/employeeUserLink.js`, `accounting/reversal.js`, la página `contabilidad/pyg/ampliado`, 3 archivos de `transport-pyg/account-*`, 28 pruebas y 9 certificaciones, más 43 manifiestos y certificaciones de promociones anteriores). `AGENTS.md` exige una entrada `allowed_deletions` puntual por cada `D` y prohíbe usar un árbol viejo como línea base, así que **ningún paquete de este plan se construye copiando el árbol de `desarrollo`**: se construye sobre el tip de `develop` y solo agrega o modifica hunks, con `0 D` como criterio de aceptación.

Inventario completo por paquete: `docs/qa/evidence/plan-promociones-20261107/inventario-por-paquete.json` (generator: clasificación por prefijo de ruta sobre `git diff --name-status origin/develop..origin/desarrollo`).

## Paquetes

| # | Paquete | Rutas | Conflictos | Certificación exigida | Autorización |
|---|---|---|---|---|---|
| 1 | **Contrato de equipo**: `.qoder/skills/**`, `agents/**`, `AGENTS.md` + la maquinaria `scripts/agents/**`, `scripts/test/agents-*.test.js` y las 5 líneas `agents:*` de `package.json` | 39 (37 `A` / 2 `M` / 0 `D`) | **0** — los blobs de `develop` en esas 27 rutas son idénticos a la merge-base | `scripts/certifications/agents-contract-promotion-local.js` (gates de agentes sobre el árbol del candidato) | ya otorgada por la instrucción general |
| 2 | **P0 vigencia laboral 2026** (nómina y marcaciones) | 13 hr/prisma + pruebas y certificaciones | **Sí**: `hr/service.js`, `hr/timeLogic.js`, `schema.prisma`, `core/prisma.js` | certificación de nómina/marcaciones sobre el candidato, con las 4 rutas liberadas en `develop` preservadas | **falta**: decisión bilateral `night_start` |
| 3 | **Contabilidad: facturas recibidas + buzón** | 39 + 4 certificaciones `received-invoices-*` | **Sí**: `accounting/routes.js` y 9 `D` de PYG ampliado/reversión | certificación IMAP + navegador del monitor | **falta**: qué hacer con las 9 rutas `D` (retrointegrar antes, tarea #44) |
| 4 | **`apex-control` en la API** (la otra mitad del dato de la torre) | 13 + `server.js`, `core/prisma.js`, `middleware/rbac.js`, `fabric/*` | **Sí**, y toca aislamiento por tenant | certificación de health/endpoints + RBAC | **falta**: decisión bilateral del plumbing común |
| 5 | **Documentación de proyecto** (`docs/project`, `docs/audits`, `docs/design`, `docs/DATABASE_*`) | 16 | 0 | no es producto; viaja como gobernanza dentro del paquete que la necesite | la del paquete anfitrión |
| 6 | **Evidencia y briefs históricos** (`docs/qa/**`) | 240 (43 `D`) | n/a | n/a | **excluido por decisión del dueño**, salvo la evidencia que el guard `ci-promotion` exige versionar dentro del candidato |
| 7 | **Transporte PYG** | 7 (3 `D`) | Sí | certificación 52/52 de la ronda original | **falta**: same que paquete 3 |
| — | **`apps/control-tower/**`** | 41 `A` | 0 | n/a | **excluido por residencia**: herramienta de puesto de trabajo, solo `desarrollo` (registrado en `docs/project/flujo-ramas-y-ambientes.md`) |

Orden: 1 → 2 → 3/7 → 4. El paquete 1 va primero porque es el único que se puede medir sin decidir nada, y porque deja en `develop` la maquinaria (`scripts/agents/**`) con la que los paquetes siguientes se auditan entre sí — el punto ciego que la auditoría encontró: `agents:preflight` solo compara contra `origin/desarrollo`, así que nunca ve que `develop` tiene skills distintos.

## Reglas que gobiernan todos los paquetes

1. Candidato sobre el tip vigente de `develop`, nunca sobre la merge-base vieja; se mide `git diff --name-status origin/develop..candidato` y debe igualar el inventario del manifiesto con `0 D`.
2. Forma obligatoria: rama auxiliar `codex/qa-<cambio>` + PR hacia `develop` (`.github/workflows/ci.yml` solo enruta `ci-promotion` a ese patrón).
3. Los dos manifiestos (`-scope.json`, `-preqa.json`) y toda la evidencia citada viajan **dentro del candidato**; un archivo no puede llevar el sha del commit que lo contiene, así que las cabeceras declaran el commit **medido**.
4. Antes de empujar: `node scripts/git-governance-guard.js ci-promotion <candidato> origin/develop develop refs/heads/<rama>` y `node scripts/certifications/scoped-qa-governance-local.js`.
5. Un archivo bilateral no se resuelve por preferencia: se declaran las dos lecturas y su consecuencia, y se decide por lo que el ambiente liberado hace mal.
6. Ninguna migración remota se aplica desde esta estación; no hay force push; no se borran ramas; nada pasa a `main`.

## Criterios de aceptación del paquete 1

| Criterio | Medida |
|---|---|
| Agrega, no borra | diff `2cb064e2..candidato` = 39 rutas, `0 D` |
| Las 27 rutas del contrato viajan idénticas a `desarrollo` | hash de blob ruta por ruta contra `origin/desarrollo` |
| `package.json` solo aporta las 5 entradas `agents:*` | diff contra `origin/develop` limitado a esas líneas |
| El contrato se ejecuta en el destino | `test:agents`, `agents:check`, `agents:preflight`, `agents:coverage` verdes sobre el árbol del candidato |
| Toda comando `npm run` citado por el contrato existe en `develop` | el certificador lo enumera; excepción declarada: 4 fichas de `certify:control-tower:*` / `control:test`, que `AGENTS.md` marca como residentes en `desarrollo` |
| Puertas de promoción | `ALCANCE DE PROMOCION VALIDO` y `AUTORIZACION PRE-QA VALIDA` + `PROMOCION CI ALCANZADA` en local |

## Lo que este brief NO afirma

- Que los paquetes 2-4 estén listos para promover: cada uno tiene al menos un archivo bilateral cuya resolución no se tomó aquí.
- Que `desarrollo` quede completo: la deuda de retrointegración (#44) sigue abierta y es la causa de las 92 `D`.
- Que el entorno QA/producción tenga la vigencia laboral 2026: mientras el paquete 2 no se promueva y sus migraciones no corran, el ambiente liberado sigue calculando con parámetros anteriores.
- Nada de `main`, infraestructura ni secretos.
