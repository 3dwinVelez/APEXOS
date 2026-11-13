# Plan de despliegue controlado a QA — capa visual homologada 2026-11-12

Cambio: `homologacion-visual-20261112`
Estado: **promoción ejecutada el 2026-11-13 y smoke técnico de QA en verde; la certificación funcional de persistencia queda para el equipo de QA**.
Flujo permitido: `desarrollo -> develop -> main`. Este plan cubre unicamente `desarrollo -> develop` y el despliegue
del frontend a QA. Nunca autoriza `main`, despliegue de API, migraciones remotas ni cambios de infraestructura.

## 1. Hechos verificados (2026-11-13, contra el remoto)

| Dato | Valor |
|---|---|
| `origin/develop` | `3595a9bbca239fbf0ff7e186aa765e22700f7420` |
| Candidato | `codex/qa-capa-visual-20261112` = `8ba301c0db7bd272fac6ab21a78384a290ba2409` |
| Padre del candidato | `3595a9bb…` (identico al tip de `develop`) |
| Commits del candidato | **1** |
| Merge posible | **fast-forward** (el tip de develop es ancestro del candidato) |
| Arbol del candidato | `4c870b267cd7f76ab17aabdf99107f082631fbf0` |
| Diff neto | **100 rutas (79 A / 21 M / 0 D)** |
| Rutas fuera de `apps/web/**` y `docs/**` | **0** |
| Cambios en dependencias/configuracion | **0** (`package.json`, lockfiles, `next.config`, `tsconfig`, `.env`) |
| Rutas en `apps/api/**` o `apps/api/prisma/**` | **0** → el API de QA **no cambia y no se redespliega** |
| Compuerta de alcance | **PASSED** — `ALCANCE DE PROMOCION VALIDO (100 rutas)` |
| Compuerta pre-QA | **BLOQUEADA solo por `approval.status` pendiente** |
| Certificacion funcional | **96/96**, 33 capturas, 0 errores de consola y 0 HTTP |
| Regresion | typecheck 0, lint 0, suite web **777/773**, **0 fallos nuevos** frente al control 770/5 |

## 2. Garantias de aislamiento

Cada preocupacion del propietario tiene un control medible y un punto de parada. Si un control no se cumple,
la promocion **no se ejecuta**.

| Preocupacion | Control | Verificacion |
|---|---|---|
| Arrastrar commits del equipo en `develop` | Solo `merge --ff-only`; el padre del candidato debe ser el tip | `git rev-parse candidato^` == `git rev-parse origin/develop`; si difiere, **STOP** |
| Meter cambios fuera de la capa visual | Inventario exacto contra el manifiesto | `qa:promotion:scope` verde + `git diff --name-only` sin rutas fuera de `apps/web/` y `docs/` |
| Cambiar funcionalidad viva | Sin rutas de API, Prisma, seeds, migraciones ni dependencias; payload contractual certificado | Diff filtrado vacio + comparacion de payload + smoke de flujos vivos |
| Desplegar un arbol distinto al certificado | Igualdad de arbol | `git rev-parse develop^{tree}` == `4c870b26…` |
| Redesplegar API por inercia | El API de QA queda en el commit actual | `git diff --name-only origin/develop..candidato -- apps/api` vacio; `/health` de QA conserva el commit `3595a9bb…` |
| Dejar migraciones pendientes | Ninguna migracion en el alcance | Cero rutas `apps/api/prisma/**`; no se ejecuta `prisma migrate` |
| Quedar sin retorno | Rollback doble: Railway al deployment anterior y `git revert` | Documentado en la seccion 7 |

## 3. Fase 0 — Preflight bloqueante (antes de pedir o usar autorizacion)

```bash
cd "C:/Users/mq1/Documents/Proyectos/APEXOS"
git fetch origin --prune

# 1. El destino no se movio desde la certificacion
git rev-parse origin/develop
# Debe ser 3595a9bbca239fbf0ff7e186aa765e22700f7420

# 2. El candidato es una extension directa del tip
git merge-base --is-ancestor origin/develop codex/qa-capa-visual-20261112 && echo FF_OK
git rev-parse codex/qa-capa-visual-20261112^

# 3. Inventario exacto y compuerta
npm run qa:promotion:scope -- docs/qa/manifests/homologacion-visual-20261112-scope.json \
  codex/qa-capa-visual-20261112 origin/develop

# 4. Cero rutas ajenas a la capa visual
git diff --name-only origin/develop..codex/qa-capa-visual-20261112 \
  | grep -v -E '^(apps/web/|docs/)' && echo "STOP: ruta fuera de alcance" || echo AISLADO_OK

# 5. Cero dependencias o configuracion
git diff --name-only origin/develop..codex/qa-capa-visual-20261112 \
  | grep -E 'package(-lock)?\.json|lock|next\.config|tsconfig|\.env' && echo "STOP: dependencia" || echo SIN_DEPENDENCIAS

# 6. Cero cambios de API
git diff --name-only origin/develop..codex/qa-capa-visual-20261112 -- apps/api && echo "STOP: API" || echo API_INTACTA

# 7. Regresion reproducible
CERT_REPO_DIR="$TEMP/apexos-qa-capa-visual" CERT_COMMIT=8ba301c0 \
  node scripts/certifications/visual-homologation-regression.cjs
```

**Si `origin/develop` avanzo:** detener el plan. Recalcular el alcance contra el nuevo tip, adelantar el commit
candidato (forward-port del unico commit visual) y **repetir certificacion completa** antes de continuar.
Nunca se hace merge a ciegas ni se promueve un candidato que ya no es punta.

## 4. Fase 1 — Autorizacion y aprobacion registrada

1. El propietario autoriza explicitamente `desarrollo -> develop` (QA).
2. Registrar en `docs/qa/manifests/homologacion-visual-20261112-preqa.json`:
   `approval.status: "approved"`, `approved_by`, `approved_at`. No tocar `qa_status: "pending"`.
3. Ejecutar y exigir verde:

```bash
npm run qa:preqa:evidence -- docs/qa/manifests/homologacion-visual-20261112-preqa.json
# AUTORIZACION PRE-QA VALIDA: homologacion-visual-20261112
```

4. Snapshot para rollback: guardar el SHA de `origin/develop` (`3595a9bb…`) y el identificador del deployment
   web vigente en APEXOS QA.

## 5. Fase 2 — Promocion controlada (fast-forward, sin merge commit)

Se trabaja en un worktree auxiliar para no tocar el arbol principal y evitar ramas locales divergentes.

```bash
cd "C:/Users/mq1/Documents/Proyectos/APEXOS"
git worktree add --detach "$TEMP/apexos-develop-qa" origin/develop
cd "$TEMP/apexos-develop-qa"
git merge --ff-only codex/qa-capa-visual-20261112

# Invariantes post-merge (los tres deben imprimir OK)
test "$(git rev-parse HEAD)" = "8ba301c0db7bd272fac6ab21a78384a290ba2409" && echo HEAD_OK
test "$(git rev-parse HEAD^{tree})" = "4c870b267cd7f76ab17aabdf99107f082631fbf0" && echo TREE_OK
test "$(git diff --name-only 3595a9bbca239fbf0ff7e186aa765e22700f7420..HEAD | wc -l)" = "100" && echo INVENTARIO_OK

git push origin HEAD:develop
```

Reglas duras de esta fase:

- **Prohibido** `--no-ff`, squash, force push o tocar `main`.
- Si `git merge --ff-only` falla, el plan se detiene: el destino cambio.
- El push a `develop` usa `HEAD:develop` desde el worktree detachado; no se crea ni resetea una rama local.

## 6. Fase 3 — Despliegue a QA (solo frontend)

1. Desplegar **unicamente el servicio web** de APEXOS QA desde `develop` (`8ba301c0`).
2. **No** redesplegar el API: su arbol es identico al de QA actual (`3595a9bb`), porque el diff no toca
   `apps/api/**`. **No** ejecutar migraciones ni cambiar variables.
3. Smoke tecnico inmediato:

| Verificacion | Esperado |
|---|---|
| Web QA `/login` | HTTP 200 |
| Login real `demo@apex.local` | Sesion iniciada, lobby visible |
| API QA `/health` | HTTP 200 y commit **sin cambios** (`3595a9bb…`) |
| Consola y red en lobby y un formulario | 0 errores |
| Hubs de lectura: inventario, ventas, servicios, gestion comercial, reportes, administracion | Cargan, `h1` correcto, sin desbordamiento |

4. Si el smoke falla: rollback inmediato (seccion 7) y no se declara despliegue exitoso.

## 7. Fase 4 — Certificacion funcional de QA (escrituras reales)

La certificacion local intercepta escrituras; QA debe probar persistencia contra la base real:

| Flujo | Criterio |
|---|---|
| Nueva orden de venta | Crear con cliente y producto desde `SearchSelect`; el registro persiste y el payload conserva `customer_id` + `lines[].{item_id,qty,unit_price}` |
| Agenda comercial | Crear una visita real desde el dialogo; el registro persiste |
| Producto nuevo | Guardar producto y verlo en la lista |
| Selectores | Teclear, filtrar por nombre/codigo/iniciales, elegir con flechas/Enter/Escape |
| Sin coincidencias | Mensaje vacio y el formulario no envia valor invalido |
| Requeridos | Enviar sin seleccionar: el combobox se reabre y la validacion bloquea |
| Tema oscuro y movil 390 | Sin desbordamiento en hubs y formularios |
| Gastos menores | Solo con tenant que tenga `M-29`; en el demo esta denegado por licenciamiento |
| Flujos vivos ajenos | Ordenes listadas, inventario, servicios y agenda cargan sin regresion visible |
| Consola y red | 0 errores durante los recorridos |

QA **no debe aceptar** el candidato si reaparece un `<select>` nativo visible en los tres formularios migrados,
si cambia el payload de las ordenes o si alguna pantalla desborda.

## 8. Rollback

- **Rapido (QA):** rollback del servicio web al deployment anterior en Railway. El API no se toca.
- **Git:** `git revert --no-edit 8ba301c0` sobre `develop` y push; crea un commit inverso, no reescribe historia.
- **Prohibido:** `git reset --hard`, `git clean -fd`, force push, borrar la rama candidata.
- **Datos:** no se requiere rollback; el cambio no trae migraciones ni escrituras de producto.
- La rama `codex/qa-capa-visual-20261112` se conserva intacta para diagnostico y reintento.

## 9. Cierre

- Registrar en `docs/qa/certifications/` la ronda funcional de QA con capturas y veredicto.
- `develop` y `desarrollo` divergen por diseño: **no** se retrointegra `develop` a `desarrollo`.
- `main` sigue prohibido hasta que QA funcional apruebe y exista manifiesto `qa:approval:evidence`.

## 10. Estado de ejecucion

- [x] Candidato aislado y certificado sobre el build de produccion.
- [x] Alcance exacto validado contra `origin/develop`.
- [x] Plan de despliegue con invariantes, puntos de parada y rollback.
- [x] Autorizacion explicita del propietario: «procede con la migracion» (2026-11-13).
- [x] Aprobacion registrada y compuerta pre-QA en verde.
- [x] Fast-forward a `develop` y despliegue web a QA.
- [ ] Certificacion funcional de QA (persistencia real).

### 10.1 Resultado de la promocion (2026-11-13)

| Dato | Valor medido |
|---|---|
| Compuerta de alcance | `ALCANCE DE PROMOCION VALIDO: homologacion-visual-20261112 (100 rutas)` |
| Compuerta pre-QA | `AUTORIZACION PRE-QA VALIDA: homologacion-visual-20261112` |
| `origin/develop` antes → despues | `3595a9bb…` → `8ba301c0db7bd272fac6ab21a78384a290ba2409` |
| Merge | fast-forward desde worktree detachado; sin merge commit, sin force |
| Arbol desplegado | `4c870b267cd7f76ab17aabdf99107f082631fbf0` (identico al certificado) |
| Diff neto | 100 rutas (79 A / 21 M / 0 D), 0 fuera de `apps/web`/`docs`, 0 API/Prisma |
| Deployment web QA | `7c27a4f7-0767-4cb0-8d90-20787a1368bf` — `SUCCESS`, commit `8ba301c0`, 2026-11-13T14:27Z |
| API QA | **sin redespliegue**: `/health` responde `commit: 3595a9bbca23` |
| Migraciones | ninguna ejecutada |

> La compuerta de alcance se ejecutó **antes del push** contra `origin/develop = 3595a9bb`. Después de la
> promoción no se vuelve a correr contra el mismo destino: el destino ya ES el candidato y el validador
> reporta que el baseline cambió. Su salida verde (`100 rutas`) quedó registrada en este runbook y en el
> brief; la compuerta pre-QA sí sigue siendo re-ejecutable y permanece en verde.

### 10.2 Smoke tecnico remoto (solo lectura)

Script versionado: `scripts/certifications/visual-homologation-qa-smoke.cjs`.
Evidencia: `docs/qa/evidence/homologacion-visual-qa-20261113/` (`smoke.json` + 5 capturas).

| Verificacion | Resultado |
|---|---|
| Web QA `/login` | HTTP 200 |
| Login real `demo@apex.local` | Sesion iniciada; lobby «Mi operación» |
| API QA `/health` | 200, commit `3595a9bbca23` (intacto) |
| Hubs accesibles (inventario, compras, ventas, contabilidad, transporte, talento humano, servicios, administracion) | 200, `h1` correcto, desbordamiento 0 |
| Hubs denegados por licencia (`M-27`, `M-30`, `apex_heart`, `M-29`) | tarjeta canonica «Acceso no autorizado», sin error boundary |
| Nueva orden de venta | 2 `combobox`, 2 `<select aria-hidden>`, 0 selects nativos visibles; listbox abre, filtra y cierra con Escape; formulario no enviado |
| Consola y red | 0 errores nuevos; ruido preexistente clasificado en `known_console_noise` (400 de Supabase en el login por API y 404 de favicon) |
| Total | **23/23 verificaciones, 5 capturas** |

`gestion-comercial` y `gastos-menores` no pueden probarse en el inquilino demo de QA por licenciamiento
(`M-27` y `M-29` ausentes); la agenda comercial y la persistencia de escrituras quedan en la fase funcional
con un tenant que tenga esos modulos.
