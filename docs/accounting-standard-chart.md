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

Commit funcional en desarrollo: 3123f3349caf31bbcc23a77b9a315674362323ff.
Certificado de API/PostgreSQL repetido sobre ese commit exacto: 26 controles
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

El usuario pidió después no crear ramas y dejar la promoción preparada. Por ello
no se hace push, PR, merge, despliegue ni migración remota. El gate pre-QA conserva
la autorización de ejecución pendiente. Se prepara un objeto Git de integración
sin crear una rama: parte del baseline remoto y superpone solo las seis rutas del
manifiesto, con el commit de desarrollo como padre para conservar trazabilidad.
Su SHA y el resultado del gate de alcance se guardan en .tmp.

Antes de una integración futura hay que actualizar el target, recalcular el
inventario, repetir los gates y obtener una vía de PR permitida por el usuario.
QA debe certificar después el onboarding completo en la UI de plataforma con
Supabase Auth sobre el candidato desplegado, la copia automática de la sociedad
nueva y la persistencia visible de las sociedades existentes. Producción queda
fuera del alcance. No se aplicó la migración a ninguna base remota.
