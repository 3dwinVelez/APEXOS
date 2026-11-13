# Plan de despliegue controlado a QA — capa visual completa 2026-11-13

Cambio: `capa-visual-completa-20261113`
Flujo permitido: `desarrollo -> develop -> main`. Este plan cubre únicamente `desarrollo -> develop` y el
despliegue del frontend a QA. Nunca autoriza `main`, despliegue de API, migraciones remotas ni cambios de
infraestructura.

## 1. Hechos verificados (2026-11-13, contra el remoto)

| Dato | Valor |
|---|---|
| `origin/develop` | `6589af8e1d3213b8f14b17877c8c5af5f9352f21` |
| Candidato (worktree detachado) | `beff513200abe22a29d05d25a586307d24487139` |
| Padre del candidato | `dd63e48e…` (el commit anterior del candidato; su ancestro raíz es el tip de `develop`) |
| Commits del candidato | **20** (16 rondas visuales + 4 correcciones de reconstrucción) |
| Merge posible | **fast-forward** (`git merge-base --is-ancestor origin/develop HEAD` → OK) |
| Árbol del candidato | `3d697a24c210b9e31f151c45a7436f924c52ea14` |
| Diff neto | **143 rutas (109 A / 34 M / 0 D)** |
| Rutas fuera de `apps/web/**` y `docs/**` | **0** |
| Cambios en dependencias/configuración | **0** (`package.json`, lockfiles, `next.config`, `tsconfig`, `.env`) |
| Rutas en `apps/api/**` o `apps/api/prisma/**` | **0** → el API de QA **no cambia y no se redespliega** |
| Certificación funcional | **100/100**, 34 capturas, 0 errores de consola y 0 HTTP |
| Regresión | typecheck 0, lint 0, suite web **801/797**, **0 fallos nuevos** frente al baseline de 4 |

### 1.1 El destino se movió durante la certificación

La primera certificación se hizo sobre `origin/develop = 8ba301c0` (commit `5cb3d665`). Antes de promover,
`origin/develop` avanzó a `6589af8e` con un cambio de talento humano (búsqueda por documento en
liquidación de trabajador) que **no comparte rutas** con este inventario. Se rebasó el candidato a
`beff5132` y se repitieron build de producción, certificación de navegador y regresión. La evidencia
versionada corresponde al commit rebasado.

**Regla aplicada:** un candidato que deja de ser punta no se promueve; se adelanta y se recertifica.

## 2. Garantías de aislamiento

| Preocupación | Control | Verificación |
|---|---|---|
| Arrastrar commits del equipo en `develop` | Solo `merge --ff-only`; el tip de `develop` debe ser ancestro | `git merge-base --is-ancestor origin/develop HEAD` |
| Meter cambios fuera de la capa visual | Inventario exacto contra el manifiesto | `qa:promotion:scope` verde + rutas fuera de `apps/web`/`docs` = 0 |
| Cambiar funcionalidad viva | Sin API, Prisma, seeds, migraciones ni dependencias; payload contractual certificado | Diff filtrado vacío + payload de la orden |
| Desplegar un árbol distinto al certificado | Igualdad de árbol | `git rev-parse develop^{tree}` == `3d697a24…` |
| Redesplegar API por inercia | El API de QA queda en su commit actual | `git diff --name-only origin/develop..HEAD -- apps/api` vacío; `/health` conserva `3595a9bb…` |
| Dejar migraciones pendientes | Ninguna migración en el alcance | Cero rutas `apps/api/prisma/**` |
| Quedar sin retorno | Rollback doble: Railway al deployment anterior y `git revert` | Sección 8 |

## 3. Fase 0 — Preflight bloqueante

```bash
cd "C:/Users/mq1/Documents/Proyectos/APEXOS"
git fetch origin --prune

# 1. El destino no se movio desde la recertificacion
git rev-parse origin/develop
# Debe ser 6589af8e1d3213b8f14b17877c8c5af5f9352f21

# 2. El candidato es una extension directa del tip
git merge-base --is-ancestor origin/develop beff513200abe22a29d05d25a586307d24487139 && echo FF_OK

# 3. Inventario exacto y compuerta
npm run qa:promotion:scope -- docs/qa/manifests/capa-visual-completa-20261113-scope.json \
  beff513200abe22a29d05d25a586307d24487139 origin/develop

# 4. Cero rutas ajenas a la capa visual
git diff --name-only origin/develop..beff5132 | grep -v -E '^(apps/web/|docs/)' \
  && echo "STOP: ruta fuera de alcance" || echo AISLADO_OK

# 5. Cero dependencias o configuracion
git diff --name-only origin/develop..beff5132 \
  | grep -E 'package(-lock)?\.json|lock|next\.config|tsconfig|\.env' \
  && echo "STOP: dependencia" || echo SIN_DEPENDENCIAS

# 6. Cero cambios de API
git diff --name-only origin/develop..beff5132 -- apps/api && echo "STOP: API" || echo API_INTACTA

# 7. Regresion reproducible
CERT_REPO_DIR="$TEMP/apexos-visual-completa" CERT_COMMIT=beff5132 \
  node scripts/certifications/visual-homologation-regression.cjs
```

**Si `origin/develop` volvió a avanzar:** detener el plan, rebasar el candidato y repetir la certificación
completa. Nunca se promueve un candidato que ya no es punta ni se hace merge a ciegas.

## 4. Fase 1 — Autorización y aprobación registrada

1. El propietario autorizó `desarrollo -> develop` (QA) al elegir **«Capa visual completa (Recomendado)»**.
2. Registro en `docs/qa/manifests/capa-visual-completa-20261113-preqa.json`:
   `approval.status: "approved"`, `approved_by`, `approved_at`, `qa_status: "pending"`.
3. Compuerta:

```bash
npm run qa:preqa:evidence -- docs/qa/manifests/capa-visual-completa-20261113-preqa.json
# AUTORIZACION PRE-QA VALIDA: capa-visual-completa-20261113
```

4. Snapshot para rollback: `origin/develop` = `6589af8e…` y el deployment web vigente en APEXOS QA.

## 5. Fase 2 — Promoción controlada (fast-forward, sin merge commit)

```bash
cd "C:/Users/mq1/Documents/Proyectos/APEXOS"
git worktree add --detach "$TEMP/apexos-develop-qa-visual" origin/develop
cd "$TEMP/apexos-develop-qa-visual"
git merge --ff-only beff513200abe22a29d05d25a586307d24487139

# Invariantes post-merge (los tres deben imprimir OK)
test "$(git rev-parse HEAD)" = "beff513200abe22a29d05d25a586307d24487139" && echo HEAD_OK
test "$(git rev-parse HEAD^{tree})" = "3d697a24c210b9e31f151c45a7436f924c52ea14" && echo TREE_OK
test "$(git diff --name-only 6589af8e1d3213b8f14b17877c8c5af5f9352f21..HEAD | wc -l)" = "143" && echo INVENTARIO_OK

git push origin HEAD:develop
```

Reglas duras:

- **Prohibido** `--no-ff`, squash, force push o tocar `main`.
- Si `git merge --ff-only` falla, el plan se detiene: el destino cambió.
- El push usa `HEAD:develop` desde el worktree detachado; no se crea ni resetea una rama local.

## 6. Fase 3 — Despliegue a QA (solo frontend)

1. Desplegar **únicamente el servicio web** de APEXOS QA desde `develop` (`beff5132`).
2. **No** redesplegar el API: su árbol no cambia. **No** ejecutar migraciones ni cambiar variables.
3. Smoke técnico inmediato:

| Verificación | Esperado |
|---|---|
| Web QA `/login` | HTTP 200 |
| Login real | Sesión iniciada |
| Lobby | 12 tarjetas, iconos, banner de red, sin asistente flotante |
| API QA `/health` | HTTP 200 y commit **sin cambios** |
| Consola y red | 0 errores nuevos |
| Hubs de lectura | Cargan, `h1` correcto, sin desbordamiento |

4. Si el smoke falla: rollback inmediato (sección 8) y no se declara despliegue exitoso.

## 7. Fase 4 — Certificación funcional de QA

La certificación local intercepta escrituras; QA debe probar persistencia contra la base real:

| Flujo | Criterio |
|---|---|
| Nueva orden de venta | Crear con cliente y producto desde `SearchSelect`; persiste con `customer_id` + `lines[].{item_id,qty,unit_price}` |
| Agenda comercial | Crear una visita real desde el diálogo; persiste |
| Producto nuevo | Guardar producto y verlo en la lista |
| Selectores | Filtrar por nombre/código/iniciales y elegir con flechas/Enter/Escape |
| Requeridos | Enviar sin selección: el combobox se reabre y la validación bloquea |
| Tema oscuro y móvil 390 | Sin desbordamiento en hubs y formularios |
| Gastos menores | Solo con tenant que tenga `M-29`; en el demo está denegado |
| Flujos vivos ajenos | Órdenes, inventario, servicios y agenda sin regresión visible |
| Consola y red | 0 errores durante los recorridos |

QA **no debe aceptar** el candidato si reaparece un `<select>` nativo visible en los formularios migrados,
si cambia el payload de las órdenes o si alguna pantalla desborda.

## 8. Rollback

- **Rápido (QA):** rollback del servicio web al deployment anterior en Railway. El API no se toca.
- **Git:** `git revert --no-edit beff5132` sobre `develop` y push; commit inverso, sin reescribir historia.
- **Prohibido:** `git reset --hard`, `git clean -fd`, force push, borrar el worktree candidato.
- **Datos:** no se requiere rollback; el cambio no trae migraciones ni escrituras de producto.
- El worktree candidato se conserva intacto para diagnóstico y reintento.

## 9. Cierre

- Registrar en `docs/qa/certifications/` la ronda funcional de QA con capturas y veredicto.
- `develop` y `desarrollo` divergen por diseño: **no** se retrointegra `develop` a `desarrollo`.
- `main` sigue prohibido hasta que QA funcional apruebe y exista manifiesto `qa:approval:evidence`.

## 10. Estado de ejecución

- [x] Candidato reconstruido, rebasado sobre el tip vigente y certificado sobre el build de producción.
- [x] Alcance exacto validado contra `origin/develop`.
- [x] Plan de despliegue con invariantes, puntos de parada y rollback.
- [x] Autorización explícita del propietario (2026-11-13).
- [x] Aprobación registrada y compuerta pre-QA en verde.
- [ ] Fast-forward a `develop` y despliegue web a QA.
- [ ] Smoke técnico de QA y certificación funcional (persistencia real).

### 10.1 Resultado de la promoción

Se completa al ejecutar la Fase 2; este runbook se actualiza en el mismo commit de cierre.
