# Brief — Corte de producción a `apexos.com.co`: CORS, WebSocket y el monitor que no lee

- **ID**: `2026-11-23-prod-dominio-cors-monitor`
- **Fecha**: `2026-11-23`
- **Rama activa**: `desarrollo` (tip `8648bc5e`, igual a `origin/desarrollo`)
- **Prompt crudo**: "en produccion cambiamos el dominio por apexos.com.co pero al ingresar ala herramienta los datos ya no ingresan a prodccion identifica que falta y configura lo que haga falta para volver a conectar los datos en toda la herramienta \"main\"" y, en segunda ronda, "mueve todo lo necesario para actualiar al nuevo dominio al igual que las conexiones de la base de datos ya que aun no sirven las conexiones completamente no consulta datos, has una verificacion de toda la herramienta y conecta todos los servicios con el nuevo domio al api y la base de datos"

## 1. Objetivo

Que la herramienta vuelva a consultar datos en Producción desde el dominio nuevo. Dos fallos separados: el API no declaraba el origen nuevo en su allowlist (todo response cross-origin quedaba descartado por el navegador) y el monitor de rutas no cerraba sus lecturas dentro del presupuesto del cliente. Conectar además lo que el dominio arrastra: proxy mismo-origen, guarda de configuración, WebSocket y el registro documental del corte.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/api/v1/[...path]/route.ts` | `API_BY_WEB_HOST` conoce `www.apexos.com.co` y `apexos.com.co` → los dirige al API de Producción. |
| `M` | `apps/web/test/api-proxy-company-context.test.mjs` | Pierna nueva: cada host de la tabla resuelve el API de su ambiente (igualdad exacta, con la tabla vacía la prueba cae a `undefined` y falla). |
| `M` | `scripts/env-doctor.js` | `requiredFrontendUrl` de Producción pasa a `https://www.apexos.com.co` y la comparación de `TARGET_ENV`/`EXPECTED_ENVIRONMENT` pasa del alias de CLI (`prod`) a `config.target` (`production`), que era lo que hacía la guarda inpasable. |
| `M` | `docs/PRODUCTION_MAIN_DOMAIN_RUNBOOK.md` | Sección «Corte real ejecutado»: forma vigente del corte y las cinco lecciones medidas. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Reglas 57 y 58; `2.42.0 → 2.43.0`. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Reglas 97 y 98 (brief de un corte en variables, y criterio medido contra el origin resuelto hoy); `2.83.0 → 2.84.0`. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Regla 116 (una guarda roja se contrasta con un ambiente sabido-bueno antes de culpar al arnés); `2.103.0 → 2.104.0`. |
| `M` | `agents/apexos-frontend/SKILL.md`, `agents/apexos-brief/SKILL.md`, `agents/apexos-qa/SKILL.md`, `agents/registry.json`, `agents/CHANGELOG.md` | Espejo y registro de los agentes por `agents:sync`. |
| `A` | `docs/briefs/2026-11-23-prod-dominio-cors-monitor.md` | Este brief. |

### Módulos (`change_intent.modules`)

- `plataforma-despliegue`
- `talento-humano` (solo como sitio del síntoma: el monitor de rutas)

### Borrados autorizados (`allowed_deletions`)

- ninguno

### Fuera del repositorio (configuración de ambiente, no viaja en commit)

Variables aplicadas en `apexos-api-prod` de Railway y reflejadas en `config/production.env` (ignorada por git, `config/*.env`):

| Variable | Valor |
|---|---|
| `ALLOWED_ORIGINS` / `CORS_ORIGIN` | `https://www.apexos.com.co,https://apexos.com.co,https://apexos-web-prod-production.up.railway.app` |
| `FRONTEND_URL` | `https://www.apexos.com.co` |
| `NEXT_PUBLIC_WS_URL` (web) | `wss://apexos-api-prod-production.up.railway.app` |
| `EXPECTED_ENVIRONMENT` / `EXPECTED_SUPABASE_PROJECT_REF` (registro local del operador) | `production` / el ref de Producción — autodeclaraciones que `config/qa.env` ya tenía y `config/production.env` no |

Rollback de cada variable: devolver el valor previo (`https://apexos-web-prod-production.up.railway.app` en las dos de origen, `https://` en la del WebSocket) y redeployar el servicio afectado. Ningún token se copia a este brief ni a la evidencia.

## 3. Fuera de alcance

- Promoción de ramas: nada viaja a `develop` ni a `main` por este cambio. El fix de CORS es de configuración del ambiente.
- DNS del raiz `apexos.com.co`: aparcado en GoDaddy. Se entregaron instrucciones, no se registró nada en Railway ni en el registrador (autorización denegada explícitamente).
- Purga del base64 inline existente en `TimePunch` y activación de `HR_EVIDENCE_STORAGE_ENABLED`: cada una es decisión del dueño con su propio riesgo (sección 9).
- Migraciones de base de datos: ninguna.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo`.
- No se tocó `develop`, `main`, ni historia compartida; sin force push, sin reset, sin ramas nuevas.
- Sin secretos en el repositorio: `config/production.env` está ignorada y ninguna clave se copió a documentación, brief o evidencia.
- El arreglo de CORS es aditivo por ambiente: conserva el origen viejo de Railway durante el corte.

## 5. Criterios de aceptación

1. `curl -H "Origin: https://www.apexos.com.co"` contra `https://apexos-api-prod-production.up.railway.app` responde `Access-Control-Allow-Origin: https://www.apexos.com.co`; igual para `https://apexos.com.co` y para el dominio viejo de Railway. → **cumplido**.
2. Un origen ajeno (`https://evil.example`) NO recibe cabecera ACAO. → **cumplido** (la allowlist sigue siendo cerrada, no `*`).
3. Tráfico real de Producción: `hr/operations-map` 200, `hr/routes` 200, `hr/monitor-evidence/identity/*` 200, `talento-humano/empleados` 200, y `OPTIONS` 204 en vez de rechazos. → **cumplido** en los logs HTTP de Railway.
4. `/health` del API Producción responde y su `commit` corresponde al artefacto servido; cero errores de conexión a base en los logs de la aplicación. → **cumplido**.
5. Lectura de solo lectura por el pooler devuelve filas (PostgreSQL, 9 tenants). → **cumplido**.
6. `NEXT_PUBLIC_WS_URL` empieza por `wss://`; con `https://` el constructor de URL del WebSocket queda inválido. → **cumplido**.
7. `node scripts/env-doctor.js --env prod` deja de exigir el dominio viejo como `FRONTEND_URL` y pasa entero en verde. → **cumplido**: `local`, `qa` y `prod` devuelven `ok: true` con 0 fallos. La roja que quedaba no la causaba este corte sino un bug de la guarda: comparaba `TARGET_ENV`/`EXPECTED_ENVIRONMENT` contra el alias de CLI (`prod`) en vez de contra `config.target` (`production`), así que ningún archivo bien configurado de Producción podía pasar; y `config/production.env` nunca declaró `EXPECTED_ENVIRONMENT`/`EXPECTED_SUPABASE_PROJECT_REF` (QA sí los declara desde siempre). Corregido el comparador y añadidas las dos autodeclaraciones.
8. `npm --workspace apps/web run typecheck` sin errores, `npm run lint` con el baseline documentado (24 avisos, 0 errores), `node --test apps/web/test/api-proxy-company-context.test.mjs` 2/2 y `npm run test:agents` 46/46. → **cumplido**.
9. El monitor de rutas muestra conteos reales dentro del presupuesto del cliente. → **NO cumplido**: ver sección 8.

## 6. Evidencia y certificación exigida

- Mediciones de Producción, todas de solo lectura (0 escrituras): cabeceras CORS por origen, latencias de `hr/routes/event-summaries` (19 451 y 19 741 ms) y `hr/operations-map` (12 657, 12 659 y 2 581 ms) en los logs HTTP de Railway, y `length(metadata::text)` sobre 2 100 filas de `TimePunch` del tenant `67a5dcb8-100b-4a44-b5db-d024f2e57450` en 11 978 ms con 55 filas que suman ~50 MB de base64 inline.
- Pruebas locales: typecheck de `apps/web`, `npm run lint`, y la suite de gobernanza de agentes (`agents:sync`, `agents:check`, `agents:preflight`, `agents:coverage`).
- **Certificación versionada end-to-end del flujo completo: pendiente.** `certification_status`: `config_verified_local_tests`. No hay instrumento versionado que certifique «el corte de dominio consulta datos de punta a punta en Producción», y no lo hay mientras el monitor no quepa en su presupuesto. **Bloquea cualquier promoción derivada de este cambio** (AGENTS.md).

## 7. Capacidades protegidas

- **Autenticación y sesión**: intactas. El login y el nombre de la empresa seguían funcionando durante la caída porque caen al respaldo directo de Supabase (`apps/web/lib/api.ts:4744-4751`), que no está sujeto a CORS.
- **Aislamiento multi-tenant**: no se relajó. La allowlist sigue siendo lista cerrada por ambiente; ningún origen pasó a `*`.
- **Escritura de marcaciones**: no cambió su conducta; la barrera de Fase D sigue apagada en Producción porque la variable no existe.
- **Certificaciones que citan `apexos-api-prod-production.up.railway.app`**: siguen válidas porque el API conserva su dominio de Railway.
- **QA**: `ALLOWED_ORIGINS` de QA no se tocó; la guarda «QA no puede apuntar al API PROD» de `env-doctor` sigue en verde.

## 8. Riesgos y rollback

- Riesgo: con el origen declarado, la latencia del monitor se vuelve visible como «Sin lectura» en vez de como error de red. Mitigación: es diagnóstico correcto — el badge significa que ninguna fuente del monitor respondió a tiempo; los ceros del horario 382 el 23-11 son reales (0 marcas y 0 actividades en base).
- Riesgo: permitir el dominio de Railway viejo junto al nuevo ensancha la allowlist. Mitigación: es la forma aditiva del corte; se retira cuando el dominio propio esté estable, y los orígenes ajenos siguen rechazados.
- Rollback de configuración: devolver `ALLOWED_ORIGINS`/`CORS_ORIGIN`/`FRONTEND_URL` a `https://apexos-web-prod-production.up.railway.app` en `apexos-api-prod` (redeploy del servicio). Rollback de código: `git revert` de los commits de este brief; ninguno toca lógica de negocio.

## 9. Supuestos y preguntas abiertas

- Supuesto: el API seguirá en su dominio de Railway mientras el dueño no pida `api.apexos.com.co`.
- Supuesto: `www.apexos.com.co` es el origin canónico de la web de Producción.
- Decisión abierta del dueño, la única que no puede tomarse por defecto: qué hace bajar el monitor de los 20 s. Tres vías medidas, ninguna aplicada:
  - **(A) Promover** los arreglos de latencia y evidencia que ya viven en `desarrollo` (`19df3ca2`, `2f8907af`, `4f5a6e4b`, `c6058332`) por `develop` hasta `main`. Requiere autorización de promoción y certificación de alcance.
  - **(B) Purjar** los ~50 MB de base64 inline de las 55 filas de `TimePunch` hacia el bucket `operational-evidence`, que ya existe. Destructivo: exige respaldo y autorización explícita.
  - **(C) Encender** `HR_EVIDENCE_STORAGE_ENABLED=true` en `apexos-api-prod`. Solo configuración: el código ya está desplegado y lee la bandera. Frena bytes nuevos, no encoge los 50 MB actuales, y cambia la conducta en campo: una subida fallida rechaza la marcación con `503 STORAGE_UPLOAD_FAILED`.

## 10. Autorizaciones requeridas

- [x] Aplicar el arreglo de CORS en Producción aunque provoque redeploy (autorización explícita del dueño).
- [x] Corregir `NEXT_PUBLIC_WS_URL` a `wss://` (autorización explícita del dueño).
- [x] Push a `origin/desarrollo` (autorización permanente acotada de AGENTS.md).
- [ ] Registrar `apexos.com.co` en Railway o cambiar DNS en GoDaddy — el dueño pidió instrucciones, no ejecución.
- [ ] Promoción de las vías (A), (B) o (C) de la sección 9.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: apertura `INTEGRAR_REMOTO`/BLOQUEADO (5 agentes más nuevos en la remota) → trabajo de solo lectura hasta integrar. Tras `git merge --ff-only origin/desarrollo` (6 detrás, 0 delante, sin colisión de rutas): `OK_CON_ADVERTENCIAS`.
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-performance`, `apexos-seguridad`, `apexos-db-nube`, `apexos-qa`.
- **Documentación actualizada**: este brief y `docs/PRODUCTION_MAIN_DOMAIN_RUNBOOK.md`.
- **Agentes actualizados**: `apexos-frontend` `2.42.0 → 2.43.0` (reglas 57 y 58) y `apexos-brief` `2.83.0 → 2.84.0` (reglas 97 y 98, nacidas de la forma de este propio brief).
- **Registro**: `agents/registry.json` por `agents:sync` y entrada en `agents/CHANGELOG.md` (2026-11-23).
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
