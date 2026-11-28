# Brief — Migración del módulo de Talento Humano de develop a Producción (main)

- **ID**: `2026-11-27-hr-modulo-main-migracion`
- **Fecha**: `2026-11-27`
- **Rama activa para implementación**: `desarrollo` (punta de trabajo `e61608f6`, con la extensión `insert` del instrumento de replay)
- **Prompt crudo**: "tu instruccion ahora es validar el modulo de talento humano con los cambios que se han realizado y migrarlo de manera correcta desde develop hasta el main, sin adulterar registros, dañar funciones agenas al cambio, se requiere que queden los 3 ambientes alineados con la version que ya tenemos trabajada en develop, monta el plan de migracion y con mi autorizacion procede a migrar todo el modulo de manera correcta. autorizado la migracion" · "ten en cuenta dejar para produccion provicionalmente la aplicacion de maracion mediante la web los demas cambios deben migrar de manera completa y sana" · "no dejes pendientes procede a terminar todas las instrucciones al pie de la letra"

## 1. Objetivo

Llevar a `main` el Talento Humano completo que ya sirve `develop` —incluido el frente biométrico (WebAuthn, rostros, dispositivos compartidos)— sin adulterar un solo registro de cliente, sin dañar funciones ajenas al cambio y **conservando en Producción la marcación por la web tal como funciona hoy**. El transporte es por replay controlado (nunca `merge` a lo ancho): 34 rutas viajan byte a byte desde `origin/desarrollo` y 3 rutas —el esquema Prisma, el `package.json` de la API y el lockfile— van por fusión a tres vías porque `main` conserva contenido propio de otros módulos.

## 2. Alcance exacto (41 rutas de producto, 53 con la documentación del portón)

| Invariante | Rutas | Qué viaja |
|---|---|---|
| `carry` (34) | `apps/api/src/modules/hr/*` (7: rostro, consentimiento, webauthn personal, dispositivos compartidos, rutas, schema, servicio), `apps/api/src/modules/auth/*` (3), `apps/web/app/dashboard/talento-humano/*` (8 pantallas), `apps/web/components/*` (2: `hr/ConfirmWindow.tsx`, `operations/PhotoCapture.tsx`), `apps/web/lib/*` (3), `apps/api/test/*` (4), `apps/web/test/*` (4), migraciones Prisma (3) | El frente biométrico completo que QA ya certificó en `develop`, tal cual se probó (blob idéntico) |
| `insert` (3) | `apps/api/prisma/schema.prisma` (+94/−0), `apps/api/package.json` (+4/−0), `apps/web/lib/api.ts` (+5/−1) | Solo lo declarado línea por línea; el contenido propio de `main` (comentarios de Gastos Menores, modelos Invoice/Apex ajenos, dependencias de buzón, telemetría del cliente) queda intacto |
| generado | `package-lock.json` (+153/−0) | Subárbol biométrico idéntico en versión e integridad a `origin/desarrollo`; cero dependencias de otros módulos |
| portón | `docs/qa/specs/hr-modulo-main-20261127.replay.json`, `scripts/certifications/promotion-migration-check.js`, `scripts/test/promotion-replay-instruments.test.js` | El spec y el verificador de invariantes viajan con el candidato, para que el replay sea reproducible y reversible |

Las 41 rutas de producto cierran **37/37 invariantes** del spec (34 `carry` + 3 `insert`) con su control de mutación de **6 derivas, 6 rojas**, y **37 de las 41** son blobs idénticos a `origin/desarrollo`; las 4 divergentes son exactamente las 3 vías declaradas más el lock generado (`equivalencia-blob-candidato.json`). Sobre ese árbol corrieron las suites: API **46/46**, portal `hr-*` **185/185**, portón **4/4** y `next build` de producción con **salida 0** (141 páginas).

Las **12 rutas documentales** (1 brief, 1 certificación, 2 manifiestos, 7 piezas de evidencia y el instrumento de campo que las produjo) completan el inventario en **53**; viajan blob-idénticas a `origin/desarrollo` porque el validador de aprobación resuelve cada evidencia y cada script relativo al directorio del manifiesto.

### Módulos (`change_intent.modules`)

- `talento-humano`
- `base-de-datos` (migraciones biométricas)

### Borrados autorizados (`allowed_deletions`)

- ninguno. Ninguna ruta del candidato elimina un archivo del destino.

## 3. Fuera de alcance

No viajan en esta promoción (medido y documentado en la equivalencia por blob):

- Telemetría de cliente (`installationIdentity.ts`, `admin/public-routes.js` y 55 líneas de `lib/api.ts`: lectura de `health.commit` por petición) y el buzón de adjuntos/facturas recibidas: frentes que solo viven en `desarrollo`. **De `lib/api.ts` sí viaja la compuerta de escrituras** (`shouldBlockHrWriteFallback` para `shared-devices` y `face-enrollment`), no el archivo entero: ver `insert` en §2.
- `apps/control-tower/**` (residencia solo en `desarrollo`).
- Comercio M-30, hors de esta ronda.
- El monitor de horarios en dieciséis horas y el rediseño de horarios/mallas (frente ajeno, no pedido).
- Nada que altere la marcación web: la pantalla, sus enlaces del hub y la casilla móvil siguen como están en Producción.

## 4. Restricciones

- Adulterar registros: prohibido. Cero `UPDATE`/`DELETE` sobre datos de clientes; las migraciones solo crean 3 tablas nuevas.
- Dañar funciones ajenas: prohibido y medido. **0 borrados** en las 53 rutas del inventario; las 4 rutas cuyo blob no es el de `origin/desarrollo` son las 4 vías declaradas y las cuatro suman líneas sin eliminar ninguna del árbol de Producción (medido: `−0` en esquema, lock y manifest, y `−1` solo en la línea de condición de `lib/api.ts`, reemplazo declarado en el spec). Cada fusión la verifica la invariante `insert`, que rompe ante una baja no declarada.
- La marcación web de Producción no se toca: `faceMatchForPunch` responde `{status:"no_disponible"}` ante cualquier falla (nunca tumba la marca) y Human carga perezoso.
- Sin secretos ni credenciales en el diff.
- PR y merge a `main` solo por la rama auxiliar `codex/qa-hr-modulo-main-20261127`, respaldada con tag `backup/pre-hr-modulo-main-20261127`.

## 5. Criterios de aceptación

1. Compuerta de alcance `qa:promotion:scope` en verde contra `origin/main` (transporte por ascendencia del commit certificado + waivers nominales con razón y aprobación).
2. Aprobación funcional QA `qa:approval:evidence` en verde, con la evidencia de campo Nyvora en QA desplegado (paquete 27/27 + despliegue verificado).
3. Suites dentro del árbol candidato: API `hr-*` (46/46) y web `hr-*` en verde; build de producción del portal con salida 0.
4. Producción servida con el commit promovido (`health.commit`) y la re-medición de marcaciones muestra que la web sigue marcando.
5. Las 3 migraciones biométricas aplicadas en Producción y ausentes de cualquier escritura de cliente.

## 6. Capacidades protegidas

- **Marcación web en Producción** — permanece activa y medida (antes/después sobre el binario servido).
- **Aislamiento multi-tenant y RBAC** — no se toca el middleware ni una política; las tablas nuevas siguen la convención de `tenant_id`/`employee_id`.
- **Gastos Menores y resto de módulos de `main`** — el esquema y el lockfile conservan su contenido propio (invariante `insert`, 0 eliminadas).
- **Degradación segura de la biometría** — sin backend biométrico o con falla, la marcación sigue respondiendo.

## 7. Riesgos y rollback

- Riesgo: que el replay arrastre contenido ajeno → mitigado por las invariantes del spec con control de mutación (**6 derivas, 6 rojas**) y la compuerta de origen que compara cada blob contra `origin/desarrollo` con las 4 excepciones nombradas.
- Riesgo: que Producción cambie entre el freeze y el deploy → el manifiesto de alcance ancla `base_commits.main` y la compuerta lo verifica.
- Rollback: revert puntual del merge en `main` (replay inverso vía `git revert -m 1` o re-merge del padre), nunca un snapshot viejo del árbol; la marcación web no depende de los 3 blobs nuevos.

## 8. Evidencia y certificación exigida

- `docs/qa/evidence/hr-modulo-main-20261127/invariantes-replay.json` (37/37 contra el árbol commiteado `303f0725`, no contra el índice del worktree)
- `docs/qa/evidence/hr-modulo-main-20261127/controls/selftest-instrumento.json` (control de mutación, 6 derivas rojas) y `docs/qa/evidence/hr-modulo-main-20261127/suites-candidato.txt` (api 46/46, portal 185/185, portón 4/4, build salida 0, con las rutas del puesto limpiadas)
- `docs/qa/evidence/hr-modulo-main-20261127/equivalencia-blob-candidato.json` y `equivalencia-lock-biometrico.json`
- Evidencia funcional de campo en QA (Nyvora, paquete desplegado): `docs/qa/evidence/hr-alineacion-20261127/paquete-qa-desplegado/qa-campo-escritura.json`
- Manifiestos `docs/qa/manifests/hr-modulo-main-20261127-scope.json` y `-approval.json`

## 9. Notas de gobernanza

- El transporte es por ascendencia (`certified_commit` ancestro del candidato, registrado con un merge `-s ours` que no cambia un byte del árbol) con **4 waivers nominales** para las rutas de fusión a tres vías; `replay_puntual` está reservado para destinos sin contenido propio que conservar, y ese modo prohíbe cualquier waiver.
- El instrumento `promotion-migration-check.js` aprendió la cuarta invariante (`insert`) en `desarrollo` (`e61608f6`): el replay de una fusión a tres vías declara línea por línea lo que agrega y una sola línea eliminada lo rompe.
## 10. Resultado del candidato y errores declarados de esta intervención

Medido sobre `303f0725` (rama auxiliar `codex/qa-hr-modulo-main-20261127`, base `origin/main` `91d43c79`):

- Inventario: **53 rutas** (41 de producto e instrumentos + 12 documentales), **14 altas / 27 modificaciones / 0 borrados**.
- Origen: **37/41** blobs idénticos a `origin/desarrollo`, **4** vías de fusión con waiver nominal, **0** rutas sin blob en `desarrollo`.
- Compuertas: `qa:promotion:scope` y `qa:approval:evidence` **en verde** sobre la punta final del candidato; invariantes **37/37**; selftest **6/6 rojas**; suites **46/46**, **185/185**, **4/4**; `next build` **salida 0**.
- Campo QA: **27/27 APROBADO** sobre el binario desplegado `a440560d7f04` (NYVORA).

Tres errores propios, declarados aquí y corregidos en el mismo cierre:

1. **Dejé fuera del candidato una ruta que no era mía dejar fuera.** Excluí `apps/web/lib/api.ts` por telemetría y el rojo del punto D mostró que ahí vive la compuerta que impide que el respaldo de Supabase escriba donde la API rechazó. El hallazgo no venía del diseño: lo trajo el arnés, y se corrigió con la cuarta vía de fusión.
2. **El selftest viajó viejo.** El candidato llevaba el test con cinco derivas mientras el instrumento ya inyectaba la sexta, es decir un verde que no podía fallar por esa vía. Alineado por blob en `303f0725` y re-medido.
3. **Escribí evidencia con datos de otra intervención.** `invariantes-replay.json` salió con el contenido de una corrida del 2026-11-24 (el `--output` del instrumento rechaza pisar evidencia, pero el copiado manual sí la pisó). Regenerado contra el árbol commiteado y verificado.

Sigue pendiente, con dueño y decisión:

| Pendiente | Responsable | Decisión |
|---|---|---|
| Aplicar las 3 migraciones biométricas en Producción (ledger de solo lectura antes y después) | db-nube + performance, con el dueño | Autorización ya otorgada dentro de la orden de migración |
| Redeploy de `apexos-api-prod` y `apexos-web-prod` y verificación por artefacto servido | performance + qa | Proceder tras el merge |
| Re-medición de rechazos de foto en Producción con `--days=7` para tener denominador | qa | Repetir con jornada completa |
| Retiro alterno de la compuerta de marcación web en `develop`/`main` | dueño | Provisional: la web sigue marcando, según su orden expresa |
| Alinear Comercio M-30, facturas recibidas y torre con Producción | dueño | No es alcance de este portón |

## 11. Extensión ronda 2: las dos pantallas que no viajaron (medida el 2026-11-28T02:16Z, es decir 2026-11-27 21:16 -05:00)

El dueño preguntó si faltaban funciones en Producción. Medido, la respuesta es sí en dos rutas exactas, y no por el motor: por cómo se armó el inventario de la ronda 1.

**ANTES medido (no deducido):**

- Paridad por blob del núcleo de Talento Humano (65 rutas bajo `apps/api/src/modules/hr/**`, `apps/web/app/dashboard/talento-humano/**`, `apps/web/components/hr/**`, `apps/web/components/operations/PhotoCapture.tsx` y las 3 migraciones biométricas): **63 de 65 idénticas** contra `origin/desarrollo` y **63 de 65** contra `origin/develop`. Las 2 diferencias son **ausencias**, no versiones distintas: `apps/web/app/dashboard/talento-humano/rostros/page.tsx` y `apps/web/app/dashboard/talento-humano/dispositivos-marcacion/page.tsx` viven en `desarrollo` y en `develop`, y no están en `main`.
- El defecto es visible para el usuario: el hub de Talento Humano ya servido enlaza esas dos rutas desde `apps/web/app/dashboard/talento-humano/page.tsx:11-12` ("Celulares de marcación" y "Rostros registrados").
- Sonda sobre el binario desplegado (`b2012af2bc04`): `/dashboard/talento-humano` **200**, `/dashboard/talento-humano/rostros` **404**, `/dashboard/talento-humano/dispositivos-marcacion` **404**. El 404 es el control de que la medición puede fallar: la misma sonda devuelve 200 en el hub.
- Causa raíz: el inventario de la ronda 1 se construyó por **delta modificado** (lo que el frente cambió entre su base y `develop`), no por **existencia** de las rutas del módulo. Dos páginas que nacieron en otro commit del frente quedaron fuera del replay sin que ninguna compuerta lo advirtiera.

**Ronda 2 (esta extensión):**

- Transporte: `replay_puntual` **sin waivers** sobre la punta actual de `main` (`b2012af2bc04b316b3808c238583548aaaee1ea3`): cada ruta del candidato es blob-idéntica a `origin/desarrollo`. Sin fusión a tres vías: las tres fusiones de la ronda 1 quedan certificadas por su propio manifiesto y no se reabren.
- Inventario: **19 rutas** — 2 de producto (las pantallas) y 17 documentales (spec de la ronda 2, evidencia ANTES y de medición, invariantes, control de mutación, suites y build, equivalencia por blob, los 2 manifiestos y la actualización de brief y certificación). **0 borrados**, así que no hay `allowed_deletions`.
- Invariantes del replay: **36 de 36** válidas sobre el árbol commiteado (`docs/qa/evidence/hr-modulo-main-20261127/invariantes-replay-pantallas.json`).
- Control de mutación del instrumento: **6 de 6** derivas inyectadas quedan rojas (`controls/selftest-instrumento-pantallas.json`); el replay limpio da 5/5 verdes, así que el rojo es del defecto y no del arnés.
- Regresión: suite `apps/web/test/hr-*.test.mjs` **185/185**. Declaración honesta: **ninguna prueba del portal toca las dos rutas** (buscar `rostros` o `dispositivos-marcacion` en `apps/web/test/*.mjs` devuelve vacío), así que 185/185 prueba que no se dañó lo demás, no que las pantallas funcionen. Eso lo prueban el build y el artefacto servido.
- Build de producción sobre el árbol candidato: **salida 0**, 154 rutas en el manifiesto, y las dos pantallas aparecen **prerenderizadas** (`○` estático con su `.html`).
- `apps/api/**` no entra en el delta de esta ronda (0 rutas), por eso las 46 pruebas apuntadas del API no se re-corren: corrieron 46/46 sobre el mismo árbol de backend en la ronda 1.

**Cuatro errores propios de esta extensión, declarados aquí:**

1. **Di por alineado un frente al que le faltaban dos rutas.** La ronda 1 cerró con "53 rutas, 0 funciones ajenas dañadas" y eso era cierto para lo que medí; lo que no medí fue la existencia. La compuerta de paridad por blob (`scripts` de esta ronda) cierra ese ángulo ciego y queda versionada como regla de `apexos-qa`.
2. **Edité después de promocionar el manifiesto que una evidencia ya cita.** Para listar las pantallas cambié `docs/qa/specs/hr-modulo-main-20261127.replay.json` a 36 carry; eso dejó la evidencia de la ronda 1 citando un spec cuyo inventario ya no cuadraba (las invariantes pasaban a 36/39 con 3 rojas porque los 3 `insert` ya habían aterrizado). Restauré el spec a su inventario certificado (34 carry + 3 insert, `git checkout fff98f1e~1 --`) y la ronda 2 llevó su propio spec. Un manifiesto que una evidencia cita se congela con esa evidencia.
3. **Cité mal una cifra del control de mutación.** Leí el JSON con campos que no existen y salieron `derivas: 0`; el instrumento decía 6. Releí el artefacto con sus claves reales (`controles_de_mutacion[]`, cada caso con `rotos: 1`) y esa es la cifra que viaja.
4. **Sellé los dos manifiestos con una hora del puesto que aún no llegaba** (`2026-11-28T02:40:00-05:00`, cuando el reloj del puesto marcaba las 21:32 -05:00 del 27: mezclé el sello UTC con el desplazamiento local). Corregido a `2026-11-27T21:35:00-05:00` con su `sello_utc` y su `nota_fecha` al lado, y el `change_id` conserva `20261128` porque las corridas sí se sellaron después de las 02:00Z del 28 en UTC. Es la misma familia de error que la ronda 1 declaró: la hora del puesto convertida a UTC se verifica, no se supone.

**Hallazgo de gobernanza (no es defecto del producto, y no se arregla dentro de este portón):** la CI de `main` corre `npm run governance:ci` y la copia del guardián que vive en `main` (`scripts/git-governance-guard.js`, función `assertGithubRef`) solo acepta un PR hacia `main` cuyo head sea `develop`, con una excepción fija del 2026-11-23 para una rama nominal. Por eso el check "Git Governance Guard" sale rojo en un PR desde rama auxiliar, aunque el candidato esté verde en las compuertas humanas (`qa:promotion:scope` + `qa:approval:evidence`) y el árbol sea idéntico. No metí la evolución del guardián en este commit: es otra disciplina (gobernanza) y un commit cuyo asunto nombra un módulo no puede cambiar otro. Queda como pendiente con dueño.
