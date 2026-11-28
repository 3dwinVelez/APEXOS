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

## 7. Rollback

Revert controlado del commit de promoción sobre `main` (sin reescribir historia compartida) y redeploy de los dos servicios. Las 3 migraciones no se revierten en caliente: si hace falta volver, el código anterior no lee las tablas nuevas, así que el retroceso es seguro aunque las tablas queden creadas. No hay borrado de datos ni escritura de registros de cliente en la promoción.
