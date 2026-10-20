# Plan estándar de sociedades — Cliente Piloto QA

Fuente confirmada por el usuario: Cliente Piloto QA, Supabase QA
`jbirkghkekuifgfsgquq`, sociedad `c56bc5df-c807-4deb-83f8-fbb4751be613`.
Extracción de solo lectura: 2026-10-20. La plantilla queda congelada en la migración
`supabase/migrations/20261020173515_standard_chart_piloto.sql`.
SHA-256 del arreglo JSON normalizado con JSON.stringify:
`a5eb53365e7d3d63b3c747df5b49785d5f53357b277698dc7194bc6b0aaecafe`.

## Comportamiento

- Sociedades existentes: completa las cuentas faltantes y repara padres ausentes y
  profundidad. Conserva IDs, nombres, tipos, estado activo, permite movimientos,
  cuentas propias y todas las referencias a movimientos.
- Sociedades nuevas: copia los siete campos del catálogo de 2.508 cuentas, con
  padres resueltos por código dentro de la sociedad destino. Se cubren INSERT en
  `companies` y en `Tenant`, incluyendo el registro local y el espejo Supabase.
- Se incluyen literalmente los auxiliares `130505HEART` y `220505HEART`, con sus
  nombres QA, porque el alcance solicitado es el catálogo de la sociedad fuente.
- No se copian saldos, asientos, terceros, usuarios, IDs de origen ni credenciales.
- Los cambios posteriores de Cliente Piloto QA no alteran automáticamente el
  estándar; requieren una nueva versión revisada.
- Las diferencias existentes de tipo o padre no nulo bloquean la transacción.
  La API devuelve 409 STANDARD_CHART_CONFLICT sin sobrescribirlas.
- La inicialización explícita conserva el contrato de respuesta de cuentas y
  utiliza la misma función, en lugar del listado básico de 28 cuentas.

## Instalación y permisos

La migración debe aplicarse transaccionalmente, por el rol propietario usado por
el backend, ANTES de publicar la API que llama a la nueva función. No basta con
`prisma db push`: este SQL versionado pertenece al directorio de Supabase.
No ejecutar esta migración en remoto sin autorización independiente.

El esquema privado no se expone por Data API ni concede USAGE a PUBLIC.
La tabla tiene RLS sin políticas para clientes. La función de aplicación es
SECURITY INVOKER, sin EXECUTE para PUBLIC. Si el propietario de migraciones y el
rol PostgreSQL del backend son distintos, la promoción queda bloqueada hasta
definir y validar sus permisos mínimos; no conceder acceso a anon/authenticated.

Solo el trigger es SECURITY DEFINER: search_path vacío, objetos calificados,
EXECUTE revocado a PUBLIC y destino ligado a NEW.id. INSERT sigue sujeto a la
autorización existente de la tabla. Nunca acepta un tenant indicado por el cliente.
Diseño contrastado con la [documentación oficial de funciones](https://supabase.com/docs/guides/database/functions).

La migración completa todas las sociedades de companies y Tenant en una sola
transacción. Revisar previamente el inventario del ambiente y disponer de backup.
La comparación de QA de solo lectura del 2026-10-20 no encontró conflictos de tipo
ni de padre con la fuente. Esto no sustituye la comprobación sobre el candidato
y el estado remoto exactos al momento de una promoción.

## Certificación reproducible

```powershell
node scripts/certifications/accounting-standard-chart-local.js
node --test apps/api/test/accounting-chart-tree.test.js apps/api/test/puc-colombia-catalog.test.js apps/api/test/accounting-opening-balances.test.js apps/api/test/accounting-numbering.test.js apps/api/test/accounting-routes-contract.test.js
```

El primer script crea una base nueva en el contenedor LOCAL infra-postgres-1.
Copia únicamente el esquema local, incorpora las definiciones versionadas de
plans/companies y aplica la migración real. No acepta conexiones remotas.
Comprueba backfill, alta de sociedades, igualdad de los 2.508 registros, IDs de
padres locales, inactivas, cuentas propias, movimientos conservados, concurrencia,
rollback, permisos SQL, API real, RBAC y aislamiento. También ejecuta por HTTP
la certificación existente de árbol PUC y auxiliares. No usa mocks de persistencia.

Evidencias generadas en .tmp, excluidas de Git:

- accounting-standard-chart-certification.json: resultados y hashes del código.
- accounting-standard-chart-tree-regression.json: regresión HTTP del árbol.
- accounting-standard-chart-regression.log: salida de las pruebas seleccionadas.
- accounting-standard-chart-browser-certification.json: ocho comprobaciones
  observadas en el navegador con login real, edición, recarga, reapertura y
  rechazo visible 403 para CERT_VIEWER.
- accounting-standard-chart-browser-initial.png,
  accounting-standard-chart-browser-final.png y
  accounting-standard-chart-browser-readonly.png: capturas de la UI local.

Las bases y roles sintéticos quedan identificados en la evidencia, sin eliminar
datos automáticamente. La base local original se lee solo para obtener su esquema.
La prueba de rol de solo lectura usa CERT_VIEWER; APEX_ADMIN conserva por diseño
el bypass administrativo y no sirve como fixture negativo.

## Recuperación y límites

Ante fallo de la migración, abortar la transacción. Ante rollback posterior,
desactivar los dos triggers mediante un cambio revisado y restaurar el código
anterior sobre el HEAD actual. Conservar las cuentas creadas: podrían tener
movimientos nuevos. No restaurar árboles históricos ni borrar cuentas masivamente.

## Resultado local y preparación de promoción (2026-10-20)

Implementación inicial en desarrollo: 3123f3349caf31bbcc23a77b9a315674362323ff.
Certificado de API/PostgreSQL: 26 controles
aprobados; el certificado HTTP del árbol y auxiliares aporta otros 16 controles.
Las 23 pruebas seleccionadas y el typecheck del frontend terminaron correctamente.
La prueba visual CUA verificó login, 2.508 cuentas, búsqueda jerárquica,
inicialización sin duplicados, guardar/reabrir/recargar, restauración del dato
sintético y el rechazo visible 403 de CERT_VIEWER.

La evidencia visual es complementaria y declara su vínculo por bytes con el
commit funcional: el servidor local se inició antes de crear el commit sobre los
mismos archivos. No se presenta como un despliegue de QA ni un script autónomo de
navegador. Un intento de ejecutar un módulo de automatización de navegador no
resultó estable; se retiró ese módulo y se ejecutaron las acciones directamente
mediante CUA. No se ocultaron los fallos de automatización ni se cambiaron
expectativas funcionales para lograr aprobación.

Baseline remoto consultado: develop
2f674b3b4bebfbe815fae8289bb9f5cd60ca2d08.
Hay 12 archivos ajenos al plan de cuentas entre desarrollo y ese baseline,
principalmente documentación/infraestructura de PDF y una página de privacidad.
No se autoriza su inclusión ni una promoción de la rama completa.

El usuario autorizó expresamente la rama codex/qa-plan-cuentas-20261020, el PR,
la integración y la migración exclusivamente a QA el 2026-10-20, tras resolver
la instrucción previa de dejar preparada la promoción. Producción no está autorizada.
El baseline actual se conserva y se reconstruye únicamente el cambio puntual;
el commit reconstruido se registra también como ancestro de desarrollo, sin
reescribir historia ni incluir los 12 archivos ajenos.

### Atestación portable de evidencia local

Este informe redactado resume evidencia ejecutada; los logs, capturas, respaldo y
credenciales quedan fuera de Git. Los manifiestos vigentes son
accounting-standard-chart-20261020-scope.json y
accounting-standard-chart-20261020-preqa.json. Su certified_commit identifica el
commit puntual reconstruido y recertificado, no un snapshot de una rama antigua.

- Script versionado de API/PostgreSQL real: 28 controles aprobados al añadir el
  ensayo con la extracción de QA (2872 cuentas, 9 companies, 23 Tenant).
- La extracción se obtiene con SELECT, se guarda localmente y se incorpora solo
  a una base aislada nueva. Se verificó conservar todos los campos de negocio y
  todos los padres ya existentes. Los 113 movimientos de QA se registran mediante
  digest previo para comprobarlos después; no se copian ni modifican remotamente
  durante el ensayo.
- Regresión HTTP versionada del árbol/auxiliares: 16 controles aprobados.
- Unitarias/contratos contables seleccionados: 23/23 aprobados.
- Typecheck del frontend: exit 0.
- CUA, acciones reales desde la UI: ocho comprobaciones aprobadas sobre login,
  2508 cuentas, búsqueda/ancestros, inicialización idempotente, edición/guardar,
  recargar/reabrir, restaurar y denegación 403 para CERT_VIEWER.
- Seguridad local: esquema privado sin USAGE público, tabla con RLS, función
  invoker sin EXECUTE público, trigger definer de destino NEW.id, search_path
  vacío; negativas SQL y API de rol y tenant aprobadas.
- El rol configurado de API QA es postgres.jbirkghkekuifgfsgquq y el proyecto
  Supabase configurado coincide con jbirkghkekuifgfsgquq.

Antes de ejecutar la publicación se repiten los gates sobre el commit puntual y
el target remoto vigente. La migración se aplica antes de activar la nueva API.
QA debe comprobar el onboarding UI/Supabase Auth del candidato desplegado, la
copia automática de la sociedad nueva y la persistencia visible de las existentes.
Esta atestación pre-QA no acredita pruebas remotas todavía ni autoriza main.
