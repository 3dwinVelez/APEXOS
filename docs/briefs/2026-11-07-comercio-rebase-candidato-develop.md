# Brief 2026-11-07 — Comercio: re-base del candidato contra el target vigente y certificación propia

## Origen

Ronda 7 del módulo Comercio. Instrucción vigente del dueño: *terminar de validar lo que haga falta para llevar el módulo al ambiente remoto de `develop` con todas sus certificaciones y crear en Supabase lo necesario; no detenerse salvo algo muy crítico que requiera autorización.*

## Detonante

`origin/develop` avanzó de `21ef1a6f` a `22fdf222` (merge PR #81, nómina-marcaciones: 9 rutas de RRHH) mientras se cerraba la ronda 6. El candidato `promocion/comercio-develop-20261106` (`423d8cb0`/`b3847278`) seguía montado sobre la base vieja:

- su diff contra el target vigente marcaba las 9 rutas ajenas como **borrados**, y `qa:promotion:scope` exige `allowed_deletions` puntuales para cada `D`;
- un merge sin cuidado las habría revertido, violando "no afectar ninguna otra función del sistema";
- `AGENTS.md` prohíbe usar un árbol viejo como nueva línea base y obliga a comparar contra el target vigente, no contra el baseline local de la otra máquina.

## Decisiones

1. **Reconstruir, no forzar.** Se creó `promocion/comercio-develop-20261107` sobre `22fdf222` y se copió encima el cambio neto del módulo (201 rutas del diff `21ef1a6f..b3847278`) en un solo comite. Sin force push sobre la rama auxiliar ya publicada.
2. **El PR #80 se cierra** en favor del nuevo; su contenido queda íntegro en la rama nueva.
3. **Toque cross-módulo declarado** en `change_intent.modules`: `apps/api/test/hr-payroll-adjustment-lock.test.js`.

## Qué se hizo

| # | Cambio | Archivo |
|---|---|---|
| 1 | Candidato reconstruido sobre `22fdf222` (2 comites: cambio neto + script npm del bucket) | rama `promocion/comercio-develop-20261107` → `b676ebad` |
| 2 | Contrato del 503 medido donde vive (movió a `core/api-error.js` con `70bc7338` y estaba en rojo en `desarrollo`) | `apps/api/test/hr-payroll-adjustment-lock.test.js` |
| 3 | Certificación de vitrina determinista: mide la precedencia de la campaña vigente y la pausa/restaura para poder medir el titular propio del tema | `scripts/certifications/comercio-storefront-theme-local.js` |
| 4 | Alta idempotente y con guardas del bucket `comercio-assets` (no imprime la clave; exige `CONFIRM_COMERCIO_BUCKET=true`) | `scripts/ensure-comercio-assets-bucket.js` |
| 5 | Semilla demo recuperada en el candidato (la ronda 6 la perdió por auditar en una sola dirección) | `scripts/seed-comercio-demo.js` |
| 6 | Manifiestos y evidencia de la ronda 7 | `docs/qa/manifests/comercio-modulo-completo-20261107-{scope,preqa}.json`, `docs/qa/evidence/comercio-promotion-candidate-20261107/` |

## Criterios de aceptación y medida

| Criterio | Medida |
|---|---|
| Las 9 rutas de la promoción #81 permanecen en el candidato | `rev-parse HEAD:<p>` = `rev-parse 22fdf222:<p>` en las 9 → IGUAL ×9 |
| Ninguna ruta del módulo se perdió en la reconstrucción | sets `ls-tree \| grep -i comercio` en ambas direcciones: 173 = 173, `comm` vacío en los dos sentidos |
| El código del candidato es el certificado y el de `desarrollo` | 200 de 201 rutas idénticas en blob contra `b3847278`; la única diferencia es la línea del script npm en `package.json`; `git diff desarrollo HEAD -- apps scripts \| grep -iE 'comercio\|tienda'` vacío |
| Suite API del candidato | 1050 pruebas, 1048 pasan, **0 fallan**, 2 saltadas |
| Suite web del candidato | 749 pruebas, 746 pasan, 3 fallan → reproducidas en `origin/develop` limpio con `git archive` (`19/16/3`) |
| Certificaciones de navegador **sobre este candidato** | vitrina 78 checks `fallidos: []`; UX 287 checks `fallidos: []`; stack aislado API 3310 / web 3311 |
| Aislamiento multi-tenant y RBAC | 53/53, `LIMPIEZA {"empresas":4,"residuales":[]}`, commit estampado `b676ebad` |
| Puertas de plataforma | `prisma validate` válido · typecheck 0 errores · lint 0 errores/22 avisos · `governance:ci` exit 0 |
| Gates de promoción | `ALCANCE DE PROMOCION VALIDO: comercio-modulo-completo-20261107 (201 rutas)` · `AUTORIZACION PRE-QA VALIDA: comercio-modulo-completo-20261107` |

## Trampas de ambiente encontradas (medidas, no deducidas)

- **`next dev` a mano no carga el `.env` de la raíz** → `NEXT_PUBLIC_IMAGE_ORIGINS` vacío → la CSP bloquea el origen del banner y la prueba se pone roja sin que el negocio falle. Hay que exportar el `.env` antes de levantar el web.
- **Next 16.3.5 bloquea su propio recurso de HMR entre orígenes** (`/_next/hmr` desde `127.0.0.1`): el certificado debe usar `http://localhost:3311`, o la hidratación muere y el login nunca redirige.
- **Las pruebas de `apps/web` resuelven rutas contra `process.cwd()`**: correrlas desde la raíz produce 4 falsos rojos en `ibc-nomina-ui.test.mjs` (ENOENT de `app/dashboard/...`); desde `apps/web` miden 4/4.
- **`git diff` de árbol de trabajo entre worktrees miente por CRLF**: 42 archivos Comercio parecían distintos y eran idénticos. El cotejo se hace con hash de blob (`git rev-parse <ref>:<ruta>`).

## Fuera de alcance

`main`, force push, migraciones remotas aplicadas desde esta estación, secretos, infraestructura, y los rojos propios de `develop` (contratos de fuente de `api.ts` y el registro de `/pyg/ampliado`).

## Pendientes y autorizaciones

1. **Bucket `comercio-assets` en el Supabase de QA** — se ejecuta con la sesión del dueño: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… CONFIRM_COMERCIO_BUCKET=true npm run comercio:ensure-assets-bucket -- --env=qa`.
2. **Migraciones** — las aplica Railway al hacer el merge; después verificar `_prisma_migrations` y `/api/v1/comercio/dashboard` sin `P2022`.
3. **Regresión visual en QA** de los componentes compartidos (Transporte, tablas, modales, paleta).
