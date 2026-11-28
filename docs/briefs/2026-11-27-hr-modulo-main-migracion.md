# Brief — Migración del módulo de Talento Humano de develop a Producción (main)

- **ID**: `2026-11-27-hr-modulo-main-migracion`
- **Fecha**: `2026-11-27`
- **Rama activa para implementación**: `desarrollo` (punta de trabajo `e61608f6`, con la extensión `insert` del instrumento de replay)
- **Prompt crudo**: "tu instruccion ahora es validar el modulo de talento humano con los cambios que se han realizado y migrarlo de manera correcta desde develop hasta el main, sin adulterar registros, dañar funciones agenas al cambio, se requiere que queden los 3 ambientes alineados con la version que ya tenemos trabajada en develop, monta el plan de migracion y con mi autorizacion procede a migrar todo el modulo de manera correcta. autorizado la migracion" · "ten en cuenta dejar para produccion provicionalmente la aplicacion de maracion mediante la web los demas cambios deben migrar de manera completa y sana" · "no dejes pendientes procede a terminar todas las instrucciones al pie de la letra"

## 1. Objetivo

Llevar a `main` el Talento Humano completo que ya sirve `develop` —incluido el frente biométrico (WebAuthn, rostros, dispositivos compartidos)— sin adulterar un solo registro de cliente, sin dañar funciones ajenas al cambio y **conservando en Producción la marcación por la web tal como funciona hoy**. El transporte es por replay controlado (nunca `merge` a lo ancho): 34 rutas viajan byte a byte desde `origin/desarrollo` y 3 rutas —el esquema Prisma, el `package.json` de la API y el lockfile— van por fusión a tres vías porque `main` conserva contenido propio de otros módulos.

## 2. Alcance exacto (36 rutas de producto)

| Invariante | Rutas | Qué viaja |
|---|---|---|
| `carry` (34) | `apps/api/src/modules/hr/*` (12 accesos de ficha, rostros, webauthn, dispositivos, identidad), `apps/web/app/dashboard/talento-humano/empleados/page.tsx`, `apps/web/components/hr/*`, `apps/web/lib/*` (3), `apps/api/test/*` (5), `apps/web/test/*` (3), migraciones Prisma (3), scripts/certificaciones (5), docs/qa | El frente biométrico completo que QA ya certificó en `develop`, tal cual se probó |
| `insert` (2) | `apps/api/prisma/schema.prisma` (+94), `apps/api/package.json` (+4) | Solo lo declarado línea por línea; el contenido propio de `main` (comentarios de Gastos Menores, modelos Invoice/Apex ajenos, dependencias de buzón) queda intacto |
| generado | `package-lock.json` (+153/−0) | Subárbol biométrico idéntico en versión e integridad a `origin/desarrollo`; cero dependencias de otros módulos |

Las 36 rutas de producto se certificaron **36/36** con la invariante nueva y su control de mutación de 5 derivas, y **34 blobs** son idénticos a `origin/desarrollo`; las 3 divergencias nominales son exactamente las 3 vías declaradas (`equivalencia-blob-candidato.json`).

### Módulos (`change_intent.modules`)

- `talento-humano`
- `base-de-datos` (migraciones biométricas)

### Borrados autorizados (`allowed_deletions`)

- ninguno. Ninguna ruta del candidato elimina un archivo del destino.

## 3. Fuera de alcance

No viajan en esta promoción (medido y documentado en la equivalencia por blob):

- Telemetría de cliente (`lib/api.ts`, `installationIdentity.ts`, `admin/public-routes.js`) y el buzón de adjuntos/facturas recibidas: frentes que solo viven en `desarrollo`.
- `apps/control-tower/**` (residencia solo en `desarrollo`).
- Comercio M-30, hors de esta ronda.
- El monitor de horarios en dieciséis horas y el rediseño de horarios/mallas (frente ajeno, no pedido).
- Nada que altere la marcación web: la pantalla, sus enlaces del hub y la casilla móvil siguen como están en Producción.

## 4. Restricciones

- Adulterar registros: prohibido. Cero `UPDATE`/`DELETE` sobre datos de clientes; las migraciones solo crean 3 tablas nuevas.
- Dañar funciones ajenas: prohibido y medido. Los 18 recortes internos del candidato respecto a `origin/desarrollo` (rutas con bajas de línea) se auditaron una por una en `equivalencia-blob-candidato.json`.
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

- Riesgo: que el replay arrastre contenido ajeno → mitigado por las 4 invariantes con control de mutación (5 derivas) y la compuerta de origen blobs contra `origin/desarrollo`.
- Riesgo: que Producción cambie entre el freeze y el deploy → el manifiesto de alcance ancla `base_commits.main` y la compuerta lo verifica.
- Rollback: revert puntual del merge en `main` (replay inverso vía `git revert -m 1` o re-merge del padre), nunca un snapshot viejo del árbol; la marcación web no depende de los 3 blobs nuevos.

## 8. Evidencia y certificación exigida

- `docs/qa/evidence/hr-modulo-main-20261127/invariantes-replay.json` (36/36)
- `docs/qa/evidence/hr-modulo-main-20261127/controls/selftest-instrumento.json` (control de mutación, 5 derivas rojas)
- `docs/qa/evidence/hr-modulo-main-20261127/equivalencia-blob-candidato.json` y `equivalencia-lock-biometrico.json`
- Evidencia funcional de campo en QA (Nyvora, paquete desplegado): `docs/qa/evidence/hr-alineacion-20261127/paquete-qa-desplegado/qa-campo-escritura.json`
- Manifiestos `docs/qa/manifests/hr-modulo-main-20261127-scope.json` y `-approval.json`

## 9. Notas de gobernanza

- El transporte es por ascendencia (`certified_commit` ancestro del candidato) con **waivers nominales** para las 3 rutas de fusión a tres vías; `replay_puntual` está reservado para destinos sin contenido propio que conservar.
- El instrumento `promotion-migration-check.js` aprendió la cuarta invariante (`insert`) en `desarrollo` (`e61608f6`): el replay de una fusión a tres vías declara línea por línea lo que agrega y una sola línea eliminada lo rompe.