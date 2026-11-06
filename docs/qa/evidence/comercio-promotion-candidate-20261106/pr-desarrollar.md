# PR hacia `develop` — listo para pegar

**Base:** `develop` (`21ef1a6f`) ← **Head:** `promocion/comercio-develop-20261106` (`423d8cb0`, ya empujada a `origin`)
**Crear en:** https://github.com/3dwinVelez/APEXOS/compare/develop...promocion/comercio-develop-20261106?expand=1

## Título

```text
Promoción controlada del módulo Comercio a develop (177 A / 21 M, 0 borrados)
```

## Cuerpo

```markdown
## Qué entra

El módulo Comercio completo: vitrina pública tematizable por tenant (colores, banner, tonos, patrón, esquinas, textos y catálogo curado), mostrador con descuentos y cuotas, cartera, compras con costo promedio ponderado, gastos de caja, promociones por segmento y vigencia, reportes con gráficos, y su pasada UX medida en Chromium.

`origin/develop` no contenía ni una ruta del módulo, así que **esto no es un merge de `desarrollo`**: el candidato se reconstruyó sobre la línea base vigente de `develop` en una rama auxiliar. Los comites de la torre de control (`apex-control`, `control-tower`), del buzón de correo y de facturas recibidas **no** están aquí, tampoco `agents/`, `.qoder/skills`, gobernanza, briefs ni evidencia de QA.

## Inventario

| | |
|---|---|
| Neto contra `develop` | 177 `A` / 21 `M` / **0 `D`** |
| Baseline | `origin/develop` = `21ef1a6f` (sin cambios al empujar) |
| Commits sobre el baseline | 32 |
| Rutas del módulo | 173, byte a byte idénticas al árbol certificado `69c096c8` |
| Plumbing compartido | 25 archivos, auditados línea quitada por línea quitada |

Manifiestos vigentes: `comercio-modulo-completo-20261106-scope.json` y `...-preqa.json` (en `desarrollo`).

## Puertas ejecutadas sobre el tipo del candidato

- `prisma validate` → schema válido
- Aislamiento multi-tenant y RBAC: **53/53**, `LIMPIEZA {"empresas":4,"residuales":[]}` (4 empresas reales, HTTP in-process contra PostgreSQL local)
- API Comercio: **69/69** (`comercio-service`, `comercio-storage`, `comercio-storefront-theme`, `api-error-mapping`)
- Contratos de fuente Comercio: **49/49** (ux-consistency, storefront-theme, resilience, reports-charts)
- Suite web completa: **749 pruebas, 746 verdes**
- Typecheck: 0 errores · lint: 0 errores / 22 avisos preexistentes
- `qa:promotion:scope` → `ALCANCE DE PROMOCION VALIDO: comercio-modulo-completo-20261106 (198 rutas)`
- `qa:preqa:evidence` → `AUTORIZACION PRE-QA VALIDA: comercio-modulo-completo-20261106`

## Los 3 rojos son de `develop`, no de este PR

Se reproducen sobre `origin/develop` limpio extraído con `git archive`:

- `hr-route-write-fallback.test.mjs` (2): contrato de fuente que exige `if (supabaseSession && !shouldBlockHrWriteFallback(path, method))` mientras `api.ts` de `develop` ya añadió `&& !scheduleMonitorUsesOperationalSource(path, method)`. Ambos archivos están byte a byte como en `develop` (`git diff origin/develop HEAD -- <esos dos archivos>` = 0 líneas).
- `command-palette-module-functions.test.mjs` (1): `/dashboard/contabilidad/pyg/ampliado` no está registrado en la paleta de `develop`.

Arreglarlos es alcance de Contabilidad/Talento Humano y quedó deliberadamente fuera.

## Riesgo compartido que sí deben mirar

9 de los 25 archivos compartidos son componentes y middleware que usan **otros** módulos: `TransportSearchSelect` (Transporte), `button`, `ModalFrame`, `data-table`, `CommandPalette`, `ContextBreadcrumbs`, `globals.css`, el middleware `rbac`/`prisma` y `core/api-error.js` (que reemplaza el manejador de error inline de `server.js` conservando P2002→409, P2025→404, 4xx con `details`, 502/503/504 con código, 400, 429 y 500, y ampliando 502/504). La red de seguridad es la suite completa de `develop` corriendo sobre el candidato: cero fallos nuevos.

## Límites declarados (esto no está certificado aquí)

1. **Regresión de navegador del candidato.** La pasada UX de 287 checks y la regresión de vitrina de 77 se midieron sobre `69c096c8`, cuyas 173 rutas Comercio este candidato replica byte a byte; en la máquina de desarrollo un segundo `next dev` no sirve dashboard autenticado, así que la corrida en navegador del candidato va en el ambiente QA de Railway después del merge.
2. **Migraciones.** Las seis (`20261026120000` … `20261028190000`) no se aplicaron en ninguna nube: por decisión del dueño las aplica Railway al hacer el merge.
3. **Bucket `comercio-assets`** no existe en la nube: la subida real del banner en QA queda sin certificar.

## Después del merge

- Verificar `_prisma_migrations` con las 6 migraciones y que `/api/v1/comercio/dashboard` responda sin `P2022`.
- Crear el bucket `comercio-assets` y certificar la subida del banner en QA.
- Correr en el ambiente QA las certificaciones de navegador del módulo.
```

## Autorización registrada

El dueño autorizó el 2026-11-06: promover solo el módulo Comercio a `develop` de manera controlada, por rama auxiliar + PR, con las migraciones aplicadas por Railway al merged, y tras cerrar la brecha de aislamiento multi-tenant y RBAC. El push de la rama auxiliar ya se ejecutó; la apertura del PR queda a un clic por falta de `gh`/sesión de GitHub en esta estación.
