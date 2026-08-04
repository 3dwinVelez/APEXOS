# APEXOS UI V3 - Promotion Readiness

Fecha: 2026-08-03

## Candidata congelada

- Rama candidata: `codex/operational-ui-v3-local`
- Commit candidato: `f329375b33d5527ce10dceb0a8463ac8b9c43683`
- Base local comun con `main` y `desarrollo`: `26b13313ed1354365d8e052e96f130931e718d7f`
- Benchmark raw SHA256: `07488FB4D36378A43BB60AF3A44BA1BC079F16AB466FBF6EC8853DFB90D82BD8`

## Commits candidatos

| Commit | Proposito | Requerido |
| --- | --- | --- |
| b8ca1a4 | Reduccion visual de dashboard | si |
| b26658a | Evidencia visual/performance | si |
| d316fac | Migracion visual administracion/servicios | si |
| dbdf90f | Evidencia de continuacion operativa | si |
| b39a776 | Benchmark corregido | si |
| e28aa0a | Aislamiento de Proyectos/recharts | si |
| badb60e | Metodologia corregida | si |
| a0f1506 | Raw benchmark | si |
| bfc80d6 | Dictamen previo | documental |
| 471b2cc | Aislamiento de regresiones | si |
| dcdbbd4 | Instrumentacion waterfall | si |
| 03d8b1d | Correccion prefetch desktop/dashboard | si |
| 3049bdd | Correccion prefetch mobile | si |
| 35a2a60 | Raw final 15 reps | si |
| f329375 | Dictamen final | si |

## Riesgos

- El worktree original contiene cambios no comprometidos que no forman parte de la candidata congelada.
- `test:offline` falla 40/49 en la candidata; debe compararse contra base y `desarrollo` antes de promover.
- No se debe publicar ni mezclar `desarrollo`, `develop` o `main` sin autorizacion posterior.

## Estrategia recomendada

Crear una rama limpia desde `origin/desarrollo` y aplicar cherry-pick controlado de los commits requeridos. Esta estrategia evita arrastrar cambios no comprometidos y preserva trazabilidad.

## Rollback

Revertir en orden inverso los commits aplicados en la rama de integracion. Para Proyectos, verificar que no se restaure el import directo de `recharts` en `apps/web/app/dashboard/proyectos/page.tsx`.
