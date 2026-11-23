# Certificación de la pata a Producción: la escalera de marcación con corrección administrativa motivada

- change_id: `hr-marca-ladder-main-20261123`
- origen: `desarrollo` 4776b8fd, certificado en la pata a develop como `c777dc13` (PR #109, fusionado en `origin/develop` 43e5510c a las 2026-11-23T15:28:33Z)
- candidato: rama auxiliar `codex/qa-hr-marking-ladder-main-20261123` sobre `origin/main` a0fb7e05. El commit funcional es el padre del commit de gobernanza que trae los dos manifiestos; su sha exacto lo declara `docs/qa/manifests/hr-marca-ladder-main-20261123-scope.json` en `certified_commit`.
- baseline movido: main avanzo de 7de02a3b a a0fb7e05 mientras se armaba el candidato; los dos commits extra son documentacion de la pata de autenticacion y el diff 7de02a3b..a0fb7e05 no toca ninguna ruta de `apps/`. El candidato se reconstruyo sobre el tip actual y ese documento ajeno queda intacto.
- destino: `main` (Producción)
- ambiente donde se midió: QA desplegado, con el defecto visto además en Producción por sonda de solo lectura

## Qué se promociona y por qué no puede esperarse

El operario que marca en desorden recibe 409 `MARCACION_FUERA_DE_SECUENCIA`: el servidor dice cuál es la siguiente marcación permitida y no escribe nada. Cuando faltan las dos piernas del almuerzo, la salida del día queda bloqueada y el trabajador pierde la jornada. La escalera (`resolvePunchLadder`) abre una excepción angosta: el canal administrativo puede saltar el orden si la petición trae `correccion_administrativa: true` y un `motivo_correccion` de hasta 300 caracteres; sin motivo responde 422 `MOTIVO_CORRECCION_REQUERIDO`, el salto queda escrito en la novedad `AJUSTE_MANUAL_MARCACION` con `metadata.detail = escalera:<salto>` y el canal propio (`/hr/self/time-punches`) sigue sin conocer la excepción.

Ese código **no existe en Producción**: en el blob de `apps/api/src/modules/hr/service.js` que sirve `origin/main` a0fb7e05, `resolvePunchLadder` aparece 0 veces y `MOTIVO_CORRECCION_REQUERIDO` 0 veces; en el blob de `origin/develop` aparecen 3 y 1. Por eso las seis salidas bloqueadas del 21 y del 22 de noviembre (manifiesto `rescate-pendientes-produccion-20261123.json`) están declaradas con `destrabe: "promocionar resolvePunchLadder ... de desarrollo a main"` y no pueden escribirse antes de este paso.

## ANTES medido en Producción (el ambiente que recibe la promoción)

Sonda de solo lectura, mismo blob del instrumento en las cuatro ramas (`scripts/certifications/hr-marking-blocked-workers.js` = `f276972ce0d1` en `origin/main`, `origin/develop`, `origin/desarrollo` y el candidato):

```
node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env \
  --date=2026-11-23 --secuencia --focus=MARCACION_FUERA_DE_SECUENCIA --sin-nombres \
  --output=docs/qa/evidence/hr-marca-ladder-main-20261123/antes-produccion-20261123.json
```

Resultado (2026-11-23T15:51Z, `escrituras: 0`, artefacto sin nombres). Identidad servida verificada despues: `GET /health` de Produccion responde commit `a0fb7e05b65d`, o sea el mismo tip que recibe esta promocion, y en su blob `apps/api/src/modules/hr/service.js` `resolvePunchLadder` aparece 0 veces:

- 21 rechazos `MARCACION_FUERA_DE_SECUENCIA` en la ventana: 15 por `/api/v1/hr/self/time-punches` y 6 por `/api/v1/hr/time-punches`. El mensaje servido es "La siguiente marcacion permitida es inicio_almuerzo."
- 20 jornadas empezadas y nunca cerradas; los mismos empleados del manifiesto de pendientes (479, 503, 515, 495, 547, 527, 507) con `[entrada]` y faltantes de almuerzo y salida.
- 0 días partidos en varias rutas sobre 46 marcaciones leídas: la causa medida hoy no es la fragmentación de ruta (`route_id` nulo no fragmenta), es el orden de la escalera sin excepción administrativa.

## DESPUÉS medido en QA sobre el binario desplegado

Instrumento versionado `scripts/certifications/hr-marking-ladder-field.js`, sha256 `32efc82762d82c1d2d054915c2d0c72e2a3e0c1104a17d2a801a5826ab19d49e` (el mismo archivo que viaja en el candidato, verificado con `sha256sum`).

```
node scripts/certifications/hr-marking-ladder-field.js --env-file=config/qa.env \
  --espera=arreglo --fix-commit=c777dc13528f6e8cd502d83effd68325a92f6486 \
  --output=docs/qa/evidence/hr-marca-ladder-main-20261123/campo-qa.json
```

**APROBADO 16/16** contra `apexos-api-qa-production.up.railway.app` con `GET /health` anclando el commit servido `43e5510cfe2d` y `git merge-base --is-ancestor c777dc13 43e5510c...` resuelto en `arreglo`:

| control | qué afirma |
|---|---|
| `health_ancla_el_commit_servido` | la corrida no puede atribuirse a otro árbol |
| `sesion_efimera_en_la_empresa_modelo` / `..._en_tenant_vecino` | dos identidades creadas por el propio arnés, una por empresa |
| `empleado_efimero_sin_jornada` | el día arranca vacío y legible (200, 9 filas del resto) |
| `entrada_administrativa_abre_la_jornada` | 200 y la pierna asentada leída por clave de idempotencia |
| `rechazo_de_escalera_es_legible` | 409 con `details.expected_type = inicio_almuerzo` y `details.punch_type = salida` |
| `correccion_sin_motivo_se_niega` | 422 `MOTIVO_CORRECCION_REQUERIDO` con `details.field = motivo_correccion` |
| `correccion_motivada_destraba_la_jornada` | 200 y el día pasa a `[entrada, salida]` |
| `la_correccion_deja_novedad_auditable` | 1 novedad con `escalera:esperada:inicio_almuerzo` |
| `jornada_cerrada_sigue_bloqueada` | 409 `JORNADA_COMPLETA`: la excepción no reabre un día cerrado |
| `otro_tenant_no_escribe_la_jornada` | 404 `EMPLEADO_NO_ENCONTRADO` y el día ajeno intacto antes/después |
| `dia_sin_datos_responde_200` / `toda_escritura_dentro_del_presupuesto` | 200 con 0 filas; peor escritura 878 ms sobre presupuesto de 20.000 ms |
| `canal_propio_no_forja_la_correccion` | la bandera en `/hr/self/time-punches` no destraba: mismo 409 con y sin bandera, pierna no asentada |
| `el_canal_propio_sigue_vivo_para_el_mismo_operario` | el operario sigue pudiendo marcar lo suyo |
| `cuentas_efimeras_retiradas_por_el_endpoint` | las tres cuentas retiradas por `PATCH /admin/users/:id/status`, 200 y login 401 después |

Autodefinición del arnés: `--selftest` corre 15 casos y tres de ellos son rojos obligatorios (rechazo mudo, clave de idempotencia ajena, ancla que contradice). La compuerta de ambiente solo acepta `config/qa.env` o `config/production.env`, cruzando `TARGET_ENV` con el archivo y el `EXPECTED_SUPABASE_PROJECT_REF` contra `DATABASE_URL`.

## Pruebas sobre el arbol del candidato

Corridas dentro de la worktree auxiliar (sin copiar ni enlazar `node_modules`: solo `NODE_PATH` hacia los modulos del arbol principal):

- `foco-candidato.txt`: 76/76 en los cinco archivos que prueban esta correccion (`hr-administrative-punch-correction`, `hr-evidence-resilience`, `hr-mobile-identity`, `platform-log-rejection-detail`, `telemetry-client-logs-public`).
- `regresion-candidato.txt`: 74/74 en el vecindario del arbol tocado (marcacion diferida, concurrencia, empleado declarado, kilometraje, RBAC de marcacion, evidencia movil, estado de cuenta de administrador, endurecimiento de sesion, observacion y revocacion de autorizacion, propagacion de contexto de tenant y RBAC de modulos).
- Se dejo fuera `authorization-status-codes`, que necesita Redis y el puesto no lo tiene levantado. No se conto su rojo como resultado del candidato.

## Puente entre lo medido en QA y lo que va a servir main

`equivalencia-desarrollo-main.txt` no compara archivos: extrae la región de la escalera de cada árbol y compara hash de región. Diez regiones, **0 distintas**, sobre `origin/develop` 43e5510cfe2d (lo que QA sirvió en la medición) frente al candidato:

- `resolvePunchLadder` (17 líneas) idéntico; `createPunch` (461 líneas) idéntico; las 14 líneas de escalera del archivo idénticas.
- `schema.js` (2 líneas de la excepción), `policy.js` (7 líneas del permiso), `mobile-identity.js`, `fileSignature.js`, `platformLogs.js`, `public-routes.js`, `server.js`: idénticos de blob.

`schema.js` y `service.js` **sí** difieren como archivo completo (273/299 líneas en `service.js`), pero el diff es de nómina, liquidación, contratos y ajustes de retiro que `develop` tiene y `main` no: ninguna línea de la escalera aparece en ese diff, y la extracción por región lo cierra con hash igual.

Única diferencia de entorno declarada: `apps/api/src/modules/hr/webPunchSelfie.js` vive solo en `origin/develop` (commit 2766b9a3, de otra intervención) y no está en `origin/main` ni en el candidato. Es la puerta que exige selfie en la marcación propia. En la pierna del canal propio la foto viaja puesta en los dos intentos, así que lo medido en QA es 409 `MARCACION_FUERA_DE_SECUENCIA` y no 400 `SELFIE_REQUERIDA`: el resultado certificado no depende de esa puerta y el candidato lo repite.

## DESPUÉS en Producción, sobre el binario promocionado

Promovido el candidato, `GET /health` de Producción pasó a servir `790870a0e439` (merge `790870a0`, padres `a0fb7e05` + punta de la rama auxiliar). Con ese binario servido:

- `campo-despues-produccion.json`: **16/16**, anclado por `health_ancla_el_commit_servido` con `--espera=arreglo`. Rechazo legible 409 con `details.expected_type`, 422 `MOTIVO_CORRECCION_REQUERIDO` sin motivo, destrabe motivado 200 con novedad `escalera:esperada:inicio_almuerzo`, jornada cerrada sigue 409 `JORNADA_COMPLETA`, canal propio no conoce la bandera, tenant vecino 404, peor escritura 3.257 ms sobre presupuesto de 20.000 ms.
- Las seis salidas del 21 y del 22 dejaron de tropezar con la escalera: el mismo payload que el 2026-11-23 por la mañana respondía `409 MARCACION_FUERA_DE_SECUENCIA` ahora responde **`400 KILOMETRAJE_REQUERIDO`** (`rescate-escalera-ejecucion-produccion-20261123.json`, con su ANTES y su DESPUÉS en `rescate-escalera-antes-produccion-20261123.json` y `rescate-escalera-verificacion-produccion-20261123.json`). La compuerta que esta promoción traía a Producción está pasada con dato real de cliente; lo que queda delante es otra regla de negocio.
- El odómetro no se inventó: `Vehicle.mileage` está en 0 para las cuatro placas, `RoutePreoperationalChecklist` tiene columna `mileage_initial` pero cero filas para esas placas en la ventana del 18 al 24, y `TransportTripEvent`, `Event` y `RouteBlockEvent` están en 0 filas. Ninguna fuente del sistema permite derivar el kilometraje del 21 y del 22, y escribirlo a mano contaminaría combustible y PYG. Las seis jornadas siguen abiertas con dueño: operación.
- Dos trampas que la corrida dejó medidas y corregidas en el andamio: el andamio creaba su cuenta con el run en mayúsculas y `/auth/login` normaliza el correo a minúsculas (`apps/api/src/modules/auth/service.js:125`), así que la cuenta no podía iniciar sesión ni retirarse por el endpoint; y el andamio creaba el administrador en la empresa modelo NYVORA cuando las seis jornadas son de IMPORTADORA SCJ SAS, lo que produce 404 `EMPLEADO_NO_ENCONTRADO` en lugar de escribir (`rescate-escalera-intento-tenant-erroneo-20261123.json`). El tenant ahora sale del propio manifiesto.
- Cuentas de esta pata: 250/251/252 (medición), 255 (intento con tenant equivocado) y 256 (andamio del rescate) retiradas **por el endpoint** con `login_tras_retiro` 401; la 253, colgada por el bug de mayúsculas, se normalizó y se retiró igual por el endpoint; la 254, sonda de ese 401, nunca obtuvo sesión y se apagó por escritura directa quedando declarada en `rescate-escalera-sesion-produccion-20261123.json`. En la re-medición del párrafo siguiente entraron 257/258/259, retiradas también por el endpoint con 401. Cero escrituras de marcación por debajo del API.
- Main avanzó mientras se publicaba esta contabilidad: otra pierna promovió `80681aa1` (mallas con maestro único y marcaciones sincronizadas) tomando `790870a0` como ancestro, así que Producción dejó de servir el commit de esta promoción y pasó a servir `80681aa1d998`. No se tocó historia ajena. Como el `DESPUÉS` queda anclado al binario servido, se volvió a medir sobre el nuevo: `campo-despues-produccion-sobre-80681aa1.json` cierra **16/16** con `health_ancla_el_commit_servido = 80681aa1d998`, mismo 409 legible con `details.expected_type = inicio_almuerzo`, mismo 422 sin motivo, destrabe motivado 200 con su novedad, jornada cerrada sigue 409 `JORNADA_COMPLETA`, canal propio sigue sin conocer la bandera, tenant vecino 404 y peor escritura 3.453 ms. En el blob de `origin/main`, `resolvePunchLadder` aparece en 3 líneas y `MOTIVO_CORRECCION_REQUERIDO` en 1: la escalera sigue viva sobre el binario que corre hoy.

## Qué queda declarado y no corregido aquí

1. `hallazgo_autorizacion`: en la empresa modelo, el rol genérico "Empleado" trae `hr:write`, que es el permiso del canal administrativo donde vive la excepción. El control lo mide y lo deja escrito (`status` 200, `pierna_asentada` false), pero **no cambia conducta**: acotar la excepción a rol administrativo (precedente `BIOMETRIA_RESTABLECER_DENEGADO`) o aceptar que `hr:write` la conserve es decisión del dueño y lleva su propio brief.
2. Residuo de cuentas de medición: las cuentas 805/806/807 de la corrida verde y la 809 del retiro quedaron inactivas por el endpoint (`login_tras_retiro` 401). La 804, rezago de la corrida 2, quedó retirada igual por el endpoint. **La 801 no pudo retirarse**: pertenece al tenant "QA Empresa A RLS", que tiene 0 módulos licenciados, así que el propio `PATCH /admin/users/:id/status` responde 403 `MODULO_NO_HABILITADO`. Se deja activa y declarada (`retiro-remanentes.json`): no puede abrir pantalla administrativa alguna en ese tenant y retirar-la por UPDATE está prohibido por la regla de gobernanza.
3. Las seis salidas del 21 y del 22 quedaron destrabadas de secuencia y trabadas de odómetro: se escriben cuando operación entregue la lectura física por conductor, con `hr-marking-rescue-apply.js` llevando `payload.kilometraje_dia` real. No se inventa ni la hora ni el kilometraje.
4. Las **seis** salidas del 23 de noviembre que el rescate descartó por hora futura (emps 503, 491, 483, 547, 531 a las 14:00 CO y 495 a las 13:00 CO; la estimación «≈17:30 CO» que esta certificación traía publicaba el reloj del puesto, no el de Colombia) **no se pueden pre-escribir por el canal administrativo**: las seis rutas llevan placa —`service.js:2915-2917` exige `kilometraje_dia` en toda salida con vehículo asignado— y el sistema no guarda esa lectura en ninguna parte: `Vehicle.mileage` en 0 para los seis vehículos, 0 filas de `RoutePreoperationalChecklist` con `mileage_initial` entre el 18 y el 24, 0 `TransportTripEvent` y 0 `RouteBlockEvent` (`odometro-hoy-seis-salidas-20261123.json`). Lo que sí cierra la pregunta es lo que el mismo día dejó medido: a las 10:18 CO entró una salida de ruta con placa por `apexos-mobile` con su `metadata.kilometraje_dia` y **sin** bandera administrativa, porque la pantalla del operario exige y manda ese campo (`apps/web/app/dashboard/talento-humano/marcacion/page.tsx:1263-1268` y `:1317`). Las seis cierran solas a su hora con la lectura física del conductor; si alguna no cierra, `hr-marking-rescue-apply.js` la recoge llevando el odómetro que entregue operación. Dueño: operación.

## Cómo se reproduce

```
node scripts/certifications/hr-marking-ladder-field.js --selftest
node scripts/certifications/hr-marking-ladder-field.js --env-file=config/qa.env --espera=arreglo \
  --fix-commit=c777dc13528f6e8cd502d83effd68325a92f6486 \
  --output=docs/qa/evidence/hr-marca-ladder-main-20261123/campo-qa.json
node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env \
  --date=<dia> --secuencia --focus=MARCACION_FUERA_DE_SECUENCIA --sin-nombres --output=<ruta>
```
