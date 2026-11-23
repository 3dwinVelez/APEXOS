# Paquete de Talento Humano acumulado — medición de campo en QA, 2026-11-23

## Qué se midió y por qué

El paquete de Talento Humano que `develop` acumuló (maestro de bancos y cuenta de
pago, liquidación de retiro completa con revisión de días y recibo PDF, periodo y
cierre de nómina, horarios unificados, aterrizaje por tarjetas y marcación web con
selfie en cuatro pasos) nunca se había medido contra un ambiente desplegado: existían
suites locales por paquete, pero ninguna evidencia dijera qué hace el binario que
realmente sirve una instancia. Esta corrida cierra ese hueco antes de pedir la
promoción `develop -> main`.

- Árbol medido en campo y promovido: `54cabeb34b7270df46d17b43d8096d2337b7ff7c`,
  **hijo directo** del tip vigente de `main` (`c53f857c1d996aceaf9fcda4649cbcd9ed7dccab`).
  Es la cuarta reconstrucción de este frente: las tres anteriores quedaron invalidadas
  o superadas porque el destino avanzó a mitad de la intervención, y cada una se declara
  en su sección con la causa medida.
- Forma de la promoción: replay puntual de las 49 rutas del paquete, nunca fusión de
  rama. El diff bruto `origin/main..origin/develop` tiene 1 064 rutas de frentes ajenos.
- Paridad con el binario que QA sirve hoy: **46/49 rutas blob-identicas** al árbol servido
  (`914d1721965d`, que es el tip de `develop`) y **10/10 en las diez rutas ancla** que
  gobiernan lo que se mide, estas últimas con la lista de exclusiones del arnés
  **vacia**. Las tres divergentes son podas hechas a mano y declaradas ruta por ruta en
  `equivalencia-blob-candidato.txt`: ninguna es lógica de negocio servida. Ningún verde de
  esta hoja de ruta se atribuye a un árbol distinto del que se evaluó.
- Ambiente medido: QA (`apexos-api-qa-production.up.railway.app`, Supabase
  `jbirkghkekuifgfsgquq`), empresa modelo **NYVORA** (`1d162ffd-bd27-4855-8141-b015388265fc`,
  37 módulos activos).
- Veredicto: **APROBADO — 26 piernas en verde, 0 rojas, 0 NO_APLICABLE**, anclado al commit
  servido `914d1721965d` y al candidato `54cabeb3`. La pierna número 26
  (`mallas_retiradas_por_estado`) existe porque las 25 anteriores afirmaban un retiro de horarios
  que el almacén no mostraba: se declara abajo con su medición.
- Evidencia crudo: `qa-campo-escritura.json` (corrida citable, `20261123171846`),
  `qa-campo-escritura-25piernas-165957.json` (verde, pero con el control de retiro de mallas que
  no podía fallar: se conserva y se declara **superada** por esa razón, no por identidad del
  candidato, que es el mismo), `qa-campo-escritura-anclada-a4832a6a.json` (corrida verde del
  candidato superado), `qa-campo-escritura-anclada-build107.json` (primera corrida),
  `qa-campo-lectura.json` (no citable, se declara por qué), `qa-reposicion-huerfanos.txt`
  (residuos, su reposición y el censo final); instantánea de suites:
  `suites-arbol-candidato.txt` (45/45).

## Ancla de despliegue: qué binario se está midiendo

`GET /health` devuelve `200` con `commit = 914d1721965d` (el tip de `develop`, resuelto en
el árbol local). Sobre ese commit servido se comparan, byte a byte, los objetos `git` de las
diez rutas HR que gobiernan lo medido (bancos, selfie web, periodo de nómina, recibo PDF,
prestaciones de retiro, revisión de días, rutas/horarios, servicio, esquema y la pantalla
`bancos`): **10/10 idénticas al candidato `54cabeb3`**.

Esto es más fuerte que lo que se pudo afirmar en las corridas anteriores. Hasta ahora el
arnés llevaba una ruta excluida por nombre (`hr/service.js`, el frente #110) y la pierna
clasificaba la divergencia como aceptable. Con el candidato fundido sobre el tip actual de
`main` esa exclusión **desaparece**: `develop` ya trae el arreglo, el candidato lo toma, y
`EXCLUIDOS_DECLARADOS` queda vacío. La pierna `paridad_blobs_hr` sigue pudiendo fallar —y
ahora falla ante *cualquier* divergencia en una ruta ancla, porque no hay ninguna nombrada
como excluida—. Sin esta ancla la pierna "esperaba el defecto" puede estar midiendo un
árbol ya arreglado y dar verde igual; por eso el hash de blob es el que manda, nunca la
fecha del commit.

## El destino avanzó tres veces a mitad de la intervención y las tres frenaron la promoción

Este frente se construyó cuatro veces. Cada avance se midió antes de decidir, no después.

1. **Candidato `2c10deaa`** sobre `7de02a3b`. QA servía `de7af667786a` (PR #107) y la corrida
   de campo ancló 10/10 blobs contra ese build. `main` avanzó a `a0fb7e05` (dos documentos de
   evidencia) y el candidato se recompuso sobre ese tip conservando las rutas.
2. **`main` absorbió el PR #109** (`790870a0`, replay `2c2f6723`) y chocó con dos rutas del
   paquete: `hr/schema.js` y `hr/service.js`. Empujar el candidato entonces **revertía en
   producción** el arreglo de la foto rechazada: medido con el marcador exclusivo del #109
   (`MOTIVO_CORRECCION_REQUERIDO`), el candidato viejo daba 0 ocurrencias donde `main` daba 1.
   La compuerta de alcance lo frenó antes del push.
3. **Reconstrucción `a4832a6a`**, sobre `790870a0`, tomando las rutas desde el tip de
   `develop` de ese momento. Control anti-reversión medido: de las 80 líneas que el replay de
   `main` añadió en las dos rutas colisionantes, **0** faltaban en el candidato. Consecuencia
   declarada en su momento: **#109 ya no se podía excluir, porque `main` lo corría desde
   `790870a0`**.
4. **`main` absorbió el frente hermano "mallas con maestro único y marcaciones sincronizadas
   entre dispositivos"** (`790870a0` → `c53f857c`, con los merges `80681aa1` y `ee9abd27`).
   Ese avance tocó **tres** rutas de este paquete. La medición, no la suposición:
   - `apps/api/src/modules/hr/service.js`: el avance añadió 3 líneas (el guard de ámbito del
     tenant al actualizar un horario: `ownedRoute` + `HORARIO_NO_ENCONTRADO` + `where` con
     `tenant_id`). El candidato `a4832a6a` **no las tenía**, porque declaraba el PR #110
     excluido. Empujarlo habría revertido ese guard en producción.
   - `talento-humano/marcacion/page.tsx` (104 líneas) y `talento-humano/rutas/page.tsx`
     (15 líneas): el avance del frente hermano está íntegro en el tip de `develop`, así que
     el candidato ya las contenía.
   Prueba de que el contenido de `main` no es un viejo snapshot: los blobs de esas tres rutas
   en `main` **no existen en toda la historia de `develop`** (vinieron hunked por el otro
   frente), y aun así el control de containment los encuentra a todos en el candidato nuevo.

Reconstrucción vigente `54cabeb34b7270df...`: las 49 rutas se tomaron del tip actual de
`develop` (`914d1721965d`, el mismo commit que QA sirve), sobre el tip actual de `main`. Con
eso el **#110 deja de estar excluido y viaja dentro de este frente**, por la misma razón por
la que viajó #109: producción ya lo corre. Control anti-reversión final medido sobre la
ventana completa del avance ajeno (`790870a0..c53f857c`): **122 líneas propias del destino,
0 perdidas**. Barrido de 15 marcadores de capacidad (`MOTIVO_CORRECCION_REQUERIDO`,
`HORARIO_NO_ENCONTRADO`, `Retry-After`, `P2028`, `readPendingSync`, `idempotency_key`,
`EVIDENCIA_LLEGADA_TARDE_REQUERIDA`, entre otros): **0 que se revertirían**.

Lo que sí sigue excluido a propósito: **#108 en sus rutas no HR**, la poda del acceso
directo de contabilidad al PYG ampliado, comercio M-30 y la torre de control. Cada uno con su
manifiesto y sus dueños. En `main` la compuerta de selfie sigue siendo la **dura**: la
excepción angosta de evidencia degradada vive solo en `desarrollo` y llega por su propia pata.

El artefacto `qa-campo-lectura.json` (una reanudación en modo lectura sobre `43e5510cfe2d`,
`BLOQUEADO 3/25`) existe y se conserva, pero **no es citable** por dos razones medidas: el modo
lectura no puede autenticarse —las cuentas con las que se mide las crea el propio producto, así
que trece piernas salen `NO_APLICABLE` por estructura y nueve rojas más son el mismo efecto— y
comparaba el candidato viejo contra un build que ya había absorbido #109, es decir medía otra
cosa. Un `BLOQUEADO` así no refuta nada.

## Instrumento versionado

`scripts/certifications/hr-paquete-main-qa.js`, sha256
`fc73dc533b0997df2655c270db170fa8b6eeec9da3b18c3004a3fa1d3223dbba` estampado en la evidencia.
Los shas previos son los de las versiones del arnés con las que se hicieron las corridas
anteriores: `6e25666bd4868fe5ce1cf7324ab634a793da3a40597843e3f3efd00c3d308562` (primera
campana), `013e09bc8bebd8d2a6bd3c627079843ad766e1ba0f124af17bb54c1b7c7e7045` (candidato
`a4832a6a`) y `312df52afc5a5108999433b8a63844ab4b7043c2c51a99ab8c64074a55eb59a1` (candidato
`54cabeb3` con el control de retiro de mallas que no podía fallar). El sha vigente cambió por ese
control: agregó la pierna `mallas_retiradas_por_estado`, el retiro real por `PATCH
/hr/routes/:id status=inactive`, la reposición de las mallas de corridas anteriores y la
declaración honesta del `DELETE` físico. Cada reparación del instrumento se volvió a certificar.

```text
node scripts/certifications/hr-paquete-main-qa.js --selftest
node scripts/certifications/hr-paquete-main-qa.js --env-file=config/qa.env --escribe-en-qa=NO
node scripts/certifications/hr-paquete-main-qa.js --env-file=config/qa.env --escribe-en-qa=SI
```

Reglas del arnés, todas verificables en el archivo:

1. Aborta sin conectar si el archivo no es `config/qa.env`, si el ambiente declarado
   no es `qa` o si `DATABASE_URL` no pertenece al project ref esperado.
2. Escribir exige la bandera explícita `--escribe-en-qa=SI`. Con `NO` las piernas de
   estado final se declaran `NO_APLICABLE`; nunca prestan un verde.
3. Cada pierna se evalúa con un único predicado comparado contra lo que la petición
   devolvió. `--selftest` recorre las veintiséis piernas y exige que cada una cumpla
   con la observación declarada y **falle** ante la observación contraria: un
   predicado que no puede fallar deja el selftest rojo. En esta corrida las 26 piernas
   dieron `verde=true distingue_rojo=true`.
4. Las cuentas con las que se mide son efímeras y las crea el propio producto
   (`admin.createUser`), con rol elegido por permisos leídos del tenant. El retiro es
   por endpoint (`PATCH /admin/users/:id/status active=false`), nunca por `UPDATE`, y el
   administrador efímero se desactiva **al final** para no matar la sesión con la que se
   retiran las demás. Con la misma forma se retiran el banco del maestro
   (`PATCH /talento-humano/bancos/:code active=false`) y la malla
   (`PATCH /hr/routes/:id status=inactive`): en los tres casos la confirmación es el estado
   que **vuelve a leer el arnés mientras su sesión vive**, no la ausencia en un listado.
5. Las fotos son PNG reales de ruido (1 820 bytes, IHDR/IDAT/IEND con CRC válidos):
   un stub de 68 bytes haría decorativa la pierna de tamaño.

## Resultado por familia

Los números son de la corrida citable `20261123171846` (26/26, candidato `54cabeb3` contra el
build servido `914d1721965d`, instrumento `fc73dc53…`). Las corridas anteriores midieron el mismo
contrato con otros identificadores; la comparación entre todas está en
`equivalencia-blob-candidato.txt`.

**Maestro de bancos.** Defaults `001/007/051` presentes (19 filas en el maestro). Alta
efímera `925` (200) y relectura con la fila activa (20 filas); duplicado del mismo código
nacional → `409 BANCO_INVALIDO` «Ya existe un banco con ese codigo nacional»; código `"12"` →
`400` de esquema (`^[0-9]{3}$`) y la fila no queda escrita; SWIFT `AB12CD34` (dígitos dentro
del bloque de letras) → `422 BANCO_INVALIDO`. Las claves de `Tenant.config` distintas de
`hr_banks` quedaron **byte a byte iguales** antes y después (2 claves → 2 claves): la
persistencia del maestro es `jsonb_set` sobre el JSONB de la empresa. No existe `DELETE` en el
maestro: retirar es poner `active=false`.

**Cuenta de pago del empleado.** El `PATCH` con `bank_code` + `bank_account_code`
devolvió 200 y la relectura mostró `bank_entity_name` resuelto **por el maestro** (el
cliente nunca envía el nombre) y la cuenta escrita. Asignar un banco ya retirado
(`926`, dado de alta y puesto `active=false` en la misma corrida) a la ficha `690`, que tiene
otro banco vigente (`925`) → `422 BANCO_INVALIDO` «Selecciona un banco activo del maestro de
esta empresa», y la ficha **conserva** el banco bueno: el rechazo no degrada la
asignación previa. Cuenta huérfana (solo `bank_account_code`, sin banco) medida en la
ficha libre `691`, cuyo banco está vacío → `422` con el mensaje de campos juntos.

**Liquidación de retiro.** El `POST .../preview` devolvió `200` con `mode = "preview"`,
10 líneas de desglose (`DED_PENSION`, `DED_SALUD`, `PRIMA_SERVICIOS`, `CESANTÍAS`, …) y
`gross/deductions/net` numéricos, **sin** ganar fila en el listado de documentos del empleado
efímero (0 → 0): el preview calcula y no escribe. La revisión de días leyó el tramo completo
(31 días, retiro `2026-12-23` derivado del ingreso real de la ficha) y el catálogo de
clasificaciones del ambiente (`trabajado_sin_marcacion`, `inducción`, `descanso`,
`permiso_remunerado`, `ausencia_no_remunerada`); una clasificación inventada (`teletrabajo`)
y una nota de 3 caracteres fueron rechazadas por esquema. Con el tramo justificado día por día
por endpoint (31 pendientes → 0 releídos), `POST .../documentos` cerró la liquidación
(documento `id 11`) y el `GET .../documentos/:id/pdf` sirvió un **PDF real de 6 296 bytes** con
mágica `%PDF-`; el documento se retiró por `DELETE` (200).

**Nómina.** `GET /nomina/cierres` 200 (0 periodos). La periodicidad se lee del ambiente:
NYVORA es quincenal, así que `POST /cierres/validar` con `2026-10-01..2026-10-15` responde con
código de dominio (`409 IBC_REPORTADO_REQUERIDO`: no hay IBC reportado para la ficha de
monitoreo, en 1 221 ms) y con `2026-10-01..2026-10-31` responde `400 NOMINA_PERIODO_INVALIDO`
«La nómina quincenal debe ir del 1 al 15 o del 16 al último día del mes». La regla de
periodicidad se aplica con código de dominio, no con un crash ni con un 500.

**Horarios unificados, contención y su retiro real.** `POST /talento-humano/mallas` creó la
malla 430 asignada al operario efímero y la misma fila aparece con el **mismo identificador** en
`/talento-humano/mallas` y en `/hr/routes`: un solo almacén, dos lecturas. Seis escrituras
concurrentes de malla devolvieron `[200, 409, 409, 409, 409, 409]` con **cero** cuerpos
conteniendo `P2028` / «Transaction not found», cero códigos fuera de contrato y cero `503` sin
`retry-after`: la contención de jornada no degrada a error de transacción (la ganadora de esa
contienda fue la malla 431).

El retiro de esas dos filas es la pierna nueva, y se añadió porque las versiones anteriores del
arnés lo afirmaban sin ejecutarlo. Lo medido ahora: `PATCH /hr/routes/:id` con `status=inactive`
devuelve `200` y la **relectura del almacén en la misma corrida** muestra `active → inactive` en
las dos filas (`mallas_retiradas_por_estado`, `2/2`). El `DELETE` físico de una malla existe, pero
responde `400` porque está detrás del permiso `delete_physical_records` que este arnés no se
entrega a sí mismo: se declara como contrato, no como retiro. La reposición de las veinte mallas
que las diez corridas anteriores dejaron activas por ese anuncio vacío está en
`qa-reposicion-huerfanos.txt`, con su conteo antes y después.

Lo que el control viejo afirmaba y no era: leía el listado *después* de matar la propia sesión,
así que un `401` vaciaba la lista y la malla "desaparecía"; además el listado oculta la fila cuando
su ficha queda inactiva, que es otra causa. Un control que se satisfece con que la lectura falle no
puede fallar, y por eso ahora la confirmación es el estado de la fila, con la sesión viva.

**Marcación web con selfie.** Sin `identity_photo` → `400 SELFIE_REQUERIDA`. PDF, SVG y
2,5 MB → `400 SELFIE_INVALIDA` en los tres casos con su mensaje. Un `route_id` no
asignado a la ficha conectada → `403 HORARIO_AJENO_DENEGADO` (la compuerta de horario
vive antes que la foto). La marcación válida con selfie PNG real sobre su propio
horario → `200 ok=true`, `punch.id 1766`, hora servida `12:20` (ventana de malla
`12:15-14:00`, hora local de Bogotá), identidad `{"status":"photo_only","channel":"web"}`;
la ficha sin jornada obtiene `200` con cero horarios asignados (no un error), que es lo que la
pantalla grande «Sin horario asignado» necesita. El reenvío con la misma `idempotency_key`
devolvió `replayed=true` con el **mismo** identificador y exactamente una fila leída con esa
llave: la cola del dispositivo no paga una segunda hora.

**RBAC y aislamiento.** El mismo `POST /nomina/cierres/validar` con dos roles reales:
`Empleado marcaciones` → `403 PERMISO_DENEGADO`; `Administrador de empresa` → `409`
de dominio (pasa el permiso). Control: ese mismo token sí lee sus propios horarios
(`200`), o sea el bloqueo viene del permiso de nómina y no del ambiente. Lectura de un
empleado de la empresa vecina `NYVORA QA ISOLATION CONTROL` con sesión de NYVORA →
`404 EMPLEADO_NO_ENCONTRADO`, y el listado propio (34 fichas) no contiene **ninguna**
fila fuera del alcance del tenant.

## Las siete rojas de la primera corrida eran del instrumento

La primera corrida autorizada (`16/25`) se documenta porque cada rojo fue diagnóstico,
no producto, y todos se corrigieron en el arnés:

1. `cuenta_pago_rechaza_banco_inactivo` medía contra el mismo banco que la ficha ya
   tenía; el producto conserva a propósito el banco vigente cuando ese banco sale de
   servicio. Se pasó a retirar un banco distinto y se añadió la comprobación de que la
   ficha conserva el banco bueno.
2. `cuenta_pago_rechaza_cuenta_sin_banco` se medía en una ficha ya asignada (el `PATCH`
   preserva `bank_code`). Se cambió a la ficha con banco vacío.
3. `liquidacion_preview_sin_persistir` devolvía `422 RETIRO_ANTERIOR_INGRESO` porque el
   arnés adivinaba la fecha de retiro. Se deriva de `hire_date` de la ficha.
4. La misma pierna leía los conceptos en la raíz de la respuesta; el preview devuelve
   `{ mode, document }` y las líneas están en `document.lines`.
5. `revision_dias_lee_y_valida_clasificacion` llamaba el `GET` sin `employee_id` ni
   `termination_date` (el builder los exige).
6. `nomina_cierres_lee_y_valida` exigía `200` a `validar` y el ambiente responde `409`
   de dominio porque no hay IBC reportado; el `409` es contrato, no fallo.
7. Las dos piernas de marcación caían en `422 JUSTIFICACION_LLEGADA_TARDE_REQUERIDA` y
   luego en `422 EVIDENCIA_LLEGADA_TARDE_REQUERIDA`: la malla fija `08:00-17:00` medida a
   media tarde es una llegada tarde legítima. La ventana se centró en la hora local de
   Bogotá y se conservó la cadena de reenvíos declarada. La idempotencia además estaba
   verde sobre cero filas: ahora exige el identificador de la primera marcación.

## Las corridas siguientes también fueron del instrumento, y se corrigieron

1. **`BLOQUEADO 18/25`** sobre el build `914d1721965d`. Siete rojas en cascada con dos causas.
   (a) `ancla_build` marcaba el commit servido como *no resoluble en el árbol local*: la
   referencia `develop` estaba sin `fetch`. Se hizo `git fetch origin` y `914d1721` resultó ser
   el PR #110, con sus `docs(hr)` `1edcee64`/`20e7228c`. (b) Cuatro rojas de bancos y cuenta de
   pago más: el arnés buscaba el código efímero en una lista fija de seis (`907 908 909 911 912
   913`) y las corridas anteriores ya los habían ocupado todos, así que no había alta que medir
   y las piernas dependientes caían en cadena. Se cambió la lista por un barrido `915..999`
   contra el maestro, y la misma lógica sirvió para el banco que se retira a mitad de la corrida.
   La corrida siguiente: `24/25`.
2. **`BLOQUEADO 24/25`** con una sola roja: `paridad_blobs_hr 9/10`, `hr/service.js`
   (`b5eebff8` servido vs `568756c8` candidato). No era un defecto ni un pendiente: era el frente
   #110 que *en ese momento* el paquete declaraba fuera de alcance. La pierna estaba escrita como
   "las diez son idénticas o rojo", que castiga una exclusión deliberada y, peor, no distingue una
   exclusión declarada de una divergencia real. Se reescribió para clasificar cada divergencia: si
   está nombrada en la lista de excluidos se reporta `[excluido: <causa>]` y la pierna verde; si
   no, `[SIN DECLARAR]` y rojo. Con `0625e1a2` bajo el mismo predicado la roja seguía apareciendo,
   así que la reparación no daba verde gratis.
3. **`APROBADO 25/25`** sobre el candidato `a4832a6a` (`qa-campo-escritura-anclada-a4832a6a.json`),
   con la única divergencia clasificada. Queda **superada** como evidencia de la promoción: el
   árbol promovido ya no es ese.
4. Reparación encontrada al releer los retiros de las corridas: el arnés hacía el `PATCH
   active=false` con la sesión del administrador efímero y desactivaba ese administrador
   **primero**, de modo que su token moría y las dos fichas de marcación quedaban vivas con `401`.
   Cuatro fichas de QA se anunciaban como retiradas sin estarlo. Se invirtió el orden, se renombró
   el campo engañoso (`activo_servido` → `retirado_confirmado`), se ejecutó de verdad el retiro del
   banco efímero (antes solo se anunciaba), y se computó el conteo de residuos en vez de escribirlo
   fijo. Censo y reposición en `qa-reposicion-huerfanos.txt`.
5. **`APROBADO 25/25`** (`20261123165957`, `qa-campo-escritura-25piernas-165957.json`): corrida
   completa sobre `54cabeb3`, con `paridad_blobs_hr = 10/10`, la lista de exclusiones vacía y los
   retiros de usuarios y bancos releídos. Queda **superada por un control, no por el árbol**: al
   census SQL de hoy las mallas que esa corrida anunciaba como retiradas seguían `active` en el
   almacén.
6. Defecto descubierto al hacer el censo de ese mismo archivo. El control de retiro de la malla leía
   el listado con la sesión del administrador que acababa de desactivarse: el `401` devolvía lista
   vacía y la casilla `malla_cert_visible_despues_del_retiro=false` quedaba verde sin poder fallar.
   Y aunque la lectura hubiera funcionado, midió la causa equivocada: el listado oculta la malla
   porque su ficha quedó inactiva, no porque la malla se retirara. Medido con SQL directo:
   **20 mallas** de las diez corridas anteriores estaban `active` (10 `CERT QA` + 10 `CERT CONC`).
   Se añadió la pierna `mallas_retiradas_por_estado`, que retira por `PATCH /hr/routes/:id` con
   `status=inactive`, relee el estado con la sesión viva y exige haber visto la fila `active` antes;
   se añadió además la reposición de las mallas de corridas anteriores dentro de la propia corrida.
   El `DELETE` físico de una malla responde `400`: está detrás del permiso `delete_physical_records`,
   que el arnés no se otorga. La corrida vigente lo midió: `2/2` en `active → inactive` y `20 → 0`
   mallas activas de este frente en el almacén.
7. **`APROBADO 26/26` vigente** (`20261123171846`, `qa-campo-escritura.json`, instrumento
   `fc73dc53…`): la misma ancla (`914d1721965d`, paridad `10/10` con exclusiones vacías) con el
   retiro de mallas medido de verdad.

## Qué NO prueba esta corrida

- No sustituye las suites locales de cada paquete: prueba el binario desplegado. La
  instantánea de suites del árbol candidato está en `suites-arbol-candidato.txt` (45/45).
- Mide el negocio de NYVORA en QA. El aislamiento con dos empresas propias y la matriz
  RBAC completa quedan en las certificaciones locales; la pierna de aislamiento aquí es
  la comprobación de que el binario servido no filtra.
- El ambiente sirve la compuerta **dura** de selfie. La excepción angosta de
  recuperación con evidencia degradada vive solo en `desarrollo`; `main` no la recibe
  con esta promoción y la marcación con evidencia degradada seguirá rechazándose en
  producción hasta que esa pata se promueva por separado.
- El dictamen de auditoría de marcaciones y nómina (`NO APTO para producción sin
  remediación`, R-01..R-05 implementados en `desarrollo` sin promocionar) es una
  condición declarada previa y sigue declarada: esta medición no la cierra.
- No hubo trabajo de base de datos: las migraciones de `develop` y `main` son idénticas
  y el maestro de bancos persiste en `Tenant.config.hr_banks`, así que la promoción no
  ejecuta migración remota alguna.
- El paquete **no existe en `desarrollo`** como paquete: la deuda de retrointegración
  queda declarada y la cierra el propietario del frente, no se oculta con esta promoción.

## Residuos en QA y su reposición

Censo SQL directo contra la base de QA después de la corrida citable, retiros y reposición en
`qa-reposicion-huerfanos.txt`. Todo lo que sigue fue creado por las corridas de esta intervención
en la empresa modelo; ninguna tocó datos de otros tenants.

- **33 fichas** `QA-PQ-*` de las once corridas (`150258`, `151033`, `151700`, `152121`, `162039`,
  `162441`, `162931`, `163315`, `163936`, `165957`, `171846`), tres por corrida: **0 con usuario
  activo**. Las cuatro que el orden defectuoso del retiro dejó vivas (`789`, `790`, `820`, `821`) se
  retiraron por endpoint en la pasada de reposición; el producto no expone `DELETE` de empleado, así
  que retirar es estado.
- **18 bancos** `CERT QA ...` en el maestro (`907 908 909 911 912 913 915 916 917 918 919 920 921
  922 923 924 925 926`): **0 activos**. La afirmación anterior de este dossier —«`912` activo»— era
  cierta en ese momento porque el arnés no ejecutaba el retiro que anunciaba; hoy el retiro se hace
  y se relee.
- **22 mallas** de este frente (`11` de la pierna unificada + `11` ganadoras de la contención, ids
  `405`…`431`): **0 con estado `active`**. Veinte de ellas estaban activas cuando este dossier
  afirmaba lo contrario; se retiraron por `PATCH /hr/routes/:id status=inactive` en la reposición
  que la propia corrida ejecuta ahora contra las corridas anteriores. El borrado físico no es
  opción de este arnés: `DELETE` responde `400` porque exige `delete_physical_records`.
- **279 clases** `trabajado_sin_marcacion` de revisión de días, 31 por corrida en las nueve fichas
  cuyo tramo llegó a justificarse (`647`, `650`, `670`, `673`, `676`, `679`, `684`, `687`, `690`):
  el catálogo no expone `DELETE` de revisión de día y quedan ligadas a fichas ya retiradas. La tabla
  tiene una fila adicional (`empleado_id 554`, ficha `Edwar lopez`) que **no** es de este frente y
  no se tocó.
- **9 marcaciones** con `idempotency_key` del prefijo de esta certificación (9 llaves distintas),
  una por corrida con escritura.
- **0 documentos de liquidación** de fichas `QA-PQ-*`: aquí el `DELETE` del producto sí es físico y
  se cumplió (`th_liquidaciones_trabajador` quedó con una sola fila, la `id 2` de la ficha `554`,
  ajena a este frente). Contraste declarado con la malla: el mismo verbo borra en un recurso y
  está cerrado por permiso en otro, y el arnés ahora distingue los dos casos.
- Ajenos a este frente, declarados sin tocarlos: cuentas de otras certificaciones que siguen
  activas en QA (`qa.monitor.*`, `qa.silence.*`, `qa.rescue.admin.*` y las fixtures
  `sesion-con-empresa.*@certificacion.qa`).

Ninguna contraseña de estas cuentas se versiona: los archivos de evidencia solo registran
identificadores numéricos, hashes de blob y códigos de dominio.

## Compuertas de la pata main, corridas y verbatimas

Se corrieron en el worktree de gobernanza, sobre la punta de la auxiliar, contra el target remoto y no contra el baseline local:

```
ALCANCE DE PROMOCION VALIDO: hr-paquete-main-20261123 (63 rutas)
APROBACION QA VALIDA: hr-paquete-main-20261123
git: b3486793  origin/main: c53f857c
```

El manifiesto de alcance declara 63 rutas exactas (41 A y 22 M, 0 D) y `allowed_deletions` vacio;
el de aprobacion exige y encuentra las cinco checaduras, la empresa modelo NYVORA en QA, la
certificacion transversal y el plan de retroceso con el baseline productivo anterior.

## El DESPUÉS en Producción, medido sobre el artefacto servido

El push fue fast-forward de `c53f857c` a `336f28b0` y Railway desplegó los dos servicios sin
intervención. Los sondeos, todos de lectura:

```
GET /health  intento 1 -> commit c53f857c1d99   (el deploy todavía no caía)
GET /health  intento 2 -> commit 336f28b0a695   modules 19  status OK
/dashboard/talento-humano[/bancos|/liquidacion-trabajador|/nomina|/empleados|/rutas|/marcacion] -> 200
/dashboard/talento-humano/no-existe-xyz         -> 404   y 0 coincidencias del marcador
GET  /api/v1/talento-humano/bancos                          -> 401
POST /api/v1/talento-humano/bancos                          -> 400  (esquema antes que preHandler)
GET  /api/v1/talento-humano/liquidacion-trabajador/revision-dias -> 401
GET  /api/v1/talento-humano/nomina/ajustes                  -> 401
GET  /api/v1/talento-humano/nomina/reportes/conceptos       -> 401
GET  /api/v1/hr/routes                                      -> 401
GET  /api/v1/talento-humano/no-existe                       -> 404
```

En los 6 983 109 bytes de chunks que descargó la sonda aparecen los literales exactos del paquete
(`Maestro de bancos` 8, `Codigo nacional`, `Nombre del banco`, `Banco activo`, `Revisión del salario
pendiente`, `Concepto manual`, `Registrar concepto`, `Seleccionar concepto`, `Ir al maestro de
empleados`, `Cancelar edicion`, `Horarios con eventos`, `Asignar horario`, `selfie` 2). Dos términos
quedaron retirados del marcador porque no existen en el fuente (`Horarios unificados`, `Periodicidad`):
un control que no puede fallar no prueba nada, y fue el error que ya se corrigió dos veces en este
frente. No se escribió nada en el tenant de clientes de Producción: la pata que certifica el flujo de
negocio es la corrida de 26 piernas en QA sobre contenido blob-idéntico al que ahora sirve main.
