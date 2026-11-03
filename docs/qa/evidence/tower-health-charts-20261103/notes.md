# Torre de control — indicador oficial de salud y vista por empresa

- **Fecha**: 2026-11-03
- **Rama**: `desarrollo`
- **Entorno**: torre aislada en `127.0.0.1:4311` (`TOWER_UI_TOKEN=`, `TOWER_DATA_DIR` temporal, `TOWER_POLL_MS=60000`) contra la API local en `127.0.0.1:3000`.
- **Commit base**: `5345f89b` (tip de `desarrollo` al momento de la captura).

## Qué se validó

1. **Indicador oficial.** El gauge, las bandas y la barra de umbrales publican el mismo puntaje que los tabs de ambiente y el modulo de KPIs. Local: 77/100, módulos 67 (15/32 medibles), infraestructura 100 (10/10 sondas), banda **En riesgo**.
2. **Umbrales.** Óptimo ≥ 85, En riesgo 60–84, Crítico < 60, Sin dato sin medición. Un módulo `degraded` puntúa 65 y cae en **En riesgo**; solo `down` (10) es **Crítico**. Esto corrigió una incoherencia previa (degradado a 55 mostraba "Crítico" con el sistema "En riesgo").
3. **Filtro por banda.** Clic en las tarjetas: Óptimo 1, En riesgo 14, Crítico 0, Sin dato 17; el gráfico pasa a "Mostrando 10 de 14", "10 de 17" y vuelve a "10 de 32" al limpiar el filtro.
4. **Drill-down de módulo.** Clic en una fila abre el diálogo con estado, banda, puntaje (65/100), registros, estado del dato, frescura, modelo, servicios y alertas. Se cierra con Escape o con el botón.
5. **Fórmula.** El botón **Umbrales y fórmula** abre el diálogo metodológico con las cuatro bandas y su conteo.
6. **Vista por empresa.** **Ver módulos** en la tabla de empresas abre el detalle autorizado por empresa con su propio gauge, bandas y gráfico. Demo APEX: 67/100 **En riesgo**, módulos 67, infraestructura sin sondas (declarado). Puebla Operaciones: 72/100, 5/32 medibles. Dos empresas distintas muestran cifras distintas.
7. **Cambio de ambiente.** Al pasar a **Develop · QA** la empresa abierta se vuelve a consultar y muestra `VISTA_EMPRESAS_NO_DISPONIBLE` en lugar de datos del ambiente anterior. El panel de módulos muestra `SIN_TOKEN` y nombra `ENV_DEVELOP_APEX_TOKEN`.

## Por qué QA y PROD no mostraban datos

| Causa | Evidencia | Estado |
|---|---|---|
| Falta `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN` en `apps/control-tower/.env.local` | El panel muestra `SIN_TOKEN`; la API remota exige un JWT propio del ambiente con `apex-control:read` y `apex-control:read_all_tenants` | Bloqueo operativo: se resuelve pegando un JWT de cada ambiente en `.env.local` (nunca en el repositorio) |
| `SUPABASE_ACCESS_TOKEN` vacío | `supabase.configured=false` en QA y PROD | Pendiente pegar token |
| `VERCEL_TOKEN` y `VERCEL_TEAM_ID` vacíos | `vercel.configured=false` en QA y PROD | Pendiente pegar token |
| `RAILWAY_TOKEN` responde `Not Authorized` | `railway.configured=true`, `status=degraded` | Token vencido o proyecto/equipo sin permiso: renovar token |

La torre no inventa estados: cada proveedor sin credencial queda `Sin credenciales`/`degraded` con la variable que falta, y el ambiente sin token queda honestamente en `Sin dato`.

## Comandos ejecutados

```bash
npm run control:test                          # 67/67
node --test apps/api/test/apex-control-modules.test.js apps/api/test/offline-bootstrap.test.js  # 23/23
npm run certify:control-tower:local           # 37/37
```

## Evidencia

| Archivo | Contenido |
|---|---|
| `tower-suite.txt` | Salida completa de `npm run control:test` (67 pruebas) |
| `api-apex-control.txt` | Salida de las suites de API del módulo (23 pruebas) |
| `snapshot-health.json` | Snapshot saneado: puntajes, bandas, umbrales, conteos y proveedores cloud por ambiente (sin tokens) |
| `ui-interactions.json` | Resultado estructurado de las interacciones en navegador (filtro, diálogos, empresa, cambio de ambiente) |
| `tower-health-summary.png` | Vista Resumen con gauge 77, bandas y gráfico por módulo (datos vivos locales) |
| `tower-health-company.png` | Panel por empresa (Demo APEX, 67/100) |
| `tower-health-detail.png` | Vista Detalle completa |

Las capturas se tomaron con Chrome headless (puppeteer-core) porque el navegador en-app de la sesión no expone viewport visible (`viewport=0x0`). La certificación oficial `certify:control-tower:local` (37/37) también genera capturas propias en `docs/qa/evidence/apex-control-tower-f1/`.

## Sin secretos

Los tokens viven solo en `apps/control-tower/.env.local` (ignorado por git). El snapshot exportado no contiene valores de credenciales; solo booleanos `configured` y estados.
