# Certificación de la pierna `develop → main`: el paquete acumulado de Talento Humano llega a Producción

- **Rama auxiliar:** `codex/qa-hr-paquete-main-20261123`
- **Baseline del destino:** `origin/main` en `c53f857c1d996aceaf9fcda4649cbcd9ed7dccab`. Medido, no
  asumido: `git rev-parse origin/main` al cerrar el candidato devolvió ese sha, y se repitió el
  `fetch` al cerrar esta certificación —sigue siendo el tip—.
- **Commit certificado del candidato:** `54cabeb34b7270df46d17b43d8096d2337b7ff7c`, hijo **directo**
  del baseline (`git log -1 --format=%p` = `c53f857c`). No es un merge de `develop`:
  `origin/main..origin/develop` es un diff de **1 094 rutas** y entre los dos destinos hay frentes
  ajenos a Talento Humano (buzón, facturas recibidas, comercio, torre, piso de latencia, PYG
  ampliado) que no tienen pata certificada para Producción.
- **Forma de promoción:** fast-forward puro. El candidato tiene un solo padre, que es el tip actual,
  así que `origin/main..candidato` no mergea, no reescribe y no revierte nada. El
  `previous_main_commit` del rollback es exactamente el sha del baseline.
- **Cuatro reconstrucciones, todas por el mismo motivo:** el destino avanzó tres veces a mitad del
  frente (`7de02a3b → a0fb7e05 → 790870a0 → c53f857c`) y cada avance tocó rutas de este paquete.
  Las cadenas invalidadas/superadas (`2c10deaa`, `0625e1a2`, `a4832a6a`) están declaradas con su
  causa medida en `../evidence/hr-paquete-main-20261123/equivalencia-blob-candidato.txt`, sección 2,
  y su narrativa en `00-veredicto.md`. Nunca se usó un árbol viejo como baseline.
- **Por qué no va por PR:** el guard de `main` (`scripts/git-governance-guard.js:69`) sigue siendo la
  versión antigua y rechaza en CI cualquier PR cuyo head no sea `develop`. Una PR desde la auxiliar
  pondría rojo el check `governance:ci` del destino. Es la misma forma de `90d08cc7`, `4d459f0c` y
  `c53f857c`. No se trae a `main` el guard nuevo de `develop`: gobernar la CI de Producción es otro
  alcance y otra compuerta.
- **Árbol donde se ejecutó:** worktree aislado del puesto, **sin** `node_modules` (regla 40: copiarlo
  ya borró 1 173 archivos del repositorio el 2026-11-20). Por eso las suites se midieron en el árbol
  principal y se puenteó por equivalencia de blobs, declarada en
  `equivalencia-blob-candidato.txt`.

## Identidad del replay: medida ruta por ruta, con guarda falla-cerrada

Ruta ausente o hash vacío se reporta `DIFIERE`, nunca `IGUAL`. Detalle completo con los 49 hashes en
`../evidence/hr-paquete-main-20261123/equivalencia-blob-candidato.txt`.

| Comparación | Resultado |
| --- | --- |
| Candidato `54cabeb3` vs el inventario del paquete (27 A + 22 M, 0 D) | **49 / 49 rutas aplicadas**, 2 ya idénticas en el destino |
| Candidato vs el build que QA sirve (`914d1721965d`, tip de `develop`) | **46 / 49**; las 3 restantes son podas declaradas de filas ajenas |
| Candidato vs build servido, solo en las 10 rutas ancla HR | **10 / 10** con la lista de exclusiones del arnés **vacía** |
| Avance propio de `main` (`790870a0..c53f857c`, frente hermano de mallas) ∩ las 49 del paquete | 3 rutas, **122 líneas propias del destino, 0 perdidas** |
| Barrido de 15 marcadores de capacidad (main vs candidato) | **0 que se revertirían** |

La penúltima fila es la que responde al encargo de "no romper lo que está en camino": el frente que
Producción adelantó después de la base certificada —el maestro único de mallas y las marcaciones
sincronizadas entre dispositivos— queda **dentro** del candidato en las tres rutas que comparten,
porque `develop` ya lo absorbió. Aplicar este paquete no deshace ese avance, y viceversa.

Las **3** divergencias contra el tip de `develop` no son lógica HR sin certificar: son **2 rutas**
(`apps/web/lib/moduleFunctions.ts` y `apps/web/test/command-palette-module-functions.test.mjs`)
hunkeadas a mano sobre el árbol de `main`, porque `develop` publicó ahí la entrada del maestro PYG
ampliado que no pertenece a este frente, y **1** poda equivalente en el instrumento
(`hr-punch-mobile-evidence-local.js`) que navegaba esa misma entrada ajena. La entrada HR de las dos
primeras es byte a byte la de `develop`; lo que no viaja es la fila ajena.

## Qué lleva la pierna

El paquete de Talento Humano que `develop` acumuló y que nunca se había medido contra un binario
desplegado:

1. **Maestro de bancos** y **cuenta de pago del empleado**. El maestro persiste en
   `Tenant.config.hr_banks` (JSONB, `jsonb_set`): no hay tabla nueva ni migración, y escribir bancos
   preserva byte a byte las demás claves de la configuración del tenant.
2. **Liquidación de retiro completa**: concepto manual, pagos de prestaciones, deducciones, revisión
   de días del tramo, recibo en PDF y vista previa que no persiste.
3. **Periodo y cierre de nómina**, incluida la regla de periodicidad leída de la configuración.
4. **Horarios unificados** (mallas) con las dos lecturas_coincidentes, retiro por estado y
   contención de escritura concurrente sin `P2028`.
5. **Aterrizaje por tarjetas** y navegación móvil del módulo.
6. **Marcación web con selfie en cuatro pasos** y sincronización entre dispositivos.

## Certificación de campo en el ambiente desplegado

- Instrumento: `scripts/certifications/hr-paquete-main-qa.js`, sha256
  `fc73dc533b0997df2655c270db170fa8b6eeec9da3b18c3004a3fa1d3223dbba` estampado en la evidencia.
- Corrida `2026-11-23T17:18:42Z` (`20261123171846`) con `--env-file=config/qa.env
  --escribe-en-qa=SI` sobre `apexos-api-qa-production.up.railway.app` (project ref
  `jbirkghkekuifgfsgquq`).
- Veredicto: **APROBADO — 26 piernas, 26 verdes, 0 rojas, 0 NO_APLICABLE**
  (`../evidence/hr-paquete-main-20261123/qa-campo-escritura.json`).
- Ancla doble: `GET /health` devolvió `commit = 914d1721965d` y las 10 rutas HR que gobiernan lo
  medido son, hash contra hash, las del candidato (`paridad_blobs_hr = 10/10`, con
  `EXCLUIDOS_DECLARADOS` vacío: la pierna ya no puede comprar una exclusión).
- Empresa modelo **NYVORA** (`1d162ffd-bd27-4855-8141-b015388265fc`, 37 módulos activos), con tres
  cuentas efímeras creadas por el propio producto (836 / 837 / 838) y retiradas por endpoint.

Hechos observados que valen como control, no como relato: las mallas 430 y 431 se vieron `active`
antes del retiro y `inactive` después de releerlas con la sesión viva; seis escrituras concurrentes
dieron `[200, 409, 409, 409, 409, 409]` con **cero** cuerpos con `P2028` o `Timeout`; el tramo de
retiro pasó de 31 días pendientes a 0; el recibo PDF sirvió 6 296 bytes con cabecera `%PDF-` y el
documento se borró físicamente (`DELETE 200`, ninguna fila de ficha `QA-PQ-*` en el almacén); el
mismo payload de cierre de nómina dio `403` con el rol de marcaciones y `409` con el de
administrador, mientras el control de contraste (ruta legítima del operario) siguió en `200`; la
marcación con la misma `idempotency_key` devolvió `replayed=true` sobre el mismo `punch 1766` con
exactamente una fila leída.

## Las rojas que eran del arnés, no del producto

La primera corrida de campo dio nueve rojas y trece `NO_APLICABLE`; después vinieron un
`BLOQUEADO 18/25`, un `BLOQUEADO 24/25` y dos verdes superados. Todos se rastrearon al instrumento y
se corrigieron **sin relajar ningún predicado**; cada corrección está narrada con su medición en el
dossier `../evidence/hr-paquete-main-20261123/00-veredicto.md`. Las que importan como precedente:

- Dos piernas de marcación por ventana mal centrada y por no declarar la segunda etapa de la
  compuerta: la justificación de llegada tarde no basta, la evidencia se exige aparte.
- `cuenta_pago_rechaza_banco_inactivo` medía contra un código que coincidía con el banco recién
  creado; ahora barre `915..999` contra el maestro buscando un código libre.
- La pierna RBAC original era **imposible de cumplir** (NYVORA no tiene rol con `hr:read` sin
  `hr:write`); se sustituyó por un contraste real sobre el mismo endpoint, con payload válido porque
  Fastify valida el cuerpo antes del `preHandler`.
- `--selftest` se amplió para exigir que cada pierna **pueda fallar** ante la observación contraria.
  Eso fue lo que, dos veces, encontró verdes que no podían fallar: el retiro de las fichas (orden de
  la sesión) y el retiro de las mallas.
- **El retiro de mallas estaba afirmado y no ocurría.** El `DELETE` físico responde `400` porque está
  detrás del permiso `delete_physical_records`; el control además leía el listado con la sesión ya
  muerta. El censo SQL mostró **20 mallas de este frente con `status = active`**. Se añadió la pierna
  `mallas_retiradas_por_estado` (`PATCH /hr/routes/:id status=inactive` + relectura con sesión viva +
  requisito de haberla visto activa antes), la corrida repone las mallas de sus corridas anteriores,
  y el censo cerró en **0 activas**. La corrida `20261123165957` queda declarada **superada por este
  control**, no por identidad de árbol: es el mismo candidato.

## Qué NO prueba esta corrida (límites declarados)

- No sustituye las suites locales de cada paquete: prueba el binario desplegado. Instantánea de
  suites del árbol candidato: `../evidence/hr-paquete-main-20261123/suites-arbol-candidato.txt`
  (45/45).
- `main` conserva la compuerta **dura** de selfie en entrada y salida. La excepción angosta de
  evidencia degradada vive solo en `desarrollo` y llega por su propia pata; en Producción la
  marcación degradada seguirá rechazándose hasta que esa pata se promueva.
- El dictamen de auditoría de marcaciones y nómina —**NO APTO para producción sin remediación**,
  R-01..R-05 implementados en `desarrollo` sin promocionar— es condición declarada previa y sigue
  declarada. Esta medición no la cierra.
- No hubo trabajo de base de datos: las migraciones de `develop` y `main` son idénticas y el delta de
  modelo Prisma de este paquete es cero. No se aplica ni se revierte paso remoto alguno.
- El retroceso pendiente: el paquete **no existe en `desarrollo`**. La deuda de retrointegración
  queda declarada y se cierra por el propietario del frente, no se oculta con esta promoción.

## Excluido explícitamente del alcance

`agents/**` y `.qoder/skills/**` (el contexto vivo del equipo no existe en ramas liberadas; su fuente
es `desarrollo`), `apps/control-tower/**` (reposa solo en `desarrollo` por regla de gobernanza),
`apps/api/prisma/**` (sin migraciones), `package.json` (este corte no añade scripts de certificación
al destino), el maestro PYG ampliado de contabilidad, comercio M-30 y las otras 1 045 rutas del diff
bruto entre destinos. Ningún borrado: `allowed_deletions` está vacío y el diff neto del inventario no
tiene una sola `D`.

## Compuertas

- `npm run qa:promotion:scope -- docs/qa/manifests/hr-paquete-main-20261123-scope.json HEAD origin/main`
- `npm run qa:approval:evidence -- docs/qa/manifests/hr-paquete-main-20261123-approval.json`

El manifiesto de alcance declara **63 rutas exactas**: las 49 de código del paquete más la evidencia,
el instrumento, esta certificación y los dos manifiestos. Por eso el tip que se empuja no es
`54cabeb3` sino una cadena `docs(qa)` de hijos directos sobre él: el `certified_commit` del manifiesto
sí es `54cabeb3`, que es el árbol donde corrieron las suites y la certificación de campo, y el
`candidate_source.commit` es la punta que contiene la evidencia. Ninguna de esas rutas de documentación
toca una línea de `apps/**`.

Ambas corridas contra el **target remoto** y revalidadas en cada tip nuevo.

## El DESPUÉS en Producción

Se empujó `336f28b0` sobre `c53f857c` (fast-forward de la cadena replay + docs, sin merge de rama y sin
force) y Railway desplegó solo. La verificación es de **artefacto servido**, no de negocio:

- `GET /health` pasó de `commit = c53f857c1d99` a `commit = 336f28b0a695` en el segundo sondeo; los dos
  servicios (`apexos-api-prod`, `apexos-web-prod`) quedaron `Online`.
- El bundle que sirve Producción trae los literales exactos del paquete: `Maestro de bancos` (8
  apariciones), `Codigo nacional`, `Nombre del banco`, `Banco activo`, `Revisión del salario pendiente`,
  `Concepto manual`, `Registrar concepto`, `Seleccionar concepto`, `Ir al maestro de empleados`,
  `Cancelar edicion`, `Horarios con eventos`, `Asignar horario` y `selfie` (2). El control —una ruta
  inventada— devolvió `404` y cero coincidencias, para que el verde no se compre con una página vacía.
- La superficie nueva existe detrás de la autenticación: `GET /api/v1/talento-humano/bancos` `401`,
  `GET .../liquidacion-trabajador/revision-dias` `401`, `GET /api/v1/talento-humano/nomina/ajustes` `401`,
  mientras el control inventado da `404`. El `POST` al maestro sin cuerpo devolvió `400`: Fastify valida
  el esquema antes del `preHandler`, el mismo orden que midió la corrida de campo.

**Lo que esta pata no hace**: no se ejecutó ninguna escritura en el tenant de clientes de Producción. Las
26 piernas corrieron en QA contra contenido blob-identico al que ahora sirve main, y esta sonda prueba el
artefacto, no el flujo de negocio en la base real. Queda declarado, y las búsquedas con términos que no
son literales del fuente (`Horarios unificados`, `Periodicidad`) se retiraron del marcador porque un
control que no puede fallar no es evidencia. Detalle en
`../evidence/hr-paquete-main-20261123/qa-despues-produccion.json`.

## Residuos en QA

Todos creados por las corridas de esta intervención, ninguno tocó datos de otros tenants. Censo SQL,
retiros y reposición en `../evidence/hr-paquete-main-20261123/qa-reposicion-huerfanos.txt`:
**33 fichas** `QA-PQ-*` (11 corridas × 3) con **0** usuarios activos; **18 bancos** `CERT QA` en el
maestro (907…926) con **0** activos; **22 mallas** de este frente con **0** activas (20 estaban
activas antes de la reposición); **279** clases de revisión de días en 9 fichas; **9** marcaciones
con 9 llaves idempotentes; **0** documentos de liquidación de ficha `QA-PQ` (allí el `DELETE` sí es
físico). Quedan declaradas, sin tocarlas, las cuentas activas de instrumentos ajenos
(`qa.monitor.*`, `qa.silence.*`, `qa.rescue.*` y las fixtures `sesion-con-empresa.*`).
