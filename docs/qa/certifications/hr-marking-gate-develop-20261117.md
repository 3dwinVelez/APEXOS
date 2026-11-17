# Certificación del corte de marcación y monitor sobre el candidato de `develop`

- Fecha: 2026-11-17
- Intervención: `hr-marcacion-sin-horario-y-mapa-sin-selfies` (brief `docs/briefs/2026-11-17-marcacion-sin-horario-y-mapa-sin-selfies.md`)
- Rama auxiliar de promoción: `codex/qa-hr-marking-gate-20261117`
- Destino: `develop` (promoción puntual autorizada por el dueño de APEXOS para alinear los tres ambientes)

## 1. Qué viaja y por qué son dos commits

El corte se certificó en `desarrollo` sobre el commit `c2242320d9c5d3c22570b6ece09e212d596b2d8b`, cuyo padre es `6e3a795f` (la marcación sustenta la llegada tarde y valida con selfie). `origin/develop` no contiene ninguno de los dos: es ancestro estricto de `desarrollo` (178 commits por detrás, 0 por delante) y está exactamente en el baseline previo de las tres rutas que después divergieron (`apps/api/src/modules/hr/service.js`, `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`, `apps/web/app/dashboard/talento-humano/rutas/page.tsx`), medido con `git diff origin/develop 6e3a795f^ -- <ruta>` → 0 líneas.

Traer solo `c2242320` sobre `develop` produce un archivo que nunca se ejecutó: el merge de tres árbol toma el lado `develop` en las regiones de selfie que mi commit no tocó, y el resultado pierde el código de `6e3a795f` mientras conserva mis llamadas. Medido: 3 rutas con blob distinto y 182/32 líneas de diff espurias. Por eso el candidato se reconstruye con el stack contiguo completo:

| commit del candidato | origen | contenido |
|---|---|---|
| `78a24d8f` | cherry-pick de `6e3a795f` | 12 rutas: selfie, tardanza e identidad móvil |
| (certificado, ver §2) | cherry-pick de `c2242320` + evidencia de esta corrida | 41 rutas: gate sin horario, lectura sin `jsonb`, certificación, sus puertas y su evidencia |

El commit de contexto vivo (`4ad781de`, 16 rutas de `agents/**` y `.qoder/skills/**`) **no viaja**: `develop` no tiene `agents/**` (0 archivos en el árbol) y sus 8 skills están congelados en su último blob compartido. La gobernanza del corte queda en `desarrollo`, que es donde residen las compuertas.

## 2. Identidad del código certificado

Comparación blob a blob entre el candidato y los dos commits certificados en `desarrollo` (`c2242320` y su padre `6e3a795f`), sobre las 30 rutas de código y scripts del candidato:

```text
rutas de codigo+scripts: 30   identicas: 30   distintas: 0
```

En el resto del inventario, 2 archivos de evidencia difieren del árbol de `desarrollo` porque esta corrida los volvió a escribir —`docs/qa/evidence/hr-marking-unassigned-gate-20261117/certification.json` (dos marcas de tiempo) y `01-sin-ficha.png` (render del navegador, 168 163 → 168 217 bytes)— y 13 rutas no tienen contraparte: son artefactos nuevos de esta promoción (la certificación del candidato, la evidencia de las suites base/candidato, la sonda y los dos manifiestos).

Es decir: el código de producto que corre en el candidato es byte a byte el que pasó las 14/14 verificaciones de navegador y las suites de `desarrollo`; ninguna ruta de código se modificó fuera del commit certificado.

## 3. Qué se ejecutó sobre este árbol y con qué resultado

| verificación | comando | resultado |
|---|---|---|
| Pruebas focales del corte, API | `node --test` sobre los 7 `apps/api/test/hr-*.test.js` tocados | 66/66 |
| Pruebas focales del corte, cliente | `node --experimental-strip-types --test` sobre los 6 `apps/web/test/hr-*.test.mjs` tocados | 60/60 |
| Suite completa API | `cd apps/api && node --test 'test/*.test.js'` | 1143 pruebas, 1138 pasan, 2 fallan, 3 saltadas |
| Suite completa cliente | `cd apps/web && node --experimental-strip-types --test 'test/*.test.mjs'` | 813 pruebas, 812 pasan, 1 falla |
| Certificación de navegador del gate | `node scripts/certifications/hr-marking-unassigned-gate-local.js` | 14/14 (Next dev + Chromium reales) |
| Sonda de payloads del monitor | `node scripts/performance/selfie-payload-probe.js --rows 2200 --limit 615` | 125,7× menos bytes, 734,3 ms ahorrados, 31 845 796 B evitados |
| Typecheck de cliente | `npx tsc -p tsconfig.typecheck.json --noEmit` | 0 errores |
| Build de producción del cliente | `npx next build --webpack` sobre `apps/web` | compilado en 2,6 min, salida 0 |
| Regresión de negocio real (marcación → evidencia → reporte) | `node scripts/certifications/hr-punch-mobile-evidence-local.js --output=docs/qa/evidence/hr-punch-mobile-evidence-20261117-develop/certification.json` con `DATABASE_URL` apuntando a la base local del puesto | `status=passed`, 4/4 checks |
| Puertas de promoción | `qa:promotion:scope`, `qa:preqa:evidence`, `git-governance-guard ci-promotion`, `scoped-qa-governance-local` y su test | 5/5 en verde (20/20 checks del contrato de gobernanza, 15 de ellos rojos provocados que el guard bloquea) |

Evidencia versionada: `docs/qa/evidence/hr-marking-gate-develop-20261117/` (resúmenes de suite con el comando de reproducción y la falla atribuida por archivo y línea, más el log del build y de la regresión de negocio), `docs/qa/evidence/hr-marking-unassigned-gate-20261117/` (capturas y `certification.json` de esta corrida), `docs/qa/evidence/hr-punch-mobile-evidence-20261117-develop/certification.json` (los 4 checks de negocio real) y `docs/qa/evidence/hr-carga-horarios-20261117/selfie-payload-probe-candidato-develop.json` (JSON de la sonda de esta corrida).

## 4. Atribución de las fallas: ninguna es de este corte

Las suites se corrieron también en un árbol base tomado de `origin/develop` `36111a6a` **sin** el corte, en el mismo ambiente aislado. Comparación directa:

| prueba que falla | base `develop` | candidato |
|---|---|---|
| `apps/api/test/accounting-routes-contract.test.js:71` — rutas de contabilidad registradas bajo `/api/v1` | falla | falla |
| `apps/api/test/transport-tms-foundation.test.js:130` — rutas TMS exigen autenticación | falla | falla |
| `apps/web/test/command-palette-module-functions.test.mjs:49` — `/dashboard/contabilidad/pyg/ampliado` sin acceso desde el centro de comandos | falla | falla |
| `apps/api/test/security-authorization-revocation.test.js:25` — sobrecosto del cálculo local de decisión | falla | pasa |
| `apps/web/test/hr-route-write-fallback.test.mjs:31` y `:49` — el respaldo de rutas consulta el guard | falla | pasa |

Las tres que siguen fallando son de Contabilidad, Transporte y del centro de comandos: ninguna de las rutas que fallan está entre las 30 rutas de código del corte, y fallan igual sin él. La de contabilidad y la de TMS son deuda propia de `develop`; la del palette es la regla 12 de `apexos-frontend` incumplida por el módulo PYG ampliado (su dueño es Transporte/Contabilidad, no Talento Humano, y no se toca de contrabando en esta promoción).

Las dos de `hr-route-write-fallback.test.mjs` estaban rotas en `develop` y este corte las repara: es la reconciliación del respaldo de rutas en `apps/web/lib/api.ts` que el brief dejó como punto 7. El caso del `security-authorization-revocation.test.js:25` pasó en esta corrida y falló en la base; es una prueba de tiempo de CPU y se reporta como varianza de medición, no como mejora atribuida al corte.

## 5. Límites de esta certificación

- Ambiente LOCAL aislado (worktree temporal, `node_modules` enlazado, PostgreSQL del `compose` del puesto en el contenedor `infra-postgres-1`, base de sonda con datos sintéticos). No se usaron datos de clientes.
- La certificación de navegador sustituye solo las lecturas `/api/v1/hr/self*` y `/api/v1/auth/me` con un guion local. El flujo autenticado contra Fastify y PostgreSQL reales sí se ejercitó en este árbol con `hr-punch-mobile-evidence-local.js` (tenant, roles, RBAC, ficha, ruta, cuatro marcaciones con foto, actividad con evidencia, aislamiento entre tenants y el journey del reporte); lo que sigue cubierto después del despliegue es `certify:hr-monitor-evidence:qa` contra el ambiente remoto.
- El `next build` de producción en este árbol exige la variante de empaquetador: el empaquetador por defecto (Turbopack) aborta con `Symlink [project]/apps/web/node_modules is invalid, it points out of the filesystem root` porque el `node_modules` del worktree temporal está enlazado fuera de la raíz del proyecto. Con `npx next build --webpack` el mismo árbol compila en 2,6 min con salida 0. Un `checkout` normal con `npm install` no tiene ese enlace; es límite del ambiente aislado, no del código.
- No se aplicó migración alguna en la nube y no se desplegó Railway: la promoción del código no autoriza ninguno de los dos.
- QA remoto (Railway) y `main` quedan fuera de este documento; `main` exige además la certificación funcional contra el build desplegado.
