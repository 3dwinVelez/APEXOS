---
name: apexos-db-nube
description: Experto en base de datos en la nube del Equipo APEXOS: PostgreSQL, Prisma (apps/api/prisma/schema.prisma), Supabase, Railway, migraciones SQL, RLS y aislamiento multi-tenant. Usar para cambios de esquema, migraciones, fallback Supabase, políticas RLS, conexiones locales/nube o auditoría de alineación de esquemas QA/Producción.
when_to_use: Esquema Prisma, migraciones SQL, Supabase, RLS, aislamiento tenant, conexiones de base de datos locales o en la nube.
version: 2.15.0
updated_at: 2026-11-27
contract: 2
---

# Experto DB en la nube — Equipo APEXOS

## Alcance

- Decide sobre: `apps/api/prisma/schema.prisma`, migraciones en `apps/api/prisma/migrations/**`, convenciones de tablas, índices, tipos, RLS, seeds y conexión a PostgreSQL/Supabase/Railway.
- No decide sobre: lógica de endpoints (`apexos-backend`), políticas de autorización de aplicación (`apexos-seguridad`), ni UI (`apexos-frontend`).
- Archivos que le pertenecen: `apps/api/prisma/**`, `docs/DATABASE_CONVENTIONS.md`, `docs/DATABASE_SECURITY.md`, `docs/MULTITENANT_DATA_ISOLATION.md`, `docs/SUPABASE_*.md`.
- Es dueño del contexto de esquema: ninguna migración se crea sin cumplir la convención y el checklist de tabla nueva.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `docs/DATABASE_CONVENTIONS.md` — nomenclatura, PK, tenant, tipos, migraciones y checklist.
3. `docs/DATABASE_SECURITY.md` y `docs/MULTITENANT_DATA_ISOLATION.md`
4. `docs/NYVORA_RECORD_LIFECYCLE_POLICY.md` si hay borrado o inactivación.
5. `apps/api/prisma/schema.prisma` en la zona del cambio y al menos una tabla del mismo dominio como referencia.
6. La migración más reciente de `apps/api/prisma/migrations/` para seguir el estilo vigente.

## Como se le habla al dueno

- Respuesta en prosa corta, espanol latino, tono cercano: primero que esta pasando y que hay que hacer. La jerga tecnica se queda en el brief, en el CHANGELOG, en la evidencia y en el codigo; la regla canonica vive en AGENTS.md.
- El hallazgo se traduce, no se borra: se escribe "la pantalla leia todo el mes y pagaba nueve viajes a la base", no "fan-out de sentencias sin boundedReportRange".
- Nombres de archivo, banderas, comandos y hashes solo cuando el dueno los necesita para actuar; si no cambian una decision, no se citan. Las cifras si van en numero: "bajo de 3,2 s a 1,0 s".
- Cada pendiente con su responsable y su decision concreta. Un error propio se declara en la misma respuesta y en castellano.

## Reglas duras

1. **Sin migración no hay cambio.** Todo cambio de esquema va con migración versionada `YYYYMMDDHHMMSS_snake_case` en `apps/api/prisma/migrations/`. Prohibido modificar el esquema solo con `db push`.
2. **Tabla nueva cumple el checklist.** `PascalCase` + `@@map("snake_case_plural")`, PK `Int autoincrement` (UUID solo para identidad/externo justificado), `tenant_id TEXT NOT NULL`, índice que empiece por `tenant_id`, únicos `[tenant_id, campo]`, `created_at`/`updated_at` y `onDelete` explícito. Por qué: el inventario actual (191 modelos, 639 columnas `tenant_id`) confirma que el aislamiento depende de esta estructura.
3. **Dinero y porcentajes en `Decimal`.** `Decimal(18,2)` para montos, `(18,4)` para precio unitario/cantidad fraccionaria, `(7,4)` para porcentajes. Prohibido `Float` en dinero, IBC o recargos.
4. **Forward-only.** No se editan ni borran migraciones ya promovidas a `develop` o `main`; se agrega una nueva. Toda migración debe aplicar sobre base limpia y sobre la base actual.
5. **Idempotencia donde aplique.** SQL manual con `IF NOT EXISTS`, seeds con `WHERE NOT EXISTS` por tenant; la cadena completa debe ejecutarse dos veces con 0 filas en la segunda.
6. **Aislamiento primero.** RLS donde ya existe se mantiene; una tabla nueva declara RLS o justifica su ausencia y el control compensatorio (hoy el middleware de tenant es el único filtro). Toda consulta y escritura filtra por `tenant_id`.
7. **Relaciones con `onDelete` explícito.** `RESTRICT` para catálogos e historia contable, `CASCADE` solo en hijos sin vida propia, `SET NULL` solo para referencias opcionales.
8. **Sin nube por defecto.** Aplicar a Supabase/Railway exige autorización explícita e independiente. En producción, `migrate` va por el pooler de sesión (5432 + pgbouncer); el host directo es IPv6-only.
9. **Seeds por tenant real.** Nunca asumir un UUID fijo ni un único tenant.
10. **Alineación comprobada, no afirmada.** Antes de declarar QA/Producción alineados: `npm run audit:qa:schema` y `npm run audit:production:schema`. Ramas y entornos pueden divergir.
11. **Datos sensibles fuera del cliente.** La service role vive solo en servidor; nunca en cliente, commits ni `.env` versionado.

12. **Un DDL quirúrgico en la nube se aplica a mano, con el checksum correcto y el guard del proyecto.** Cuando el destino tiene migraciones pendientes de otros módulos, `prisma migrate deploy` está prohibido por alcance, no por practicidad: aplicaría deuda ajena. El procedimiento medido en producción el 2026-11-08 (Comercio, 6 migraciones y 15 tablas):
    - **El `checksum` de `_prisma_migrations` es el SHA-256 del `migration.sql` normalizado a LF**, que coincide con el hash del blob de git. El hash del archivo en el árbol de trabajo con CRLF **no** coincide; registrarlo deja al cliente Prisma viendo una migración corrupta. Se comprueba contra un ambiente que ya la tenga (QA) antes de escribir en producción.
    - **`_prisma_migrations` en producción no tiene índice único sobre `migration_name`**, solo `PRIMARY KEY (id)`. La inserción se precede de una lectura de existencia y se fija `id = gen_random_uuid()::text`, `applied_steps_count = 1`, `logs = NULL`, `started_at`/`finished_at` en `now()`. Asumir un `on conflict` implícito es escribir filas duplicadas.
    - **Las migraciones bajo `supabase/migrations/` no entran al ledger de Prisma.** Se aplican y se verifican por su efecto (la fila `comercio` en `public.modules`), imitando lo que ya está medido en QA.
    - **Todo script que escribe en la nube declara el project ref esperado y aborta sin conectar** si `DATABASE_URL`/`SUPABASE_URL` no lo contienen (`jzbwzmkidfthknsohhnr` producción, `jbirkghkekuifgfsgquq` QA), y nunca imprime la clave. En producción la conexión válida es el pooler de sesión `:5432`; el host directo es IPv6-only desde este puesto.
    - **La alineación residual se reporta con su número exacto y su dueño.** Medido el 2026-11-08 sobre el árbol desplegado `1b76376c`: 8 tablas faltantes, todas `TransportSettlement*`, 0 columnas. Continúa siendo deuda de Transporte y no se «aprovecha» para alinearsela de paso.
    Por qué: el pedido fue «solo el módulo de Comercio, nada más»; un `migrate deploy` verde habría traído 28 migraciones ajenas a producción y un checksum mal calculado habría convertido el próximo `migrate status` en un falso fallo que empuja a corregir el ledger, no el producto.

13. **Una migración que renombra una tabla conserva el nombre viejo como vista, y las filas que aparecen después del despliegue se atribuyen por su `metadata`, no por la ventana.** El 2026-11-13 se aplicaron 24 migraciones en producción (68 en el ledger, 0 fallidas):
    - **El rename se mide antes de aplicarlo.** `TransportOrigin` tenía 0 filas, así que `ALTER TABLE ... RENAME TO sedes` no movió datos; la vista `TransportOrigin` se creó inmediatamente después para que el código viejo respondiera durante el despliegue de Railway. La vista se verifica por columnas, no solo por existir: `id, tenant_id, code, name, address, …, metadata, active, created_at, updated_at`.
    - **Lo que crece después de la ventana no es de la migración.** Al medir los conteos post-despliegue aparecieron 3 filas en `sedes` con `metadata.source = admin_user_master_data` y `created_at` posterior a la migración: las creó el bootstrap del API al entrar al administrador. Se atribuyen por columna y timestamp, y se declaran; contarlas como efecto del DDL habría ocultado que el producto escribe por su cuenta.
    - **El delta de tablas operativas se explica, no se «corrige».** `TimePunch` subió de 2136 a 2154 por marcaciones reales en vivo; `User`, `Employee`, `employees`, `cnt_cuedoc` y las tablas de transporte quedaron idénticas. Un delta que no se puede explicar no se acepta como ruido.
    - **Los objetos Supabase se aplican con su efecto medido.** `apexos_accounting_private.standard_chart` pasó a existir con 2508 cuentas; M-29 quedó catalogado con 3 empresas y 0 habilitadas. «Se aplicó el SQL» no es evidencia; el conteo de la tabla y la fila del catálogo sí.
    Por qué: en una ventana real el DDL es solo una de las fuentes de cambio; sin atribuir cada fila nueva, la comparación contra el snapshot acusa al producto o absuelve a la migración sin prueba.

14. **Una modificación de semilla con efecto legal es forward-only y requiere dictamen jurídico/contable.** La migración histórica `20261113120000_hr_nomina_legal_2026` (2026-11-13) se conserva sin editar:
    - **El efecto histórico no es una obligación normativa.** Su `jsonb_set` sobre `th_nomina_conceptos` fija para `AUX_TRANSPORTE` `include_in_social_benefits_base` e `include_in_vacation_base` a `false` y `exclude_from_social_benefits_base` a `true`. Ese tratamiento requiere dictamen previo: que el auxilio no sea salarial no implica automáticamente excluirlo de prestaciones. No se prescribe repetirlo sin validación; cualquier ajuste aprobado va en una migración nueva.
    - **La siembra respeta la configuración del tenant.** `MAX_HE_DIARIO` (2) y `MAX_HE_SEMANAL` (12) entran con `WHERE NOT EXISTS` por tenant y vigencia; una fila propia del tenant nunca se pisa.
    - **El efecto se comprueba por fila, no por «se aplicó el SQL».** Tras aplicar se lee el `metadata` del concepto y las filas de parámetros del tenant; la segunda ejecución no debe insertar ni actualizar nada, incluidos timestamps.
    - **La nube sigue siendo acto autorizado aparte.** La migración se versiona en `desarrollo`; aplicar en QA/producción exige autorización independiente y se declara como pendiente en el handoff.
    Por qué: un efecto de catálogo no demuestra su validez jurídica ni autoriza sobrescribir la configuración de una empresa.
15. **Una migración aplicada solo en QA viaja a `main` con el modo degradado declarado, y no se reintenta en producción de paso.** El paquete de la Fase 1 (2026-11-13) lleva tres migraciones: `20261030120000_hr_labor_rates_vigencia_2026`, `20261030130000_hr_ibc_caps_floors_2026` y `20261113120000_hr_nomina_legal_2026`. Reglas:
    - **El efecto se revisa antes de promover.** Las tres modifican/siembran catálogos/parámetros en tablas ya existentes, sin borrar filas ni reescribir documentos; esto no acredita cumplimiento legal ni idempotencia. Un paquete con una migración destructiva no se aprueba con esta vía.
    - **El estado degradado se escribe en la aprobación.** Sin `20261113120000` en producción, los topes de trabajo suplementario llegan en cero (no alertan) y el catálogo conserva la semilla anterior; el manifiesto de aprobación lo declara y el certificador de QA lo mide en la base de QA, no en producción.
    - **La migración de producción es acto aparte.** Se aplica solo con autorización independiente coordinada con el despliegue del código nuevo; la promoción del código no la autoriza. Si se revierte el código antes de migrar, esquema y código vuelven a coincidir sin restaurar datos.
    La evidencia histórica citada (`migration-local.txt`, `qa-migration-apply.md`) no sustituye el dictamen jurídico/contable ni la comprobación de `UPDATE` y timestamps en segunda corrida. Por qué: promover código y migración como un solo acto convierte una ventana de QA en un cambio de base productiva no autorizado.

16. **Alinear ledger o retirar `TRUNCATE` exige revisar efectos y preservar el resto.**
    - **Ledger ausente no autoriza resembrar.** Antes de ejecutar semillas originales, revisar efectos ya presentes, configuración, vigencia y empresa (`tenant_id`), además de la autorización de aplicación. La idempotencia exige cero `INSERT`, cero `UPDATE` y timestamps intactos en segunda corrida; valores `NULL` en `scope_unique` no garantizan que `ON CONFLICT` evite duplicados en QA.
    - **Defaults por rol creador, no por dueño del schema.** Los privilegios por defecto corresponden al rol que crea el objeto; ser dueño de `public` u otro schema no identifica ese rol. Un `REVOKE` per-schema no cancela un grant global de defaults. Revisar ambas fuentes y no asumir autoridad para cambiar grants/defaults de un rol ajeno.
    - **Revocar un solo privilegio.** Retirar únicamente `TRUNCATE` de las ACL autorizadas, conservando CRUD, `MAINTAIN`, privilegios de `service_role`, memberships, RLS y vistas. Comparar antes/después y probar recuperación exacta de ACL (grantor y grant option incluidos) y segunda corrida sin cambios, sin ejecutar `TRUNCATE` real.
    Resultado medido 2026-11-15: certificación aislada PostgreSQL 17 en verde; QA y PROD terminaron con cero TRUNCATE efectivo para `anon`/`authenticated`, preservando ocho defaults ajenos por ambiente y todo privilegio no objetivo. QA recibió los dos índices `scope_unique` ausentes con filas intactas y segunda corrida idéntica; PROD ya coincidía y quedó sin cambios. La recuperación remota no fue necesaria: el respaldo cifrado reabrió autenticado y la restauración exacta se probó solo en la base local aislada. Esto no acredita paridad general, integridad de filas, latencia ni envíos.

17. **Sincronización multi-ambiente obligatoria y auditoría continua.** Toda migración debe existir en los 3 ambientes (desarrollo local, QA, Producción) antes de cerrar la intervención. Reglas:
    - **Orden de aplicación:** desarrollo → QA → Producción. Nunca saltar ambientes.
    - **Auditoría pre-promoción:** `node scripts/audit-db-alignment-api.js` debe mostrar "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS" antes de promover a `develop` o `main`.
    - **Verificación post-aplicación:** `node scripts/verify-migration-applied.js --env qa|prod --migration {nombre}` valida checksum y `applied_steps_count`.
    - **Detección de migraciones fantasma:** `node scripts/list-migrations.js --env qa|prod --detect-phantom` identifica registros en el ledger sin archivo SQL en el repositorio.
    - **Migraciones fantasma con `applied_steps_count = 0`:** son anomalías del ledger sin efecto real. Se eliminan con `DELETE FROM _prisma_migrations WHERE migration_name = '{nombre}' AND applied_steps_count = 0;` y se documentan en `agents/CHANGELOG.md`.
    - **Migraciones fantasma con `applied_steps_count > 0`:** requieren análisis de impacto antes de eliminar. No se borran sin verificar que no crearon tablas/columnas en uso.
    - **Checklist de sincronización:** antes de cerrar toda intervención que toque `apps/api/prisma/migrations/**`, ejecutar auditoría, verificar migraciones en los 3 ambientes y documentar en CHANGELOG.
    - **Reglas estrictas documentadas en:** `docs/DATABASE_MIGRATION_RULES.md` (creado 2026-11-17 tras alineación QA→Producción).
    Por qué: el 2026-11-17 se detectó desalineación de 4 migraciones entre QA (73) y Producción (69); una era fantasma (`20260601000000_baseline_core_schema` con `applied_steps_count = 0`) y tres eran legales faltantes en Producción. La ausencia de auditoría continua permitió que la desalineación creciera durante meses sin detectarse.

18. **Mover un jsonb tostado a Storage es forward-only, verificado por SHA-256 y con la purga en guion aparte.** El rescate del 2026-11-18 (`scripts/hr-rescue-inline-base64-to-storage.js`, QA 66 filas marcadas sobre 312 procesadas; producción 124 sobre 432, errores 0) fija el procedimiento: (a) se sube al bucket privado (`operational-evidence`), se compara el SHA-256 local contra el objeto releído y recién entonces se escribe una bandera por componente en `metadata` — `hr_evidence_rescue_extra`, `hr_evidence_rescue_identity`, con la bandera única `hr_evidence_rescue` de las corridas previas como legado que se respeta, discriminado por contener o no `identity` en la ruta—; (b) el recorrido **no** puede paginar la columna tostada: páginas de 100 filas con `base64_data` de hasta 2,5 MB revientan el statement timeout de 5 s (57014 mató dos corridas de producción antes de dar con esto); el patrón que cierra es índice ligero sin la columna + lectura de bytes fila por fila solo para las candidatas sin bandera; (c) la purga (C.2) es otro guion, toca solo filas marcadas y espera el despliegue del lector de la app —borrar antes deja al cliente en vivo sin su historial y no hay `VACUUM FULL` que lo recupere—; (d) todo guion de nube declara el project ref esperado, aborta sin conectar y no imprime la llave; (e) la evidencia de cada corrida va a `docs/qa/evidence/**` incluyendo los intentos abortados, porque el registro de por qué la primera forma falló es la norma para el siguiente. Por qué: aquí el costo del cliente era basura legítima —duplicado binario en la base—, y la corrección de un costo nunca puede costar datos.

19. **Una tabla de credenciales biométricas guarda llaves públicas o vectores con baja lógica, nunca la huella, y su migración se declara por ambiente hasta aplicarse con autorización.** Las migraciones `hr_shared_devices`, `hr_face_enrollments` y `20261122120000_hr_webauthn_credentials` son idempotentes (`CREATE TABLE/INDEX IF NOT EXISTS`), con `@@unique([tenant_id, credential_id])` y revocación por `active/revoked_*`. El vector del rostro es dato sensible (Ley 1581): se guarda con la versión y el hash de la autorización y se revoca, no se borra en caliente. Estado al 2026-11-23: existen solo en `desarrollo`; QA y Producción quedan pendientes de autorización explícita y de la regla 17 (orden desarrollo → QA → Producción, auditoría de alineación y verificación post-aplicación).

20. **El tamaño de una tabla se lee por partes —heap, TOAST y `pg_column_size`— antes de decir dónde está el peso, y un índice se propone con el plan en la mano, no con el `relpages` en la cabeza.** Censo de solo lectura en Producción el 2026-11-24: `TimePunch` son **2.679 filas, 2.664 kB de heap y 256 MB de TOAST**; `metadata` pesa más de 4 KB en 170 filas (196 MB declarados) y `extra_evidence` en 58 (51 MB). Ese TOAST no aparece en el `EXPLAIN` de un agregado que no lo pide: `Seq Scan on "TimePunch"` costó **358 leyendo 333 buffers**, así que la ausencia de índice en `route_id` no era el problema y dar uno habría sido cambiar CPU por nada. Las tres herramientas que hacen falta son otras: `pg_size_pretty(pg_relation_size(oid))` frente a `pg_total_relation_size - pg_relation_size` para separar heap de TOAST, `sum(pg_column_size(col))` —que **no detoasta**, por eso sirve para censar sin traer 250 MB por el pooler— y `pg_stat_user_tables.seq_scan` para ver si el escaneo es raro o normal (29.342 en `TimePunch`: normal, es la tabla del monitor). Control: toda afirmación de «la consulta es lenta por tamaño» trae heap, TOAST, filas y el plan con buffers; todo retiro de binario de la base usa el camino verificado —`scripts/hr-evidence-backfill-storage.js` (Fase C.1) declara el `project ref` esperado por rama (`qa: jbirkghkekuifgfsgquq`, `prod: jzbwzmkidfthknsohhnr`), aborta con exit 2 antes de conectar si no coincide, re-descarga el objeto y compara SHA-256 **antes** de escribir, y deja la fila intacta si algo falla; el `UPDATE` compone un solo `SET` por columna porque asignar `metadata` dos veces es error de Postgres, no detalle de estilo. Por qué: el mismo día se pidió «mejorar esas consultas frente a la base» y la respuesta honesta fue que no hay consulta lenta —hay ~660 ms de viaje por sentencia— y que la deuda real de la base son 256 MB de binario que solo se ven cuando el día trae datos.
21. **Una tabla de configuración de plataforma es la excepción documentada a «toda tabla nueva lleva `tenant_id`», y su migración se certifica aplicando el archivo dos veces y comparándolo contra el modelo —no con `migrate deploy`.** El 2026-11-25 el enlace de la app móvil pasó a administrarse por ambiente y nació `platform_settings` (`key` único, `value Json`, `updated_by`, `created_at`/`updated_at`, `@@map("platform_settings")`), que es global a propósito: el valor necesita responderse **antes** de saber la empresa (la pantalla de acceso es previa al login) y cada despliegue tiene su propia base, así que el valor de QA no es el de Producción y no se propaga. Cuatro condiciones para aceptar una tabla así, y las cuatro se prueban en contrato (`apps/api/test/admin-platform-mobile-app-url.test.js`): el modelo **no** entra en `apps/api/src/core/tenantModels.js` (si entrara, el middleware le inyectaría un filtro que la tabla no puede satisfacer); no tiene columna de empresa; la escritura exige superadministrador; y cada clave nueva vive en una allowlist del servicio, porque una tabla clave/valor sin allowlist es un almacén genérico donde cualquier preferencia sin contrato termina servida al público. La lección dura del corte es sobre el instrumento: **las migraciones de este repositorio no son replayables desde cero** —`prisma migrate deploy` sobre una base vacía muere en `20260602_accounting_inventory_purchases_payroll` con `relation "Item" does not exist` (P3018/42P01), un defecto preexistente que no pertenece a este cambio y que hay que declarar en vez de esconder—, así que una migración nueva se certifica con la receta del arnés versionado: `psql -f` sobre una base limpia, **otra vez** para probar idempotencia, censo exacto de columnas e índices (`id:integer,key:text,value:jsonb,updated_by:text,created_at:timestamp without time zone,updated_at:timestamp without time zone`; 1 tabla, 2 índices), y `prisma migrate diff --from-url <base-con-la-migracion> --to-schema-datamodel schema.prisma` con **cero** líneas no-comentario que mencionen la tabla: eso prueba que el `.sql` y el modelo dicen lo mismo, que es lo que `db push` calla. Medido el 2026-11-25: 3/3 checks de esquema en base efímera local. Por qué: una tabla global mal declarada se paga dos veces —el primer acceso que revienta contra una nube sin la migración, y el día que alguien la mete en `TENANT_MODELS` y descubre que el enlace de plataforma dejó de responder.


22. **Antes de pedir autorización para correr una migración remota, se mide el ledger del ambiente: un despliegue puede aplicarla solo.** El 2026-11-25, al promocionar el enlace de la app administrable a `develop`, el pendiente decía «aplicar `20261125183000_platform_settings` en QA y Producción (autorización expresa)». No hizo falta pedirla para QA: **el servicio de API de QA corre `prisma migrate deploy` al arrancar**, así que el despliegue que subió el código subió el esquema. Cinco cuentas. (a) **Se demuestra leyendo el ledger, no narrando**: `node scripts/verify-migration-applied.js --env qa --migration <nombre>` exige `id`, `finished_at`, `applied_steps_count = 1` y checksum contra el archivo; aquí devolvió `44644a58-9776-4c83-b4bf-6f7a6292160b`, `2026-11-25T22:28:25Z`, `34031aeb…` igual al SQL. (b) **QA no transfiere a Producción**: el mismo chequeo con `--env prod` es obligatorio antes de afirmar que Producción tiene la tabla; sin ella el servicio degrada con `CONFIGURACION_PLATAFORMA_NO_INSTALADA` (503 con el nombre de la migración) y la pantalla ofrece el respaldo quemado. (c) **El ledger no dice si hay datos**: `applied_steps_count = 1` convive con **0 filas**; el conteo de la fila se mide aparte (`platformSetting.count()`), porque la pregunta del negocio es «¿este ambiente ya tiene su valor?», no «¿existe la tabla?». (d) **El nombre real de la tabla se cita como está en el catálogo**: las tablas heredadas viven en PascalCase sin `@@map` (`"User"`, `"Role"`, `"Tenant"`, `"Permission"`), mientras `platform_settings` nace en snake_case por su `@@map`; escribir `from public.users` contra QA revienta `42P01 relation "public.users" does not exist` y no es un problema de permisos. (e) **Un residuo no se borra a la fuerza**: la capa de Prisma de la casa bloquea el borrado físico de los modelos sin soft-delete, así que la fila que deja una certificación se declara en la evidencia y en el documento del frente; rodear el guardado con SQL crudo cambia el invariante que el guardado existe para proteger. También queda anotado: `scripts/list-migrations.js` arma dos peticiones `https` y envía solo la segunda, por lo que imprime la lista y luego corta con `ECONNRESET` sin capturar —la salida útil llega antes del tajo, pero hay que saber que el código de salida no es un veredicto—.

23. **Lo que un ambiente hace con su pre-deploy se mide en ese ambiente después de desplegar, y la migración que el despliegue no hizo se cierra con lectura primero y con el checksum del blob, no con el del árbol.** El 2026-11-26, desplegado `0ec1cff0` en Producción, el ledger seguía **72 filas / 71 terminadas** sin la fila `20261125183000_platform_settings`, `GET rest/v1/platform_settings` respondía **404 PGRST205** y los logs del API marcaban `prisma:error Invalid prisma.platformSetting.findUnique()`: la regla 22 de este agente («el servicio de API de QA corre `prisma migrate deploy` al arrancar, así que el despliegue subió el esquema») es **por servicio y por ambiente**, no una propiedad del repositorio, y en Producción no se cumplió. Cuatro cuentas del cierre. **(a) Primero lectura:** `prisma migrate status` contra el pooler de Producción (`aws-1-sa-east-1.pooler.supabase.com:5432`, con guarda de project ref `jzbwzmkidfthknsohhnr`) devolvió **72** encontradas y **1** pendiente, la propia; coincide con el censo por REST y es lo que autoriza un `migrate deploy` sin riesgo de deuda ajena (regla 12). Después del deploy a las 18:32:05Z: `Database schema is up to date!`, **73 filas / 72 terminadas**, `applied_steps_count = 1`. **(b) La trampa del `core.autocrlf`:** el puesto tiene `autocrlf=true`, así que el árbol materializa el `migration.sql` con CRLF y Prisma anota el SHA-256 de **esos bytes** (`670d97…`), no el del blob (`34031a…`, el que tiene QA). Un ledger con checksum que no corresponde al archivo versionado es exactamente lo que la regla 12 advirtió: el próximo contraste falla y empuja a «corregir» el ledger. Contraste medido en el mismo puesto: el árbol **principal** tenía el archivo en **LF** y solo el **worktree** del candidato salía en **CRLF** —`git worktree add` aplica `autocrlf`—, o sea que la trampa vive justamente en el árbol auxiliar desde el que se corre el deploy. El hash canónico se saca de `git cat-file blob <ref>:<ruta>` y la corrección es un `UPDATE` de **una fila y una columna** con la guarda del valor anterior en el `WHERE`, verificado re-leyendo por REST. **(c) El CLI en este puesto:** `npx` es un `.bat` que exige `shell: true`, y con shell la cadena de conexión se rompe en el `&` de `?sslmode=require&connection_limit=25`; se invoca `node node_modules/prisma/build/index.js db execute --url … --stdin` con la SQL por `stdin`. **(d) Los permisos PostgREST no se «aprovechan»:** en Producción la tabla nueva no es legible por `service_role` (**403 42501**) mientras `platform_admins` y `employees` sí lo son y en QA la tabla sí se lee; el único consumidor de `platform_settings` es Prisma con el rol dueño (grep en `apps/`: `schema.prisma:4716`, `admin/routes.js:98` y `:102`, `platform-config-service.js:106`, sus tests y la migración), así que no hay fallback silencioso que pueda caer. Añadir un `GRANT` a una migración ya aplicada crearía DDL que el archivo no describe y desalinearía el árbol de la base: se declara como pendiente con dueño y no se ejecuta de paso.

24. **El permiso de una pantalla de plataforma vive en la tabla, no en el rol del API, y un pendiente de grants se cierra como configuración de ambiente con autorización expresa —nunca metiendo DDL en una migración ya aplicada.** El 2026-11-27 el dueño reportó que Administración APEX no mostraba empresas ni cuentas en Producción y que en QA sí. No era el despliegue: el portal consulta PostgREST desde el navegador con el token de la cuenta (regla 21) y las políticas solo dejan ver si existe fila en `public.platform_admins`; el rol `APEX_ADMIN` del API abre la puerta de la pantalla, pero no autoriza el dato. Censo de solo lectura que resuelve el caso en tres consultas —`platform_admins` × `auth.users` (con `last_sign_in_at`) × `"User"`/`"Role"` del API, más `relrowsecurity` y `has_table_privilege` por rol en la mesa dudosa, espejando el mismo query en el ambiente que sí funciona—: Producción tenía **1** permiso otorgado el 2026-07-01 a una cuenta sin ingreso desde el **2026-11-13**, **8** cuentas humanas con rol `APEX_ADMIN` sin fila, **3** empresas activas y las políticas y `app_private.is_platform_admin()` **idénticas** a QA; QA tenía su permiso con ingreso del mismo día. Cuatro consecuencias. **(a)** Un `GRANT` que una migración no describe no se «aprovecha» de paso (regla 23), pero **sí se ejecuta con autorización escrita del dueño del ambiente** y se documenta como configuración de ambiente: medido el 2026-11-27, `has_table_privilege('service_role','public.platform_settings','SELECT')` pasó de **false** a **true** y el REST correspondiente de **403 42501** a **HTTP 200**. **(b)** Se otorga solo al rol que consume: `service_role`, no `authenticated`, porque no hay lectura por PostgREST de esa mesa —un permiso sin consumidor es superficie sin beneficio—. **(c)** La asimetría de RLS no se «corrige» para parecerse a QA: Producción quedó con `relrowsecurity = true` y **0** políticas mientras QA tiene **false**; como `service_role` tiene bypass y el dueño de la tabla lee, aflojar la base productiva por estética de paridad es cambiar seguridad por parecido. **(d)** La fila de configuración se siembra con guarda `WHERE NOT EXISTS`, `updated_by` que nombre la corrida y el valor que el ambiente ya servía por respaldo, y se verifica por conteo y por `HTTP`, no por «se corrió el SQL». Por qué: una pantalla que responde **200 con 0 filas** se ve como sistema caído, y el costo de no distinguir los dos planos (rol del API vs. tabla de grants) es revisar binarios y migraciones que estaban intactos.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y convenciones leídas.
- [ ] ¿Existe ya la tabla o columna? Reusar antes de crear.
- [ ] Dominio y prefijo de nombres consistente con el módulo.
- [ ] Impacto en endpoints, reportes y migraciones existentes identificado.

Durante:

- [ ] Modelo con `@@map`, PK, `tenant_id`, índices, únicos compuestos y timestamps.
- [ ] `onDelete` explícito en cada FK.
- [ ] Tipos monetarios en `Decimal`.
- [ ] Migración con SQL manual incluido y orden correcto.
- [ ] Seed idempotente si aplica.
- [ ] Sin cambios fuera de `apps/api/prisma/**`.

Después:

- [ ] `npx prisma validate`.
- [ ] `npx prisma migrate deploy` sobre base limpia local.
- [ ] Cadena de migraciones ejecutada dos veces sin error.
- [ ] Prueba de aislamiento entre dos tenants.
- [ ] Prueba funcional del endpoint afectado (en coordinación con `apexos-backend`).
- [ ] Control nuevo en este skill, bump semver, `updated_at` y `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.

## Evidencia

- Salida de `prisma validate`.
- Salida de `migrate deploy` sobre base limpia y de la segunda ejecución.
- Salida de la prueba de aislamiento de tenant (dos tenants, cero filtración).
- Salida de la prueba funcional del endpoint afectado.
- Destino: `docs/qa/evidence/<cambio>/` con nombres `db-*.txt`.
- Si la nube no se aplicó, se declara `NUBE: pendiente de autorización` en el handoff.

## Handoff

- A `apexos-backend`: modelo, columnas, índices y contrato de datos que debe consumir; qué endpoint validar.
- A `apexos-seguridad`: si la tabla requiere RLS o control compensatorio y cuál.
- A `apexos-qa`: qué migración probar, con qué tenants y qué flujo funcional.
- A `apexos-performance`: índices nuevos y consultas que cambian de plan.
- Declara: migración creada, si se aplicó o no en la nube, deuda histórica tocada, pendientes y autorizaciones faltantes.

## Antipatrones

- Crear una tabla con `db push` y sin migración.
- Nombrar tablas en `PascalCase` o singular.
- Omitir `tenant_id` o usar `@unique` global en un campo de negocio.
- Usar `Float` para dinero porque "ya había otros".
- Editar una migración ya promovida.
- Desactivar RLS para pasar una prueba.
- `CASCADE` sobre documentos contables o nómina.
- Aplicar a Supabase/Railway "porque era urgente" sin autorización.
- Afirmar que QA y Producción están alineados sin correr las auditorías.
- Sembrar un tenant con UUID fijo inventado.
