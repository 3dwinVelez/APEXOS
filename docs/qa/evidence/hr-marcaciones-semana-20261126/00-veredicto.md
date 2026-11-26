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

## 9. ¿Es la herramienta el inconveniente? (medido el 2026-11-26, segunda orden del dueño)

Orden literal: *«lo que quiero descartar es que la herramienta sea el inconveniente teniendo en cuenta que ya volcamos toda la operacion hacia la web donde realizan todas las marcaciones para homologar la unica fuente de captura de informacion»*

- **Comando:** `node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --days=7 --date=2026-11-26 --semana=2026-11-24T21:55:07Z --canal --sin-nombres --output=docs/qa/evidence/hr-marcaciones-semana-20261126/produccion-canales-corte-20261126.json`
- **Escrituras: 0.** Tres `SELECT` agregados; el instrumento se niega a correr si alguno proyecta el cuerpo de la foto (`guardas_de_lectura`, regla 58).

**De dónde salen las 379 marcaciones aceptadas de la semana** (`TimePunch.metadata->>'source'`):

| Canal | Marcaciones | % | Trabajadores | Con foto |
|---|---:|---:|---:|---:|
| `apexos-mobile` (la web que marca) | 330 | 87,1 % | 39 | 70 |
| `apexos-movil` (la MISMA web, sello del servidor en el celular del camión) | 24 | 6,3 % | 2 | 6 |
| sin sello de canal | 22 | 5,8 % | 13 | 0 |
| `qa-independent-client-certification` (arnés de certificación) | 3 | 0,8 % | 1 | 0 |
| **Total** | **379** | **100 %** | — | 76 |

Suma y cuadra: los dos nombres de arriba son el mismo cliente web (`apps/web/app/dashboard/talento-humano/marcacion/page.tsx:1293` declara `apexos-mobile`; `apps/api/src/modules/hr/mobile-identity.js:52` estampa `apexos-movil`). **354 de 379 = 93,4 % son la web**, y no existe ninguna app nativa en el medio. La homologación que buscaba el dueño sí está hecha.

Las 22 sin sello ya tienen nombre (censo de NOMBRES de clave del `metadata`, nunca su valor): todas traen `supplied_user_name`, `user_email`, `employee_name`, `identity_aliases`, `display_route_id`, `route_code`, `source_route_id`, `legacy_route_id` → es la **escritura administrativa/sincronización de jornada** (`apps/api/src/modules/hr/service.js:2669-2731`), con `correccion_administrativa` en 4 de ellas y sello de identidad biométrica en 2. **Ninguna es una fuente de captura distinta de la web.** Las 3 del arnés son las filas que certificaron el retiro de la compuerta, y conviene retirarlas o etiquetarlas (dueño: `apexos-qa`).

**Respuesta a la pregunta, en tres números:**

1. **La foto no la rechaza la herramienta.** En la ventana, **18 trabajadores** adjuntaron foto de justificación y **17 de ellos lo hicieron después del arreglo**, con tipo aceptado `image/jpeg` los 17. Si la web mandara formatos que el servidor no acepta, ese grupo no existiría.
2. **El único caso residual no es un problema de cola.** La cuenta 231 / empleado 503 acumula **5 rechazos** y su patrón es **disperso**: los intentos están separados **23,8 h, 12,5 h, 25 s y 15 s**. La hipótesis de «la cola IndexedDB reenvía siempre el mismo cuerpo viejo» exigiría una ráfaga en segundos; medido, no lo es. Lo que sí es constante: ese trabajador **nunca** ha tenido una foto de justificación aceptada (0 antes, 0 después) y en la hora siguiente a cada rechazo **no entró ninguna marca**. La causa sigue siendo la puerta del soporte (§5), no el cliente.
3. **Donde la herramienta sí falla es en los envíos que nunca llegaron.** Los **1488** envíos perdidos se concentran con fuerza: **96,2 %** caen en 5 dispositivos y **964 (64,8 %)** son iOS/Safari (549 en Safari 26, 339 en Safari 27, 76 en Safari 18). **353 (23,7 %)** ocurren **sin sesión**, y el top 5 de cuentas reúne 957 (64,3 %). El `sw.js` de la web es *network-first* y **no encola `POST`** (`apps/web/public/sw.js:5`: el listener sale de una si el método no es `GET`): cuando Safari corta la petición, esa marcación no se reintenta sola. **Ese es el frente de la herramienta que hay que arreglar**, y es disponibilidad, no rechazo.

**Envío en vivo vs. cola** (para dimensionar el arreglo anterior): **377 en vivo / 2 abiertos sin señal**. La cola casi no se usa, lo que refuerza el punto 2 y debilita cualquier explicación que dependa de reenvíos antiguos.

**Conclusión:** se **descarta** que la herramienta sea el motivo de los rechazos de foto (93,4 % de las marcas ya salen de la web y 17 personas subieron su foto sin problema después del arreglo). **No se descarta** —y queda confirmado— que la herramienta es el motivo de los 1488 envíos que jamás llegaron al servidor: iOS/Safari sin reintento en segundo plano. Ambos frentes tienen dueño en §7 (los puntos 2 y 4).


## 9. ¿Es la herramienta el inconveniente? (medido el 2026-11-26, sobre la misma ventana)

Orden del dueño, literal: *«lo que quiero descartar es que la herramienta sea el inconveniente teniendo en cuenta que ya volcamos toda la operacion hacia la web donde realizan todas las marcaciones para homologar la unica fuente de captura de informacion»*

**Comando:** `node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env --expect=production --days=7 --date=2026-11-26 --semana=2026-11-24T21:55:07Z --canal --sin-nombres --output=docs/qa/evidence/hr-marcaciones-semana-20261126/produccion-canales-corte-20261126.json`. **Escrituras 0** (tres `SELECT` agregados) y lectura de las 15:00Z del 26.

**De dónde salieron las 379 marcaciones que sí entraron** (`TimePunch.metadata->>'source'`):

| Estampa | Marcaciones | % | Trabajadores | Con foto |
|---|---:|---:|---:|---:|
| `apexos-mobile` (la web que marca) | 330 | 87,1 % | 39 | 70 |
| `apexos-movil` (la MISMA web, sello del servidor en el celular del camión) | 24 | 6,3 % | 2 | 6 |
| sin sello de canal | 22 | 5,8 % | 13 | 0 |
| `qa-independent-client-certification` (arnés de certificación) | 3 | 0,8 % | 1 | 0 |
| **Total** | **379** | **100 %** | — | 76 |

**La web ya es la fuente única: 93,4 % (354 de 379)** y las dos estampas son el mismo cliente (`apps/web/app/dashboard/talento-humano/marcacion/page.tsx:1293` declara `apexos-mobile`; el servidor estampa `apexos-movil` en `apps/api/src/modules/hr/mobile-identity.js:52`). Las 22 sin estampa **no** son una fuente de captura misteriosa: el censo de NOMBRES de clave muestra que las 22 traen `supplied_user_name`, `user_email`, `employee_name`, `identity_aliases`, `display_route_id`, `route_code`, `source_route_id`, `legacy_route_id` —la escritura administrativa/sincronización de jornada (`apps/api/src/modules/hr/service.js:2669-2731`)—, 4 con `correccion_administrativa` y 2 con sello biométrico. Las 3 del arnés son las filas que certificaron el retiro de la compuerta, y se declaran aparte para no contarlas como operación.

**Respuesta con tres números.** (1) **La foto no la rechaza la herramienta**: 18 trabajadores adjuntaron foto de justificación en la ventana y **17 lo hicieron después del arreglo**, con tipo aceptado `image/jpeg` los 17. (2) **El caso residual no es la cola**: la cuenta 231 / empleado 503 tiene sus 5 rechazos con patrón **disperso** (brechas de 23,8 h y 12,5 h entre los primeros), y la hipótesis del reenvío de IndexedDB exigiría una ráfaga de segundos; además ese trabajador **nunca** tuvo una foto de justificación aceptada (0 antes / 0 después). (3) **Donde la herramienta sí falla es en lo que nunca llegó**: de los 1488 envíos perdidos, **964 (64,8 %) son iOS/Safari** (549 Safari 26 + 339 Safari 27 + 76 Safari 18), **96,2 %** caen en 5 dispositivos y **353 (23,7 %) ocurren sin sesión**; el servicio de red de la web solo cachea `GET` (`apps/web/public/sw.js:5`), así que un `POST` cortado no se reintenta solo.

**Veredicto de esta pregunta:** se **descarta** que la herramienta sea el motivo de los rechazos de foto (queda una puerta del servidor sin cerrar: la foto de soporte que rechaza en vez de degradar, §5). **No se descarta**, y queda confirmado, que la herramienta sea el motivo de los 1488 envíos que jamás llegaron al servidor. Los dos frentes siguen con dueño en §7 (puntos 2 y 4).

**Dato del ambiente que se corrigió a tiempo:** la primera corrida versionó el host real del pooler en el artefacto. Se movió la redacción al instrumento (`hostParaEvidencia`) con su control en el selftest —que pasó de 38 a **45 controles verdes**—, y el JSON se regeneró y volvió a escanearse (cadena de conexión, `supabase.co`, JWT, correos, IPs: limpio). En consola el operador sigue viendo el host real; en el repositorio, no.
