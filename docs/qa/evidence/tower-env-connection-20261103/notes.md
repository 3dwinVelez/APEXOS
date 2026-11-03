# Conexión real de QA y PROD — 2026-11-03

## Qué se midió

La torre ya tenía las URLs de API, web y Supabase de `develop` y `main`. El panel mostraba `SIN_TOKEN` y atribuía el "Sin dato" a una credencial faltante. La comprobación contra los ambientes reales muestra otra causa raíz.

| Ambiente | `GET /health` | `GET /api/v1/apex-control/modules` sin credencial | Lectura |
|---|---|---|---|
| QA (`develop`) | 200 · `a505e97f9622` · 18 módulos | 404 `Route not found` | El build no incluye el módulo `apex-control`. |
| PROD (`main`) | 200 · `938fc2b6f42c` · 17 módulos | 404 `Route not found` | El build no incluye el módulo `apex-control`. |

`apex-control` nació en `2a186a63` (2026-11-02). Los builds desplegados son del 29-oct y 26-oct, anteriores al módulo. Por eso **no falta solo el JWT**: aunque se configurara, la ruta no existe en esas APIs.

## Cambio aplicado

- `lib/modules.js`: sin token la torre consulta igual la ruta, sin credencial. `401` confirma ruta viva y falta JWT (`SIN_TOKEN`); `404` se reporta como `MODULO_NO_DESPLEGADO`. Con token, un 404 sin código también cae en `MODULO_NO_DESPLEGADO`; los códigos de empresa (`EMPRESA_NO_ENCONTRADA`, etc.) se conservan.
- `lib/activity.js`: misma clasificación para actividad y empresas. Sin token ya no inventa requests con credencial: sondea sin `Authorization`.
- `lib/probes.js`: `runEnvironmentProbes` y `runProbes` publican `api`/`deployed` con versión, commit y cantidad de módulos leídos de `/health`. Un `commit: "unknown"` del API local se normaliza a `null` para no ensuciar el tab.
- `public/app.js`: el tab y el encabezado del indicador muestran el build; `MODULO_NO_DESPLEGADO` explica que falta desplegar, no configurar token, e incluye el commit afectado.

## Verificación

- Suite de la torre: 68/68 en `tower-suite.txt`.
- Sondas reales: `real-probe.txt`.
- Snapshot saneado (sin tokens ni JWT): `snapshot-environments.json`.
- Navegador real (Chrome headless, 1600×1100): `ui-environments.json` y capturas `tower-env-local.png`, `tower-env-develop.png`, `tower-env-main.png`. Sin errores de consola.
- Lectura del panel tras el cambio: LOCAL 77/100 con 10 módulos; QA 83/100 con `MODULO_NO_DESPLEGADO` y build `a505e97`; PROD 83/100 con `MODULO_NO_DESPLEGADO` y build `938fc2b`.

## Lo que falta para cifras reales de módulos en QA y PROD

1. Desplegar un build que incluya `apex-control` en cada ambiente. Eso implica promoción `desarrollo -> develop` y `develop -> main` con sus gates; no se ejecutó por falta de autorización explícita.
2. Configurar `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN` con un JWT de cada ambiente que tenga `apex-control:read` (y `apex-control:read_all_tenants` para la vista por empresa).
3. Credenciales cloud: `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` vacíos; `RAILWAY_TOKEN` responde `Not Authorized`. Las llaves públicas de Supabase no viajan en los bundles web de QA/PROD, así que la sonda queda en "exige apikey" hasta configurar `ENV_*_SUPABASE_ANON_KEY`.
