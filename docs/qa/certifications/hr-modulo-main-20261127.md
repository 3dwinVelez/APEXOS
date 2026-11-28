# Certificación — Talento Humano completo de develop a Producción (2026-11-27)

- **ID**: `hr-modulo-main-20261127`
- **Destino**: `main` (baseline `91d43c79220d`, medido y sin cambios al correr el portón)
- **Fuente**: `develop` (binario certificado en QA `a440560d7f04`), contenido escrito y probado en `desarrollo` (`aa265985`)
- **Candidato técnico**: `303f0725` (rama auxiliar `codex/qa-hr-modulo-main-20261127`, worktree `.tmp/wt-hr-main-20261126`)
- **Brief**: `docs/briefs/2026-11-27-hr-modulo-main-migracion.md`
- **Evidencia**: `docs/qa/evidence/hr-modulo-main-20261127/`
- **certification_status**: `candidato_certificado_local_y_qa_pendiente_despliegue`
- **Escrituras a registros de cliente en este documento**: cero. No se tocó ninguna base de datos ni ningún despliegue para generar esta evidencia.

## 1. Qué se pidió

Migrar el módulo de Talento Humano completo de `develop` a `main` sin adulterar registros ni dañar funciones ajenas, alineando los tres ambientes a la versión ya trabajada, y dejando **provisionalmente en Producción la marcación por web** como estaba. La orden del dueño autoriza el viaje y sus despliegues; no autoriza force push, reescritura de historia, borrado de ramas ni cambios de infraestructura fuera de lo declarado.

## 2. Inventario exacto medido

| Medida | Valor |
|---|---|
| Rutas netas del candidato contra Producción | **41** (14 altas, 27 modificaciones, **0 borrados**) |
| Rutas que llegan byte a byte desde `origin/desarrollo` | **37** |
| Vías de fusión a tres vías (no se pisa el árbol de Producción, se suman líneas declaradas) | **4** |
| Rutas sin blob en `desarrollo` (contenido inventado en el puerto) | **0** |
| Invariantes del replay sobre el árbol commiteado | **37/37 válidas** |
| Derivas que el selftest del portón exige rojas | **6/6 rojas** |
| Suites del árbol candidato (API apuntadas) | **46/46** |
| Suites del árbol candidato (portal `hr-*.test.mjs`) | **185/185** |
| Suite del portón de replay | **4/4** |
| `next build` de producción del portal | **exit 0**, 141 páginas generadas |
| Migraciones de esquema que viajan en el árbol | **3** (pendientes de aplicar en Producción) |
| Certificación de campo en QA sobre el binario desplegado | **27/27 APROBADO**, empresa modelo NYVORA |

Las cuatro vías de fusión, con su delta medido contra el árbol de Producción:

| Ruta | Suma sobre `main` | Qué NO sube de `desarrollo` |
|---|---|---|
| `apps/api/prisma/schema.prisma` | +94 / −0 | 324 líneas de modelos de frentes ajenos (Comercio, facturas, torre, bases de auditoría) |
| `package-lock.json` | +153 / −0 | 449 líneas de dependencias de frentes ajenos |
| `apps/api/package.json` | +4 / −0 | 11 dependencias de frentes ajenos |
| `apps/web/lib/api.ts` | +5 / −1 | 55 líneas de telemetría de cliente y otros frentes |

## 3. Por qué no fue un merge ni un replay liso

`main` y `develop` ya no descienden uno del otro: medido con `git rev-list --count`, `develop` trae **173 commits** que Producción no tiene y Producción trae **220** que `develop` no tiene. Un merge de rama arrastraría frentes completos que no son de Talento Humano (Comercio M-30, facturas recibidas, torre de control, rediseños de lobby) y borraría rutas que Producción sí sirve. Un replay liso (copiar el blob de `desarrollo` sobre `main`) tampoco era válido en las cuatro rutas compartidas: pisaría trabajo ajeno que vive en `schema.prisma`, en el lock y en el cliente.

El transporte fue **replay puntual con hunks fusionados**: 37 rutas blob-idénticas más 4 fusiones línea-declaradas, cada una verificada por la invariante `insert` del instrumento versionado `scripts/certifications/promotion-migration-check.js`, que rompe si la fusión borra una línea del destino que nadie declaró y rompe también si no borra la línea que declaraba reemplazar. La sexta deriva (`insert_reemplazo_no_declado`) se probó inyectándola: sale roja.

## 4. El hallazgo que cambió el alcance: la ruta que íbamos a dejar fuera

`apps/web/lib/api.ts` estaba excluido del candidato por motivo de telemetría (desarrollo lee `health.commit` y esa lectura no pertenece a este frente). La suite del portal lo desmintió: el punto D de `apps/web/test/hr-offline-marking.test.mjs` salió rojo porque en ese archivo vive `shouldBlockHrWriteFallback`, la guarda que impide que el respaldo de Supabase escriba cuando la API rechazó. Sin ella, los maestros biométricos que suben en este viaje (`shared-devices`, `face-enrollment`) habrían llegado a Producción con el respaldo activo: la pantalla habría seguido mostrando la marcación mientras la API la rechazaba, que es exactamente la clase de defecto ya documentada como «la pantalla miente por omisión».

Se resolvió llevando **solo el hunk de la compuerta** (5 líneas agregadas, 1 reemplazada) y dejando fuera la telemetría. Después de la fusión, la suite volvió a **185/185** y el punto D queda verde por la guarda, no por relajo del test.

## 5. Capacidades protegidas y cómo se midieron

- **Marcación por web en Producción**: no se retira ninguna compuerta. `apps/api/src/modules/hr/webPunchSelfie.js` no existe en `main` (retiro certificado el 2026-11-24) y el candidato no lo revive: `git grep webPunchSelfie apps/api/src` devuelve cero rutas. La tanda del operador (entrada, almuerzo, almuerzo, salida) sigue ejercitada en las 185 pruebas del portal y en las 46 del API.
- **Aislamiento de tenant**: las guardas `tenant_id` de los endpoints de horarios y biométricos viajan en los blobs idénticos; la pata de tenant del horario está en las suites apuntadas.
- **Esquema**: `schema.prisma` suma 94 líneas (modelos biométricos y de vigencia) sin tocar una sola línea existente de Producción (−0), y viajan las 3 migraciones SQL correspondientes.
- **Dependencias**: el subárbol biométrico del lock es idéntico versión e integridad (4/4), la raíz del lock no pierde ni cambia una entrada y `apps/api/package.json` solo suma 4. Cero bajas, medido en `equivalencia-lock-biometrico.json`.
- **Funciones ajenas**: cero rutas de otros módulos entran por su propio pie; las 4 rutas compartidas son aditivas. Cero borrados en todo el inventario.

## 6. Qué queda pendiente de esta certificación

Este documento certifica el **candidato** (árbol + suites + compuertas). Lo que Produce sirve todavía es `91d43c79`, y se mide aparte una vez el merge y el despliegue ocurran:

1. Aplicar las **3 migraciones** en Producción por el pooler (solo lectura antes, `migrate status` después): `20261121230000_hr_shared_devices`, `20261122060000_hr_face_enrollments`, `20261122120000_hr_webauthn_credentials`.
2. Redeploy de `apexos-api-prod` y `apexos-web-prod` y verificación **por artefacto servido** (`/health.commit` y censo de chunks del portal), no por lo que dice el PR.
3. Re-medición de rechazos de foto en Producción con ventana completa (`hr-marking-blocked-workers --days=7`) para que el «cero rechazos» tenga denominador.
4. La marcación por web **no se retira** de Producción en este viaje; la compuerta alterna quedó retirada en el frente del 24-11 y su retiro alterno sigue siendo decisión del dueño.

Los puntos 1, 2 y 3 se cierran medidos en la §8. El punto 4 sigue siendo decisión del dueño, y la pregunta que abrió la §6 («¿faltan funciones?») se respondió con la §9: faltaban dos pantallas.

## 7. Rollback

Revert controlado del commit de promoción sobre `main` (sin reescribir historia compartida) y redeploy de los dos servicios. Las 3 migraciones no se revierten en caliente: si hace falta volver, el código anterior no lee las tablas nuevas, así que el retroceso es seguro aunque las tablas queden creadas. No hay borrado de datos ni escritura de registros de cliente en la promoción.

## 8. Aterrizaje en Producción: lo que se midió después del merge (pendientes 1-3 de la §6)

Cerrado el 2026-11-28. Todo lo de esta sección es lectura sobre el ambiente, con el instrumento corriendo desde el árbol desplegado y **0 escrituras** declaradas en el propio artefacto.

- **Aterrizaje**: el candidato `a09ad8f6` entró por PR #120 y la punta de `main` quedó en `b2012af2bc04b316b3808c238583548aaaee1ea3`. Igualdad de árboles probada: `git diff --name-only candidato..origin/main` = **0 archivos**. El despliegue es automático (Railway construye desde fuente); no hizo falta redeploy manual.
- **Binario servido** (`api-servido-produccion.json`): `/health` responde `commit: b2012af2bc04`, `status: OK`, **19 módulos**. Censo de endpoints por respuesta: `GET /api/v1/hr/shared-devices`, `GET /api/v1/hr/face-enrollments`, `GET /api/v1/hr/self/face-enrollment`, `GET /api/v1/hr/self/webauthn` y los dos `registration-challenge` devuelven **401** (ruta construida que exige sesión); `POST /api/v1/hr/self/time-punches` devuelve **400** (marcación web sigue registrada y valida el cuerpo); el control `/api/v1/hr/no-existe-zz` devuelve **404**. Veredicto versionado: `ENDPOINTS_BIOMETRICOS_SERVIDOS_Y_MARCACION_WEB_SIGUE_REGISTRADA`. La marcación por web **no se tocó**, como ordenó el dueño.
- **Migraciones** (`ledger-produccion-antes.json` / `-despues.json` / `-comparacion.json`, pooler de sesión, solo SELECT): migraciones aplicadas **72 → 75**, tablas base **235 → 238**. `hr_shared_devices`, `hr_face_enrollments` y `hr_webauthn_credentials` pasan de `existe: false` a `existe: true`. Las tablas protegidas no se movieron: `TimePunch`, `Employee`, `Tenant`, `TimeRoute` con el mismo `max(id)`, y `employees` **101 filas → 101**, `platform_settings` **1 → 1**, `platform_admins` **2 → 2** con el mismo sello de `updated_at` en lectura antes y después. `sellos_movidos: []`. Veredicto: `ADITIVO:SIN_ESCRITURA_EN_PROTEGIDAS`.
- **Rechazos de foto con denominador** (`marcaciones-produccion-dias7.json`, ventana leída de **7 días**, corte en el primer instante en que se leyó el binario nuevo sirviendo): **35 rechazos de foto sobre 198 marcaciones aceptadas antes** del corte (**17,7 %**) y **8 sobre 230 después (3,5 %)**. Los 8 son todos la misma clase (`400 — "El contenido del archivo no coincide con el formato declarado."`) y concentran en el trabajador `user_id 231 / empleado 503`. La compuerta alterna que generaba `SELFIE_REQUERIDA` pasó de 26 a 0 en el frente del 24-11 y no revivió.
- **Lo que NO arregla este viaje**: del total de **2146** rechazos leídos en la semana, **2014** ocurrencias son `error/frontend` con causa cruda de transporte (`Load failed` 1097, "La plataforma no respondió a tiempo" 591, `Failed to fetch` 260). Eso es el frente de envíos perdidos del cliente, declarado fuera de este portón y con su propio dueño.

## 9. Ronda 2: las dos pantallas biométricas que no viajaron en la ronda 1

El dueño preguntó si faltaban funciones en Producción. **Sí faltaban dos**, y la pregunta fue legítima: la paridad se estaba midiendo por delta modificado y no por existencia de rutas.

- **Medición ANTES** (`paridad-tres-ramas-antes.json`): núcleo de Talento Humano, 65 rutas por blob → **63 idénticas** contra `origin/desarrollo` y **63** contra `origin/develop`, con **0 rutas distintas** y **2 ausentes**: `apps/web/app/dashboard/talento-humano/rostros/page.tsx` y `apps/web/app/dashboard/talento-humano/dispositivos-marcacion/page.tsx`. El hub las enlaza desde `apps/web/app/dashboard/talento-humano/page.tsx:11-12`, así que el usuario ve dos tarjetas que llevan a un 404.
- **Sonda servida ANTES** (`rutas-nuevas-servidas-antes.json`): hub **200**, `/dashboard/talento-humano/rostros` **404**, `/dashboard/talento-humano/dispositivos-marcacion` **404** sobre `b2012af2bc04`.
- **Candidato de la ronda 2**: 19 rutas (2 de producto + 17 documentales), transporte `replay_puntual` **sin waivers** contra la base `b2012af2`. Invariantes del replay **36/36** (`invariantes-replay-pantallas.json`), control de mutación **6 de 6 derivas rojas** (`controls/selftest-instrumento-pantallas.json`: el replay limpio sale 5/5 verde y cada deriva inyectada deja su caso rojo, `rotos: 1`), equivalencia por blob en `equivalencia-blob-pantallas.json`.
- **Regresión y build**: suite del portal `hr-*.test.mjs` **185/185** y `next build` **salida 0** con 154 rutas en el manifiesto, con las dos pantallas **prerenderizadas** (`○` estático y su `.html` generado) — evidencia en `suites-candidato-pantallas.txt`. Declaración explícita: **ninguna prueba del portal cubre esas dos rutas** (buscar `rostros` o `dispositivos-marcacion` en `apps/web/test/*.mjs` devuelve vacío), así que el 185/185 certifica que no se dañó lo demás; la existencia de la pantalla la certifica el build y el artefacto servido. `apps/api/**` no aparece en el delta de esta ronda, por eso las 46 pruebas apuntadas del API no se re-corren: van sobre el mismo árbol de backend de la ronda 1.
- **Rutas compartidas que quedan distintas a propósito** (mismo instrumento): `apps/web/lib/api.ts` (la fusión a tres vías de la compuerta de escrituras, certificada en la ronda 1) y tres rutas del frente de telemetría/monitor (`moduleAccess.ts`, `moduleFunctions.ts`, `modules.ts`) que solo viven en `desarrollo`. Además `apps/web/lib/installationIdentity.ts` está en `develop` y no en `main`: medido con `git grep installationIdentity origin/main -- apps/web` **nadie la importa en Producción**, así que no es una pantalla rota sino el frente del enlace de la app administrable, que no está promovido. Lo decide el dueño, no este portón.
- **Rollback de la ronda 2**: revert del commit de promoción sobre `main` y redeploy. No hay migración nueva (las 3 biométricas ya están aplicadas y las pantallas solo leen esas tablas), así que el retroceso devuelve el árbol sin tocar un solo registro.
