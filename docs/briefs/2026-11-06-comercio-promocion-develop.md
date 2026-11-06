# Brief — Promotion del módulo Comercio a `develop` (ronda 6: aislamiento y candidato)

- **Fecha:** 2026-11-06
- **Rama de trabajo:** `desarrollo` · **Rama auxiliar del candidato:** `promocion/comercio-develop-20261106` (worktree `C:/Users/mq1/Documents/Proyectos/APEXOS-comercio-develop`)
- **Change id:** `comercio-modulo-completo-20261106`
- **Decisión del dueño:** subir solo el módulo Comercio a `develop` de manera controlada, sin afectar ninguna otra función; las migraciones las aplica Railway al hacer el merge; publicación por rama auxiliar + PR; cerrar antes la brecha de aislamiento multi-tenant y RBAC.

## Qué entra y qué no

El candidato **no es un merge de `desarrollo`**: `origin/develop` no tiene ni una ruta del módulo y las dos ramas divergen en ambos sentidos (494 rutas de diferencia neta entre el tip certificado y el candidato). El candidato se reconstruye sobre el baseline vigente de `develop` y aporta solo el módulo:

| | |
|---|---|
| Inventario neto | 177 `A` / 21 `M` / **0 `D`** |
| Baseline | `origin/develop` = `21ef1a6f` |
| Tip del candidato | `423d8cb0` (32 commits sobre el baseline) |
| Rutas del módulo | 173, **byte a byte** idénticas al árbol certificado `69c096c8` |
| Plumbing compartido | 25 archivos, sin una sola línea de `develop` perdida salvo las justificadas |
| Fuera de alcance | `agents/`, `.qoder/skills`, gobernanza, briefs, evidencia de QA, apex-control, control-tower, buzón de correo, facturas recibidas |

Los seis `SKILL.md` que la normalización inicial borraba existen en `develop` y se restauraron desde `develop`: borrarlos habría sido una eliminación no autorizada.

## La capacidad que faltaba: aislamiento entre empresas

`apps/api/test/comercio-service.test.js` corría contra un único tenant simulado, así que el aislamiento multi-tenant y el RBAC del módulo —capacidad protegida por política— estaban sin certificar. Se cerró con `scripts/certifications/comercio-tenant-rbac-local.js`: cuatro empresas reales en PostgreSQL local, HTTP in-process con `app.inject` (sin burlas), lectura y escritura cruzadas que devuelven el **código de negocio** y no un 404 cualquiera, la intrusa no mutó nada y la vitrina pública no revela costo, stock, tenant ni ids internas.

- **53/53** checks, `LIMPIEZA {"empresas":4,"residuales":[]}` medido sobre el propio candidato.
- Dos verdes falsos corregidos en el camino: celdas que afirmaban solo el status contra rutas inexistentes, y `prisma.user.deleteMany` cayendo en el middleware de soft-delete y dejando 9 usuarios residuales (ahora borrado físico con SQL crudo y conteo de residuales por tabla). Regla codificada en `apexos-qa` 2.17.0, control `el-codigo-de-negocio-discrimina-la-causa`.

## Puertas medidas sobre el tipo del candidato

`prisma validate` válido · aislamiento 53/53 · API Comercio 69/69 · contratos de fuente Comercio 49/49 · suite web completa 749 pruebas con 746 verdes · typecheck 0 errores · lint 0 errores / 22 avisos previos.

Los **3 rojos son del destino, no del candidato**: se reproducen con `git archive` sobre `origin/develop` limpio y los cuatro archivos involucrados (`api.ts`, su test, y el registro del centro de comandos) están byte a byte como en `develop`. Arreglarlos es alcance de otros módulos.

## Hallazgo de la propia reconstrucción

La primera versión del candidato perdió la entrada `fn-comercio-promociones` en `apps/web/lib/moduleFunctions.ts`, así que Promociones quedaba sin acceso desde Ctrl+K **solo en la rama auxiliar**. Reparado en `423d8cb0` y medido: el candidato vuelve a tener exactamente la misma lista de rutas sin registro que `develop`.

## Puertas de promoción

```text
npm run qa:promotion:scope -- docs/qa/manifests/comercio-modulo-completo-20261106-scope.json promocion/comercio-develop-20261106 origin/develop
  ALCANCE DE PROMOCION VALIDO: comercio-modulo-completo-20261106 (198 rutas)
npm run qa:preqa:evidence -- docs/qa/manifests/comercio-modulo-completo-20261106-preqa.json
  AUTORIZACION PRE-QA VALIDA: comercio-modulo-completo-20261106
```

Los manifiestos `comercio-ux-pasada-20261106-*.json` quedan como registro del intento anterior con `approval.status: pending`; la pareja vigente es `comercio-modulo-completo-20261106-*.json`.

## Límites declarados (no son verdes)

1. **Regresión de navegador del candidato.** En esta máquina ya hay un `next dev` en 3001 desde `desarrollo` y un segundo servidor no sirve rutas de dashboard autenticadas (colisión de HMR). Se cubre con la identidad byte a byte de las 173 rutas y con las puertas anteriores; la corrida en navegador va en el ambiente QA de Railway después del merge.
2. **Migraciones.** Las seis (`20261026120000` … `20261028190000`) no se aplican desde esta estación: las aplica Railway al hacer el merge. Después hay que verificar `_prisma_migrations` y que `/api/v1/comercio/dashboard` responda sin P2022.
3. **Bucket `comercio-assets`** inexistente en la nube: la subida real del banner en QA queda sin certificar.

## Autorizaciones pendientes

- Empujar `promocion/comercio-develop-20261106` a `origin` y abrir el PR hacia `develop` (publicación visible para el equipo).
- Despliegue del candidato en Railway para la regresión de navegador.
- Creación del bucket `comercio-assets`.
- Cualquier paso hacia `main`.
