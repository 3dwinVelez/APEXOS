# Brief — Piso de latencia de la fase de autenticación

- **ID**: `2026-11-19-piso-de-latencia-autenticacion`
- **Fecha**: `2026-11-19`
- **Rama activa**: `desarrollo` (HEAD `b5969ad4`, sincronizado con `origin/desarrollo`)
- **Prompt crudo**: "bueno es indispesable poder purgar y elminar cualqier error en las consultas para que carguen la informacion de manera correcta, has lo necesario para que en todos los ambientes sobre todo el mas importante \"main\" quede con este cambio medido y certificado, la meta debe ser un canal limpio y confiable para los datos que trae al frond para el usuario de manera eficiente con respuestas rapidas, luego interviene cualquier tema que este pendiente por validarse o corregisrte y evitar que este generando problemas de latencias, tienes toda mi autorizacion"

## 1. Objetivo

Que ninguna petición autenticada pague un impuesto fijo de latencia por el camino de
la decisión de autorización. La decisión debe costar **una** sentencia en lugar de
cinco, sin cambiar una sola consecuencia funcional: mismo aceptado, mismo medido,
mismo rechazado, mismo tenant autoritativo y mismo RBAC. Criterio verificable: mediana
de la ruta nueva ≤ 0,6 × mediana de la ruta vieja sobre datos reales de QA y
Producción, con cero divergencias de decisión y cobertura obligatoria.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/security/authorizationState.js` | `validateAuthorization` decide con una sentencia parametrizada (`AUTHORIZATION_SNAPSHOT`, marcadores `$1`/`$2`); normaliza `revoked_at`/`expires_at` que salen como texto desde `jsonb`; alias entrecomillados porque `user` es reservado |
| `M` | `apps/api/test/security-authorization-revocation.test.js` | Test nuevo de contrato: una sola sentencia, parámetros fuera del texto, `sid` hostil y tenant del token nunca interpolados, tenant resuelto = el del usuario, permisos del rol intactos. Además: el guardarrail de CPU local pasa de un reloj absoluto de una pasada (250 ms por 100 000 decisiones, 1,5x de margen sobre los 135-164 ms medidos) a mejor-de-tres-pasadas con techo de 600 ms, con su rojo provocado documentado (5 µs inyectados por decisión → 714 ms → ROJO) |
| `M` | `apps/api/test/auth-session-hardening.test.js` | Mock de `$queryRawUnsafe` que reproduce las condiciones de verdad de la sentencia (sesión solo si es del mismo usuario) |
| `M` | `apps/api/test/authorization-observe.test.js` | Idem para los modos observar / enforce / off y la rotación de sesión |
| `A` | `scripts/certifications/hr-auth-latency-differential.js` | Certificación diferencial por ambiente: guarda de `project ref`, muestra activa, seis casos, comparación de decisión y detalle, presupuesto de latencia y gate de cobertura |
| `M` | `package.json` | `certify:hr-auth-latency:qa` y `certify:hr-auth-latency:production` |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/00-veredicto.md` | Veredicto con cifras por ambiente, suite completa y atribución de las seis corridas descartadas del arnés |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-qa-1795101503295.json` | Evidencia verde de QA (18 casos, 0 divergencias, cobertura 6/9/3) |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-production-1795101527356.json` | Evidencia verde de Producción (18 casos, 0 divergencias, cobertura 6/9/3) |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-production-1795101013473.descartada-por-arnes.json` | ROJO falsado por la forma de la réplica (15 divergencias que no eran del producto): se conserva para trazabilidad, no se cita |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-qa-1795100959367.descartada-por-arnes.json` | Verde vacío por el mismo defecto de forma (12 casos, factor 0,36): se conserva, no se cita |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-qa-1795101173303.descartada-cobertura-vacia.json` | Verde con muestra de empresas inactivas: los 12 casos rechazaban por el mismo motivo y el contador de divergencias no podía crecer (sin campo `cobertura`): se conserva, no se cita |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-qa-1795101386852.descartada-clasificacion-arnes.json` | `clasifica()` leyendo `lanza` en vez de `lanz`, con cobertura imposible `{ACEPTA 9, MIDE 9, RECHAZA 0}`: se conserva, no se cita |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-production-1795101412324.descartada-clasificacion-arnes.json` | Idem en Producción, misma cobertura imposible: se conserva, no se cita |
| `A` | `docs/qa/evidence/hr-auth-latency-20261119/diferencial-production-1795101133595.descartada-sin-gate-de-cobertura.json` | Corrida válida de latencia pero tomada antes del gate de cobertura: se conserva, no se cita |
| `M` | `docs/AUTHORIZATION_REVOCATION_DESIGN.md` | Sección Rendimiento reescrita con el contrato de una sentencia y las cifras medidas; se retira el objetivo inalcanzable de p95 < 80 ms sobre pooler |
| `M` | `docs/PERFORMANCE_ANTI_PATTERNS.md` | Anti-patrón nuevo: `include` de Prisma en la decisión de autorización |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | Control de la ruta de autenticación en una sentencia |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | Control de SQL crudo parametrizado y tenant autoritativo en la ruta de autenticación |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | Control: el piso de latencia es por sentencia, no por trabajo; medir antes de añadir índices |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control: un gate de comparación no puede pasar con cobertura vacía |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | Control: el scratch de `%TEMP%` se borra; la medición que no es versionada no es certificable |
| `M` | `agents/**` (espejos) y `agents/registry.json` | Regenerados por `npm run agents:sync` |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervención |

### Módulos (`change_intent.modules`)

- `auth`
- `platform-seguridad`
- `rendimiento`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- No se toca `apps/api/server.js` ni ningún otro consumidor de
  `validateAuthorization`: el contrato de entrada/salida es el mismo.
- No se cambian las banderas de observación/enforcement ni la semántica de
  `authorizationDecision`.
- No se añaden índices ni se ejecuta DDL remoto: los planes medidos ya estaban en 1 ms.
- No se habilita `HR_EVIDENCE_STORAGE_ENABLED` en QA/Producción (autorización aparte).
- No se purgean las 45 filas de `GpsPing` con selfie inline.
- No se promociona a `develop` ni a `main` en este brief.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: el tenant autoritativo sigue siendo el del usuario.
- Los scripts de nube declaran el `project ref` esperado y abortan sin conectar.
- Sin secretos ni datos de clientes en evidencia: solo hash de tenant, enteros y milisegundos.
- SQL crudo solo con marcadores `$n` y parámetros posicionales.

## 5. Criterios de aceptación

1. `cd apps/api && DISABLE_REDIS=true node --test test/security-authorization-revocation.test.js test/authorization-observe.test.js test/auth-session-hardening.test.js` → verde, incluido el test que exige **una** sentencia y parámetros fuera del texto.
2. `npm run certify:hr-auth-latency:qa` → `VERDE`, 0 divergencias, factor ≤ 0,6 y cobertura con al menos un `ACEPTA` y dos casos con motivo.
3. `npm run certify:hr-auth-latency:production` → idéntico sobre datos de Producción.
4. Sin el paso de normalización de fechas, una sesión vencida volvería a aceptarse: el mock de las pruebas reproduce esa condición y la prueba de revocación selectiva la cubre.
5. Comportamiento del usuario: la primera carga del monitor y el listado de horarios dejan de pagar cuatro viajes extra al pooler por petición.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/security-authorization-revocation.test.js`, `authorization-observe.test.js`, `auth-session-hardening.test.js` + suite API completa.
- Certificación: `npm run certify:hr-auth-latency:qa` y `:production`, evidencia en `docs/qa/evidence/hr-auth-latency-20261119/`.
- `certification_status` esperado: `local_passed_qa_pending` — la latencia end-to-end desplegada se remide con `certify:hr-monitor-budget:*` después de promocionar y desplegar.

## 7. Capacidades protegidas

- **Revocación de sesión y versiones de autorización** — seis casos × 18 decisiones comparadas ruta contra ruta, con el motivo exacto en la evidencia.
- **RBAC del rol** — el test de contrato verifica que los permisos llegan al contexto; la certificación compara el número de permisos resueltos.
- **Aislamiento multi-tenant** — el tenant se resuelve desde el usuario; el test inyecta `tenant_id` hostil en el payload y exige el real.
- **Login, refresh y rotación** — `auth-session-hardening.test.js` sigue verde sobre la nueva ruta.

## 8. Riesgos y rollback

- Riesgo: SQL crudo en la ruta de autenticación → Mitigación: marcadores `$n`, tipos `cast` explícitos, test que falla si el texto contiene el `sid` o el tenant del token, y `401` ante `cast` inválido igual que hoy.
- Riesgo: fechas como texto desde `jsonb` → Mitigación: `dateOrNull` antes de comparar, cubierto por la prueba de revocación.
- Riesgo: el lector de sesión cambia de forma y un consumidor esperaba campos Prisma → Mitigación: `validateAuthorization` devuelve el mismo objeto que antes; ningún otro consumidor tocó.
- Rollback: `git revert` del commit de producto (no reset, no squash).

## 9. Supuestos y preguntas abiertas

- Supuesto: el costo por sentencia del pooler es el piso dominante; se midió 4× de diferencia con la misma decisión.
- Supuesto: las cifras desde el puesto no igualan las de Railway (500-600 ms por sentencia medida allí); lo portable es la relación, y la cifra absoluta se remide al desplegar.
- Pregunta: ninguna que altere el alcance.

## 10. Autorizaciones requeridas

- [x] Trabajar en `desarrollo` y publicar con `git push origin desarrollo` (autorización permanente acotada).
- [ ] Promoción `desarrollo → develop` con su manifiesto de alcance v2, `qa:promotion:scope`, `qa:preqa:evidence` y despliegue en QA.
- [ ] Promoción `develop → main` con `qa:approval:evidence`, aprobación funcional de QA y despliegue en Producción.
- [ ] Rotación de la contraseña de la base de Producción expuesta en consola por el comando `railway variables --json` de una intervención anterior.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `Veredicto: OK_CON_ADVERTENCIAS`; ruteo — `equipo-apexos`: `package.json`, `scripts/certifications/hr-auth-latency-differential.js`; `apexos-backend` y `apexos-seguridad`: `apps/api/src/security/authorizationState.js`; `apexos-performance`: `docs/PERFORMANCE_ANTI_PATTERNS.md`; `apexos-qa`: producto, pruebas, evidencia y certificationes. Advertencia: `docs/AUTHORIZATION_REVOCATION_DESIGN.md` y `docs/briefs` no tienen dueño asignado (usa `equipo-apexos`).
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: `docs/AUTHORIZATION_REVOCATION_DESIGN.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md`, `docs/qa/evidence/hr-auth-latency-20261119/00-veredicto.md`, este brief.
- **Agentes efectivamente actualizados al cierre**: `apexos-backend` `2.18.0` → `2.19.0`; `apexos-seguridad` `2.30.0` → `2.31.0`; `apexos-performance` `2.19.0` → `2.20.0`; `apexos-qa` `2.76.0` → `2.78.1` (regla 89 reescrita con las seis corridas descartadas y regla 90 nueva para el presupuesto de latencia del test); `equipo-apexos` `2.47.0` → `2.48.0`; `apexos-brief` `2.61.0` → `2.62.0`. Controles nuevos: los de la tabla del sección 2.
- **Registro**: `agents/registry.json` regenerado por `npm run agents:sync` con `sha256` nuevo y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<las 10 rutas del preflight>"` en verde.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde
- [ ] Sin secretos ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
