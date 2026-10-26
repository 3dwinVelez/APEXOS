# Diagnostico de produccion — 500 en el monitor de mallas (adminsjc@apexos.local)

- Fecha del reporte: 2026-10-26
- Servicio intervenido: `apexos-api-prod` (proyecto Railway APEXOS PROD `0afe38cc-6080-49d2-aa24-2d5625250ac2`)
- Rama desplegada: `main` en `432f65aae7df42efab08e77df477ac4bbd501a9f`
- Usuario reportante: `adminsjc@apexos.local` (`"User".id = 221`), tenant SJ C `67a5dcb8-100b-4a44-b5db-d024f2e57450`

## Sintoma reportado

Banner rojo en `Talento Humano > Mallas`:

> Error 500 en /api/v1/hr/routes. Backend no disponible: {"error":"Error interno","code":"ERROR_INTERNO","request_id":"req-ycx"}

El listado del monitor si mostraba datos (103 horarios, 225 personas), lo que sugeria una caida
del backend que no existia. La prueba de control con la empresa modelo NYVORA no reprodujo nada.

## Evidencia de logs (Railway)

Tres errores no controlados, todos con el mismo patron, entre 01:25:48 y 01:27:45 UTC:

```text
2026-10-26T01:25:54.951Z [INFO] Unhandled API error err={"type":"PrismaClientKnownRequestError",
  "message":"Transaction API error: Transaction not found. Transaction ID is invalid, refers to an
  old closed transaction Prisma doesn't have information about anymore, or was obtained before
  disconnecting.","code":"P2028","clientVersion":"5.22.0"}
  requestId="req-ya1" url="/api/v1/hr/routes" method="POST" userId=221
  tenantId="67a5dcb8-100b-4a44-b5db-d024f2e57450"

2026-10-26T01:27:14.974Z [INFO] Unhandled API error err={"...","message":"Invalid
  `prisma.timeRoute.create()` invocation: Transaction API error: Transaction not found...",
  "code":"P2028","meta":{"modelName":"TimeRoute"}} requestId="req-yc7" url="/api/v1/hr/routes"
  method="POST" userId=221

2026-10-26T01:27:45.258Z [INFO] Unhandled API error ... requestId="req-ycx" url="/api/v1/hr/routes"
  method="POST" userId=221
```

Hallazgo clave: los tres 500 son **POST**, no GET. La lectura del monitor funcionaba; lo que fallaba
era guardar un horario.

## Verificaciones en base de datos de produccion (solo lectura)

| Verificacion | Resultado |
| --- | --- |
| Usuario `221` | `adminsjc@apexos.local`, tenant SJ C |
| Total de horarios del tenant | 103 |
| Ultimo horario creado | `2026-10-21T01:06:00.11Z` (id 152) |
| Horarios creados en la ventana del incidente | 0 — ninguna de las 3 escrituras persistio |
| Transacciones `idle in transaction` al revisar | 0 |
| Advisory locks activos al revisar | 0 |
| Resumen de `pg_stat_activity` | 1 activa, 24 idle, 1 de background |
| `DATABASE_URL` productiva | pooler Supabase `aws-1-sa-east-1:5432`, modo sesion, `connection_limit=25` |

El codigo de `listRoutes`, `createRoute`, `updateRoute` y `lockRouteAssignmentScopes` es identico
entre `main` y `desarrollo`, por lo que la diferencia no era de rama sino de concurrencia.

## Causa raiz

`createRoute` / `updateRoute` / `createRoutesBulk` ejecutaban su transaccion interactiva de Prisma
con el timeout por defecto (5 s) mientras `lockRouteAssignmentScopes` esperaba con
`pg_advisory_xact_lock`, que bloquea de forma indefinida. Cuando otra transaccion sobre la misma
persona y fecha tardaba en liberar el lock, Prisma abortaba la transaccion expirada y el
`tx.timeRoute.create()` siguiente fallaba con P2028, que el manejador global traducia a 500
`ERROR_INTERNO`.

Por eso NYVORA no lo reproducia: sin trafico concurrente sobre las mismas personas, el lock nunca
se disputa y la escritura resuelve en menos de 5 s. El tenant SJ C, con 225 personas y marcaciones
activas, si lo disputa.

## Impacto funcional sobre el cliente

El horario que el administrador intento guardar esa manana **nunca se creo**. No hay datos
corruptos ni duplicados, pero si trabajo perdido que debe volver a registrarse.
