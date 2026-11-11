# Brief — Servicios: la captura pública y el monitor vuelven a traer las órdenes

- **ID**: `2026-11-11-servicios-captura-monitor`
- **Fecha**: `2026-11-11`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "neceisto que revices el modulo de servicios en todos los ambiente comenzando desde el main ya que con esta implementacion de seguridad la url que captura los servicios ya no esta funcionando ni traer los servicios al monitor"

## 1. Objetivo

Localizar, con medición en LOCAL, QA y PROD, qué rompió la implementación de seguridad en Servicios y corregir en `desarrollo` todo lo que sea código. Tres resultados verificables:

1. **La captura pública guarda una referencia válida por producto.** Antes, solo el primer `items[].reference_id` se resolvía por código contra la allowlist y los demás se copiaban tal cual a `metadata.items` —un id que el cliente declara y que **no** se validaba contra el catálogo de la empresa se persistía en la orden—. Ahora cada item se cierra en una sola consulta contra `service_references` de la empresa: un id ajeno o inactivo responde `400` y no llama al RPC; la compatibilidad con clientes viejos (id no UUID + código) sigue resolviendo solo contra la allowlist.
2. **El monitor se auto-repara cuando el navegador guarda una empresa obsoleta.** El servidor mantiene intacto su contrato (un `company_id` ajeno u obsoleto devuelve `403` con `X-Apexos-Scope-Reason: no-eligible-membership`), pero la pantalla detectaba ese 403 como un error de red y quedaba vacía aunque la captura sí escribiera. Ahora limpia la empresa guardada, reintenta sin empresa y adopta la empresa efectiva que el servidor publica en `X-Apexos-Scope-Company`.
3. **La medición por ambiente queda escrita** para que la próxima vez no se confunda un fallo de datos/configuración con un fallo de código.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/app/api/public/service-requests/route.ts` | `activeReferenceIdSet(companyId, ids)`: una consulta `service_references?company_id=eq.…&active=eq.true&id=in.(…)` cierra todos los ids declarados; el bucle por item resuelve primero contra ese conjunto, luego por código/nombre (solo si el id no es UUID y es el primer item), y si no hay coincidencia responde `400` nombrando la solicitud. `p_metadata.items[].reference_id` escribe el id ya validado. |
| `M` | `apps/web/app/api/services/monitor-orders/route.ts` | La respuesta 200 publica `X-Apexos-Scope-Company` con la empresa efectiva del alcance (`scope.companyIds[0]`); el contrato 403 de `resolveServiceScope` no cambia. |
| `M` | `apps/web/app/dashboard/servicios/page.tsx` | `loadSupabaseMonitorOrders`: la consulta se construye por intento (URLSearchParams nuevo), y ante `403` + `x-apexos-scope-reason: no-eligible-membership` borra `apexos_company_id`, reintenta sin empresa y guarda el `x-apexos-scope-company` que devolvió el servidor. |
| `M` | `apps/web/test/public-service-requests-security.test.mjs` | Cuatro pruebas nuevas: cierre por item contra la allowlist, rechazo de referencia inactiva sin RPC, compatibilidad con id no UUID, y item 2 con empresa ajena nombrada en el mensaje. |
| `M` | `apps/web/test/service-monitor-live-refresh.test.mjs` | Prueba nueva: una empresa obsoleta guardada en el navegador no deja el monitor vacío (limpieza, reintento, adopción de la cabecera) y el contrato 403 del servidor sigue afirmado. |
| `A` | `docs/qa/evidence/servicios-captura-monitor-20261111/ambiente-inventario.txt` | Inventario medido por ambiente (LOCAL, QA, PROD): módulo, referencias, órdenes, membresías y la línea del hallazgo. |
| `A` | `docs/qa/evidence/servicios-captura-monitor-20261111/qa-cadena-captura-monitor.txt` | Cadena captura → monitor en QA con usuario efímero y limpieza por id; corrida del código nuevo contra la base real de QA (dos referencias persistidas, referencia manipulada `400`, limpieza `204`); corrida versionada 9/9. |
| `A` | `scripts/certifications/servicios-captura-monitor-qa.js` | Certificación remota reproducible: catálogo, captura, usuario efímero, tres lecturas del monitor, 403 de empresa ajena y limpieza por id; aborta si la evidencia contendría una credencial. |
| `M` | `package.json` | Script `certify:servicios-captura-monitor:qa`. |
| `A` | `docs/qa/evidence/servicios-captura-monitor-20261111/web-tests.txt` | Salidas medidas: 14/14, 13/13, 685/685 y `tsc --noEmit` sin hallazgos. |
| `A` | `docs/services/PUBLIC_CAPTURE_MONITOR_CONTRACT.md` | Contrato del módulo: captura pública, cierre por referencia, alcance del monitor y quiebre/auto-reparación del id guardado. |
| `A` | `docs/briefs/2026-11-11-servicios-captura-monitor.md` | Este brief. |
| `M` | `agents/apexos-frontend/SKILL.md` | Control 35: un `403` de alcance no se pinta como red caída; la pantalla limpia el id obsoleto y adopta el que el servidor publica. |
| `M` | `agents/apexos-qa/SKILL.md` | Control 61: la cadena captura → monitor se certifica con usuario efímero y tres lecturas (empresa propia, sin empresa, empresa ajena), con limpieza por id. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control 36: todo `items[].reference_id` que el cliente declara se cierra contra la allowlist antes de persistirse; un id no validado no entra a metadata. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps, `updated_at`, `sha256` y la entrada de la intervención. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-seguridad/SKILL.md` | Espejos generados por `npm run agents:sync`. |

### Módulos (`change_intent.modules`)

- `servicios`
- `certificaciones-servicios`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- **`apps/api/**`**: la captura del API local ya validaba todos los items (`public-service.js:122-131`, `id: { in: referenceIds }, active: true`); la asimetría era solo de la ruta cloud de `apps/web`. No se toca el API.
- **El contrato 403 de `resolveServiceScope`**: el servidor sigue rechazando una empresa que no es del usuario. Si se aflojara, cualquier miembro podría leer órdenes de otra empresa con solo pedir su id. Lo que se corrige es el cliente que se quedaba pegado a un id obsoleto.
- **`role_permissions` vacío** en QA: la denegación es autoritativa y no tiene relación con el síntoma (la captura y el monitor usan membresía, no el permiso del módulo). No se rellena.
- **Migraciones, RLS y datos de negocio**: ninguna escritura. La corrida en QA creó datos sintéticos identificables y los borró por id exacto; PROD solo se leyó.
- **Promoción**: nada de `develop` ni `main` en esta intervención.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant intacto: la allowlist de captura se lee de `APEXOS_PUBLIC_SERVICE_COMPANY_ID` y el monitor sigue exigiendo membresía.
- Sin secretos ni credenciales en el brief, el diff ni la evidencia. Las llaves anon/service role de QA y PROD se usaron desde el archivo de configuración local, nunca se imprimieron ni se versionaron.

## 5. Criterios de aceptación

1. `node --test test/public-service-requests-security.test.mjs` → **14/14**.
2. `node --test test/service-monitor-live-refresh.test.mjs` → **13/13**.
3. `node --test test/*.test.mjs` → **685/685**; `npx tsc -p tsconfig.typecheck.json --noEmit` → sin hallazgos.
4. En QA, con el handler nuevo y dos productos con referencias distintas: la orden persiste `items[]` con las dos referencias reales; una referencia de otra empresa responde `400` con «La referencia de la solicitud 1 no esta activa en el catalogo publico de esta empresa.» y no crea nada.
5. En QA, monitor con la empresa del usuario o sin empresa → `200` y encuentra la orden recién capturada; con una empresa ajena → `403``no-eligible-membership` (contrato del servidor conservado), y el cliente reintenta sin empresa.
6. PROD sigue escribiendo: 285 órdenes SCJ, 263 creadas desde el formulario público, 5 del día de la medición.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/web/test/public-service-requests-security.test.mjs`, `apps/web/test/service-monitor-live-refresh.test.mjs` y la suite completa de `apps/web`.
- Certificación funcional: `npm run certify:servicios-captura-monitor:qa` → **9/9** (`docs/qa/evidence/servicios-captura-monitor-20261111/qa-certification.json`), usuario efímero, tres lecturas y limpieza por id.
- Inventario por ambiente: `docs/qa/evidence/servicios-captura-monitor-20261111/ambiente-inventario.txt`.
- `certification_status` esperado: `local_passed_qa_pending` (QA medido contra el build `c72955d2`; el código nuevo viaja a `desarrollo`).

## 7. Capacidades protegidas

- **Captura pública sin fuga de tenant** — cada referencia se cierra contra la empresa de la allowlist; una referencia ajena no crea orden (`public-service-requests-security`).
- **Alcance del monitor** — membresía administrativa, técnico con fila de empleado y rechazo 403 de empresa ajena (`service-monitor-live-refresh`).
- **Self-heal sin abrir la puerta** — el cliente limpia su propio id; el servidor sigue rechazando (misma suite).
- **Capacidades ya protegidas de Servicios** (corrección administrativa, RBAC, aislamiento) no se tocan: no hay cambios en `apps/api/**` ni en el esquema.

## 8. Riesgos y rollback

- Riesgo: el self-heal del cliente convierta un 403 legítimo en una consulta sin empresa y muestre más de lo que corresponde. → Mitigación: el servidor resuelve el alcance sin empresa por membresía, nunca por el id que quedó guardado, y la prueba fija que el 403 del servidor no se relaja. → Rollback: revert del commit, no reset.
- Riesgo: el cierre por item añada una consulta extra por captura. → Mitigación: una sola consulta con `id=in.(…)` para todos los items, acotada a los ids declarados y a `active=eq.true`.
- Riesgo: la compatibilidad con clientes viejos se pierda. → Mitigación: la ruta por código se conserva para id no UUID del primer item, contra la misma allowlist, y con prueba.

## 9. Supuestos y preguntas abiertas

- **Hallazgo abierto, no tocado por falta de autorización de datos**: en PROD el puente Prisma `Tenant` → empresa Supabase de SCJ existe, pero SCJ tiene **0** filas en el catálogo Prisma de referencias; la ruta cloud (la que usa la pantalla) está sana. Si alguien consume el API con catálogo Prisma, `POST /services/public/orders` responde por referencias inexistentes. Cerrarlo exige sincronizar el catálogo Prisma de SCJ (escritura de datos de producción) → autorización del dueño.
- Supuesto: el síntoma del dueño («no trae los servicios al monitor») corresponde al `company_id` obsoleto guardado en el navegador, reproducido en QA (403 + monitor vacío con captura 200). La medición de PROD confirma que los datos existen, así que no es pérdida de datos.
- Nota de higiene: en una corrida previa de `psql` un error de conexión imprimió `DATABASE_URL` en stderr. No se versionó ni se copió a evidencia, y las lecturas posteriores usaron piezas por variable con stderr suprimido.

## 10. Autorizaciones requeridas

- [x] `git push origin desarrollo` al cierre (autorización permanente y acotada de AGENTS.md).
- [ ] Sincronizar el catálogo Prisma de referencias de SCJ en PROD (sección 9): no se ejecutó.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes (medido, HEAD `7644deef` == `origin/desarrollo`)**: `npm run agents:preflight -- --paths` de las cinco rutas → **Veredicto: `OK`**, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ruteo `equipo-apexos`, `apexos-frontend`, `apexos-qa`; lecturas obligatorias `equipo-apexos`, `apexos-frontend`, `apexos-qa`.
- **Agentes a actualizar**: `apexos-frontend` 2.19.0 → 2.20.0 (control 35), `apexos-qa` 2.47.0 → 2.48.0 (control 61), `apexos-seguridad` 2.21.0 → 2.22.0 (control 36).
- **Documentación**: este brief y `docs/services/PUBLIC_CAPTURE_MONITOR_CONTRACT.md`.
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y `agents/CHANGELOG.md` bajo `## 2026-11-11`.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas de la sección 5 → commit → `git push origin desarrollo`.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`: `apexos-brief` 2.39.0 y `apexos-frontend` 2.20.0 `local-ahead`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
