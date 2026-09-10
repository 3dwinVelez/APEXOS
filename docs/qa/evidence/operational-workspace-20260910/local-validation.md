# Validación local pre-QA · operational-workspace-20260910

Fecha: 2026-09-10

Rama fuente: `desarrollo`
Rama destino: `develop`
Commit funcional certificado: `a9c0cb0acdcc5b58d3c3fd650552a18786b4f74e`
Baseline QA: `1a27041318e4a060552f47ae1e48e21f60c10fe8`

## Alcance certificado

- Rediseño del inicio operativo para usuarios de ERP multiempresa.
- Sidebar agrupado por dominios funcionales, con categorías colapsadas por defecto y mejor contraste en modo claro.
- APEX AI convertido en launcher pequeño tipo mascota, abierto por doble click y sin superponerse a acciones operativas.
- Corrección visual del error del login en tema claro/oscuro.
- Estandarización de tablas operativas heredadas.
- Transporte inteligente/cubicaje pendiente de integración QA.

## Evidencia ejecutada

- `node --test apps/api/test/transport-packing.test.js apps/web/test/transport-tms-ui.test.mjs apps/web/test/standard-table-migration.test.mjs apps/web/test/login-error-contrast.test.mjs apps/web/test/login-phase-zero-ux.test.mjs apps/web/test/operational-home-redesign.test.mjs apps/web/test/phase-two-intelligent-experience.test.mjs`
  - Resultado: 63/63 pruebas aprobadas.
- `npm --workspace apps/web run typecheck`
  - Resultado: aprobado sin errores.
- `npx eslint ...` ejecutado desde `apps/web`
  - Resultado: aprobado sin errores.
- `npm --workspace apps/web run build`
  - Resultado: aprobado; Next generó 103 rutas.

## Exclusiones preservadas

Se dejaron fuera del alcance los cambios locales no relacionados en `.env.example`, `apps/web/tsconfig.json`, `package.json`, `scripts/ai-delegate.js` y `scripts/test/ai-delegate.test.js`.
