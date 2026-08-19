# ERP Modular Repository Preparation Report

Fecha: 2026-08-06.
Fase: reconciliacion controlada de ramas previa a auditoria ERP modular.

## 1. Estado inicial

Repositorio verificado:

```text
C:/Users/mq1/Documents/Proyectos/APEXOS
```

El worktree principal esta en `main` y conserva archivos no rastreados bajo
`docs/releases/`. Por politica, no fue modificado.

Worktree autorizado para escritura:

```text
C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/desarrollo-login-visibility
```

Estado inicial del worktree autorizado:

```text
Rama: desarrollo
HEAD: 839791973dad4b7b39336367130e4064bdabdddc
origin/desarrollo: 839791973dad4b7b39336367130e4064bdabdddc
worktree: limpio
```

## 2. Ramas

| Rama | HEAD local/remoto identificado | Funcion |
| --- | --- | --- |
| `desarrollo` | `839791973dad4b7b39336367130e4064bdabdddc` | Implementacion autorizada. |
| `develop` | `650ad482761c3b2c5cc88f82c5e1772920582123` | QA e integracion. |
| `main` | `3c85eaeaf01884c3fba5046795fdfa0fc9543598` | Produccion. |

## 3. Worktrees

| Worktree | Rama | HEAD |
| --- | --- | --- |
| `C:/Users/mq1/Documents/Proyectos/APEXOS` | `main` | `3c85eae` |
| `C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/desarrollo-login-visibility` | `desarrollo` | `8397919` |
| `C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/develop-ui-v3-promotion` | `develop` | `650ad48` |
| `C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/develop-login-visibility` | `codex/operational-ui-v3-local` | `3a3ddf3` |
| `C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/integration-ui-v3-validated` | `integration/ui-v3-validated` | `e99acf7` |

## 4. HEAD locales y remotos

```text
desarrollo: 839791973dad4b7b39336367130e4064bdabdddc
origin/desarrollo: 839791973dad4b7b39336367130e4064bdabdddc
develop: 650ad482761c3b2c5cc88f82c5e1772920582123
origin/develop: 650ad482761c3b2c5cc88f82c5e1772920582123
main: 3c85eaeaf01884c3fba5046795fdfa0fc9543598
origin/main: 3c85eaeaf01884c3fba5046795fdfa0fc9543598
```

## 5. Archivos no rastreados en main

| Archivo | Clasificacion | Accion aplicada |
| --- | --- | --- |
| `docs/releases/AUTHORIZATION_VERSIONS_PRODUCTION_MIGRATION_ASSESSMENT.md` | Evaluacion de migracion de release; no pertenece como cambio directo a `main`. | Reconstruido en `docs/releases/assessments/AUTHORIZATION_VERSIONS_MIGRATION_RELEASE_ASSESSMENT.md`. |
| `docs/releases/EVIDENCE_QUARANTINE_PRODUCTION_MIGRATION_ASSESSMENT.md` | Evaluacion de RLS/Storage; requiere validacion QA. | Reconstruido en `docs/releases/assessments/EVIDENCE_QUARANTINE_MIGRATION_RELEASE_ASSESSMENT.md`. |
| `docs/releases/UI_V3_PRODUCTION_MIGRATION_READINESS.md` | Readiness de migracion hacia `main`; complementa readiness QA. | Reconstruido como anexo en `docs/releases/assessments/UI_V3_RELEASE_MIGRATION_READINESS.md`. |

No se movieron, eliminaron ni versionaron directamente desde el worktree de
`main`.

## 6. Clasificacion documental

Los tres documentos no rastreados contienen informacion de release, fechas,
commits y dictamenes, pero no contienen credenciales ni secretos visibles.
Incluyen informacion operacional de QA/produccion y por eso se conservaron como
evidencia consolidada en `desarrollo`.

## 7. Commits exclusivos de cada rama

### Desarrollo frente a main

Commits exclusivos relevantes de `desarrollo` frente a `main`:

```text
b00fe8b docs: clarify qa railway promotion readiness
8b3c995 docs: record ui v3 qa readiness blockage
254d3fc docs: record ui v3 promotion to desarrollo
fb1cb39 merge: integrate validated operational ui v3
e99acf7 docs: add ui v3 promotion performance standards
d84d6b0 docs: publish final ui v3 remediation decision
c93c9c2 docs: record final ui v3 benchmark sample
56b1b3c perf: disable mobile route prefetch noise
6df19b5 perf: disable dashboard shell prefetch noise
bb685ef test: instrument ui v3 route waterfalls
b94f8e0 docs: isolate ui v3 route regressions
993429a docs: publish ui v3 final integration decision
d25ed48 docs: record final ui v3 benchmark raw data
37d87f9 docs: update ui v3 benchmark coverage methodology
bd52961 perf: defer projects charts from server bundle
ddc0c14 test: instrument corrected ui v3 benchmark
a7077c2 docs: update operational ui continuation evidence
7bd7c59 refactor: migrate administration and services screens
15fa508 docs: publish visual performance results
bdc57a5 perf: reduce dashboard visual weight
```

### Main frente a desarrollo

Commits exclusivos relevantes de `main` frente a `desarrollo`:

```text
3c85eae fix(web): restore service correction visibility
2678100 merge: release service evidence actions
76dadad merge: promote service evidence actions to develop
906deaa merge: release service correction visibility
05efc04 merge: promote service correction visibility to develop
afbd390 merge: promote service order editing to main
d850bc1 merge: promote desarrollo into develop
e14a844 chore(governance): enforce branch flow controls
55a565c Revert "merge: promote develop into main"
5d0d05f merge: promote develop into main
```

### Develop frente a desarrollo

```text
650ad48 merge: restore service correction visibility
8e3abaa merge: promote validated desarrollo to qa
76dadad merge: promote service evidence actions to develop
05efc04 merge: promote service correction visibility to develop
d850bc1 merge: promote desarrollo into develop
```

`git diff desarrollo..develop` y `git diff --stat desarrollo..develop` no
reportaron diferencias de arbol. Se clasifica como divergencia historica sin
diferencia funcional neta.

## 8. Diferencias funcionales

`main` difiere significativamente del arbol de `desarrollo`. La diferencia
incluye eliminaciones en `main` frente a documentacion UI/performance/offline,
migraciones pendientes, scripts de certificacion y codigo de soporte. Esa
diferencia proviene de releases parciales y de la reversion `55a565c`, por lo
que no debe resolverse con merge completo ni cherry-pick masivo.

## 9. Divergencias solo historicas

Los cinco commits exclusivos de `develop` son commits de merge/promocion. El
arbol actual de `develop` es equivalente al de `desarrollo`, por lo que no hay
resolucion de merge que deba regresar a `desarrollo`.

## 10. Correcciones productivas

| Commit | Tipo | Contenido real | Existe en desarrollo | Riesgo | Accion |
| --- | --- | --- | --- | --- | --- |
| `3c85eae` | Cherry-pick productivo | `apps/web/lib/rolePermissions.ts` y prueba `role-permissions-special-edit` | Si; proviene de `8397919` en `desarrollo` | Bajo | No accion - contenido ya presente. |
| `2678100` | Merge release | Integra acciones de evidencia desde `develop` a `main` | Contenido fuente esta en `desarrollo`/`develop` | Medio si se remergea | No accion - solo merge de release. |
| `906deaa` | Merge release con conflictos | Resoluciones en `supabaseAuth`, pruebas de Supabase y `moduleAccess` | `desarrollo` contiene version de trabajo mas nueva | Medio | Bloquear cherry-pick; documentar. |
| `afbd390` | Merge release | Promueve edicion de ordenes de servicio y parte de evidencia/CSP | `desarrollo` contiene linea funcional mas completa | Alto si se porta en bloque | No accion - solo merge de release. |
| `e14a844` | Gobernanza | Templates, AGENTS, CONTRIBUTING, policy, guard scripts | Presente en `desarrollo`; diferencias menores en `BRANCHING_WORKFLOW.md` y `package.json` favorecen `desarrollo` | Bajo | No accion - gobernanza ya presente. |
| `55a565c` | Reversion | Revierte merge amplio `develop -> main` | No aplica a `desarrollo` | Alto | Conservar exclusivo en `main`. |
| `5d0d05f` | Merge amplio | Intento de promover `develop -> main` luego revertido | Su contenido vive en ramas de trabajo, no en `main` final | Alto | No accion - merge revertido. |

No se identifico una correccion productiva critica faltante en `desarrollo`.

## 11. Gobernanza

El commit `e14a844` introdujo:

```text
.github/PULL_REQUEST_TEMPLATE.md
AGENTS.md
CONTRIBUTING.md
docs/governance/GIT_BRANCHING_AND_RELEASE_POLICY.md
scripts/git-governance-guard.js
```

Tambien modifico workflows, `BRANCHING_WORKFLOW.md`, README, documentacion de
flujo y `package.json`.

Los archivos principales de gobernanza ya existen en `desarrollo`. La diferencia
actual frente a `main` es:

- `BRANCHING_WORKFLOW.md`: `desarrollo` agrega referencia al documento
  normativo y regla explicita de ausencia de autorizacion.
- `package.json`: `desarrollo` conserva `start:desarrollo:windows`, actualiza
  `concurrently` y agrega overrides de seguridad.

No se porto gobernanza desde `main` porque `desarrollo` esta igual o mas
protegido.

## 12. Migraciones

| Archivo | Introduccion | Desarrollo | Develop | Main | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `apps/api/prisma/migrations/20260727042000_authorization_versions/migration.sql` | `7284e64` | Presente | Presente | Ausente | Requiere orden de despliegue y flags apagados. |
| `supabase/migrations/20260727041000_authoritative_evidence_quarantine.sql` | `4c1bb42` | Presente | Presente | Ausente | Requiere validacion QA de RLS/Storage antes de produccion. |
| `apps/api/prisma/schema.prisma` | Multiples commits | Integrado | Integrado | Divergente | Promocion futura debe revisar compatibilidad. |
| `apps/api/src/security/policy.js` | Multiples commits | Integrado | Integrado | Divergente | Riesgo de comportamiento de seguridad si se mezcla por merge. |
| `apps/api/src/security/supabaseAuth.js` | Multiples commits | Integrado | Integrado | Divergente por resoluciones de release | Requiere pruebas de auth/tenant en promocion. |
| `apps/web/lib/supabaseStorage.ts` | Multiples commits | Integrado | Integrado | Divergente | Requiere pruebas de Storage/evidencias. |

No se ejecutaron migraciones.

## 13. Riesgos

- `main` conserva archivos no rastreados que deben limpiarse o archivarse por
  decision humana fuera de esta fase.
- Una futura promocion a `main` no puede ser un merge simple sin revisar el
  antecedente de `55a565c`.
- Las migraciones de autorizacion y cuarentena existen en `desarrollo`/`develop`
  pero no en `main`, por lo que produccion requiere procedimiento especial.
- La auditoria ERP modular debe iniciar en `desarrollo` y no depender del estado
  fisico del worktree de `main`.

## 14. Acciones realizadas

- Se analizaron divergencias `desarrollo...develop`, `develop...main` y
  `desarrollo...main`.
- Se clasificaron commits exclusivos relevantes.
- Se consolido documentacion de release en `docs/releases/assessments/`.
- Se creo este informe en `docs/reports/`.

## 15. Acciones no realizadas

- No se hizo merge.
- No se hizo cherry-pick.
- No se hizo rebase.
- No se modifico `main`.
- No se modifico directamente `develop`.
- No se ejecutaron migraciones.
- No se toco Railway ni Supabase.
- No se hizo deploy.
- No se introdujo codigo ERP funcional.

## 16. Estado final esperado

Despues del commit documental, `desarrollo` debe quedar limpio y publicado en
`origin/desarrollo`. `main` y `develop` permanecen sin modificar por esta fase.

## 17. Recomendacion para iniciar auditoria ERP modular

La auditoria ERP modular puede iniciar en el worktree oficial de `desarrollo`
siempre que:

- El commit documental quede publicado en `origin/desarrollo`.
- Se mantenga prohibido promover a `develop` o `main` sin una fase posterior.
- La futura promocion a produccion trate las migraciones pendientes como
  procedimiento separado y validado.

Dictamen tecnico de esta fase:

```text
RECONCILIADO CON OBSERVACIONES
```
