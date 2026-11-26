# Veredicto de la semana de marcaciones en Producción (medido 2026-11-26)

## 1. Qué pidió el dueño y qué se corrió

Orden literal: *«realiza un diagnostico y analisis de las marcaciones que se han realizado durante esta semana luego de las correciones realizadas e identifica tecnicamente las maraciones y su comportamiento necesito que me des un dictamen y un resumen final donde me indiques ppor ejemlo durante la semana del dia tal al dia tal, las marcacioens no tuvieron ningun inconveniente ni rechazos tecnicamente hablando en idioma natural para poder entenderte el mensaje esta validacion va de cara solo al ambiente 'main' produccion.»*

- **Ambiente:** SOLO Producción (`main`). Nada de QA en este documento.
- **Qué corría:** `origin/main = e3c2ad17…`, `/health` sirviendo `e3c2ad171946`, **cero commits nuevos** en `main` desde la promoción del 2026-11-24.
- **Comando exacto:** `node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --days=7 --semana=2026-11-24T21:55:07Z --sin-nombres --output=docs/qa/evidence/hr-marcaciones-semana-20261126/produccion-semana-corte-20261126.json`
- **Escrituras: 0.** Solo `SELECT`; ninguna batería hostil contra Producción.
- **Ventana:** `2026-11-20T05:00Z → 2026-11-27T05:00Z` = los días de Colombia del **viernes 20 al jueves 26 de noviembre de 2026**. Lectura `leido_en: 2026-11-26T14:1xZ`.
- **Corte ANTES/DESPUÉS:** `2026-11-24T21:55:07Z`, la primera lectura de `/health` que confirmó el binario nuevo sirviendo. Su proveniencia está versionada en `docs/qa/evidence/web-photo-battery-20261124/contabilidad-post-push.json` (`lectura_1.hora_utc`). No es la hora del commit y no es la hora de Colombia (allí eran las 16:55).

## 2. Dictamen en una línea

**No: la semana NO tuvo cero rechazos.** En clase foto hubo **43 rechazos**, **38 antes** del arreglo y **5 después**. La puerta que retiramos sí se apagó: **26 rechazos con código propio (`SELFIE_INVALIDA` 24 + `SELFIE_REQUERIDA` 2) pasaron a 0**. Los 5 que quedan no son esa puerta: salen de otra validación que sigue viva, y **los cinco son del mismo trabajador** y en **los cinco perdió la pierna de la jornada** (cero marcas aceptados en la hora siguiente).

## 3. La semana, día por día

| Día (Colombia) | Aceptadas | Rechazos de foto | De ellos antes / después del arreglo | Envíos perdidos | Trabajadores |
|---|---:|---:|---|---:|---:|
| viernes 20 | 69 | 3 | 3 / 0 | 223 | 19 |
| sábado 21 | 62 | 4 | 4 / 0 | 202 | 18 |
| domingo 22 | 42 | 4 | 4 / 0 | 195 | 13 |
| lunes 23 | 58 | 20 | 20 / 0 | 219 | 20 |
| martes 24 (arreglo 4:55 p.m.) | 58 | 8 | 7 / 1 | 261 | 18 |
| miércoles 25 | 74 | 1 | 0 / 1 | 318 | 19 |
| jueves 26 (a las 9:11 a.m.) | 16 | 3 | 0 / 3 | 70 | 16 |
| **Total** | **379** | **43** | **38 / 5** | **1488** | — |

- **Identidad de la puerta por código** (esto es lo que hace leerable el número): antes del arreglo `400 SELFIE_INVALIDA` **24**, `400 (sin código)` **12**, `400 SELFIE_REQUERIDA` **2**; después, **solo** `400 (sin código)` **5**. La compuerta de la selfie ya no aparece.
- Denominador real: **267** marcaciones aceptadas antes del corte y **112** después → tasa de rechazo de foto **1,6 % → 0,4 %**. Bajó, no llegó a cero.
- **1488 envíos perdidos** (`Load failed` 754, `La plataforma no respondio a tiempo` 519, `Failed to fetch` 215) **no son rechazos del servidor**: la petición del celular nunca llegó, por eso no traen código ni ruta. Afectan a 23 cuentas con sesión y a 284 intentos sin sesión, en 34 dispositivos distintos. Esto es un frente de disponibilidad, aparte del de la foto.
- **El muro de «horario fuera del día» que sí estaba roto en septiembre está limpio: 0 rechazos en la semana** — las 379 marcas aceptadas caen todas dentro del día Colombia correcto (`frontera_de_dia`).

## 4. Los 5 rechazos que quedan: uno solo, cinco veces

| Hora Colombia | Cuenta | Empleado | Dispositivo | Reintento en la hora siguiente |
|---|---:|---:|---|---|
| martes 24, 20:32 | 231 | 503 | Android / Chrome 158 | **0 marcas** |
| miércoles 25, 20:21 | 231 | 503 | Android / Chrome 158 | **0 marcas** |
| jueves 26, 08:52 | 231 | 503 | Android / Chrome 158 | **0 marcas** |
| jueves 26, 08:53 | 231 | 503 | Android / Chrome 158 | **0 marcas** |
| jueves 26, 08:53 | 231 | 503 | Android / Chrome 158 | **0 marcas** |

Misma cuenta, mismo teléfono, misma ruta `/api/v1/hr/self/time-punches`, misma frase *«El contenido del archivo no coincide con el formato declarado»*, y en los cinco **sin código** — firma de que no sale de la compuerta de la selfie. Este señor sale en **5 de las 7** jornadas con cierre incompleto; en dos de ellas (jueves 20 y miércoles 25) lo que falta es exactamente la **salida**, y el 25 es uno de los dos únicos empleados de toda la semana con la salida perdida (el otro es el empleado 483). Y en **dos** jornadas — martes 24 y hoy jueves 26 — quedó **sin ninguna marcación registrada** pese a los intentos (`jornadas_sin_registro`: 135 rechazos acumulados en cada una, con `MARCACION_FUERA_DE_SECUENCIA` incluido).

## 5. Causa raíz — y una corrección a lo que dije ayer

**Me equivoqué en el informe de ayer y lo declaro aquí.** Ayer señalé como puerta residual el respaldo de evidencias (`preparePunchEvidence`, `apps/api/src/modules/hr/evidenceStorage.js:124`). **Ese código no corre en Producción**: su guard `writeEnabled()` (`evidenceStorage.js:15`) pide `HR_EVIDENCE_STORAGE_ENABLED=true`, y `grep -rIn HR_EVIDENCE_STORAGE_ENABLED infra config` devuelve **0** coincidencias — la bandera no está declarada en ningún archivo de ambiente del repo. Queda descartada.

Lo que sostiene la explicación hoy, medido sobre el binario servido (`e3c2ad171946`):

- La frase **solo** la producen dos validaciones: `apps/api/src/security/policy.js:171` (estricta, sin clase de contenido) y `:239` (antigua). `git grep -c "El contenido del archivo no coincide" e3c2ad17 -- apps` = **2**, ninguna otra.
- La selfie ya no puede producirla: en la ruta del celular/web la foto pasa por `apps/api/src/modules/hr/mobile-identity.js` (`inspectSelfiePayload` fija `contentClass: "image"`, `acceptsDeclaredImageClass` acepta cualquier imagen real) y, si no calza, **degrada** en vez de rechazar. Esa es la puerta que apagamos, y el conteo por código lo confirma (26 → 0).
- Lo que sí puede rechazar en esa ruta es la **otra** foto del flujo: la de justificación/soporte de un cierre tardío, que se valida con `assertSafeFile` en `apps/api/src/modules/hr/service.js:2955` y lanza un error pelado → 400 **sin código y sin detalle**, exactamente la firma de los 5 residuales.
- **Límite honesto:** el servidor no manda el detalle (`detalle: null` en los 5), así que desde Producción **no se puede afirmar si fue formato o tamaño**. La pista de tamaño sí está medida, en la batería hostil de QA: las selfies rechazadas pesaban del orden de **15 KB**, muy por debajo del tope. La prueba que cierra la cadena es reproducir en QA un cierre tardío con una foto de soporte mal declarada y exigir que se guarde.

**Cómo se cierra (abierto, con dueño):** esa validación de soporte debe **degradar en vez de rechazar** —guardar la marcación y dejar la fila como no verificada, como ya hicimos con la selfie— y el 400 debe devolver **código y detalle** (bytes declarados vs. olidos) para que el triage clasifique sin leer frases. Responsables: `apexos-backend` + `apexos-seguridad` + `apexos-qa`.

## 6. Lo demás que se perdió esa semana, para que no se confunda con la foto

| Causa | Rechazos en la semana |
|---|---:|
| Envío perdido (no llegó al servidor) | 1488 |
| Cliente no clasifica (respuesta sin código legible) | 76 |
| Foto (todas las subclases) | 43 |
| Secuencia de la jornada | 52 |
| Kilometraje | 23 |
| Marcación diferida > 24 h | 17 |
| Otros | 11 |
| Permiso horario | 10 |
| Llave repetida | 5 |
| Justificación pendiente | 4 |
| Jornada completa | 2 |
| **Total** | **1731** |

Además, en la semana: **83 jornadas sin ningún registro aceptado** y **43 jornadas con cierre incompleto** (les falta al menos un tipo de marcación; la mayoría la salida).

## 7. Qué falta para poder decir «cero rechazos» con evidencia

1. Repetir la medida el **27 de noviembre** para tener ≥48 horas después del corte (hoy hay ~41) y que el denominador no se lea en 112 sino sobre un día completo.
2. Cegar la puerta del soporte: prueba que intente un cierre tardío con foto mal declarada y **exija que se guarde**, no que se rechace.
3. Que el 400 devuelva código y detalle para clasificar sin adivinar por la frase.
4. Reintentos diferidos para los 1488 envíos perdidos (regla 115: recargar la página no es estrategia de reintento).
5. Frente separado para las otras 160 salidas técnicas (secuencia, kilometraje, diferidas, permiso horario, llave, justificación).
6. Contactar al trabajador de la cuenta **231 / empleado 503**: cinco intentos perdidos en tres días, todos en la misma pantalla.

## 8. Lo que NO se hizo y un error propio descubierto a tiempo

- Cero escrituras contra Producción, cero `POST`/`PATCH`/`DELETE`, cero batería hostil, cero cambio de variables de entorno, cero promoción de ramas.
- **Error descubierto durante esta escritura:** una de las corridas intermedias se fue sin `--days=7`, así que leyó solo tres días y devolvió «7 rechazos antes / 5 después con denominador 36». Si publico esa cifra, el dictamen habría dicho que el arreglo no hizo nada. El instrumento ahora **se bloquea** si `--semana` recibe una ventana menor a 7 días (`validarVentanaDeSemana`, dos controles nuevos en el selftest, y la mutación real —`dias >= -1`, o sea el guard nunca dispara— dejó el arnés en **`SELFTEST BLOQUEADO`** con salida 1). El selftest completo quedó en **38 controles** verdes.
- **Privacy:** este directorio no lleva nombres. El listado por consola de jornadas sí los imprime (es el diseño del instrumento: la consola es para el operador), y por eso **no** se versiona; el artefacto se generó con `--sin-nombres`.
- **Secretos:** `config/production.env` no se copia. Se cuentan **48** variables por nombre y el host del pooler tampoco se versiona.
