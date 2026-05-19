# Seed operativo SCJ y Puebla

## Objetivo

El script `scripts/seed-scj-puebla-ops.js` crea escenarios practicos para validar flujos end to end en APEXOS hasta el 18 de mayo de 2026.

Comando:

```bash
npm run seed:ops
```

Para Supabase QA:

```bash
npm run seed:supabase:ops
```

El seed Supabase requiere que antes se aplique la migracion:

```text
supabase/migrations/20260518123000_operational_field_service_foundation.sql
```

## Organizaciones creadas

- `SCJ`
- `Puebla Operaciones`

Cada organizacion queda con:

- 100 referencias de servicio.
- 10 empleados.
- 5 tecnicos.
- 5 vehiculos.
- 5 rutas operativas con GPS.
- Marcaciones completas: entrada, almuerzo, retorno y salida.
- Casos de hora extra justificada.
- Servicios en estados: pendiente, en curso, inspeccion, ejecucion, cerrada, no ejecutada y cancelada.
- Evidencias de servicio y firma de cliente simuladas.
- Novedades operativas.
- Registros de auditoria del seed.

## Usuarios de practica

El script imprime en consola las credenciales demo al ejecutarse. Las cuentas siguen el patron:

- `admin@scj.qa`
- `scj-001@scj.qa` hasta `scj-010@scj.qa`
- `admin@puebla.qa`
- `puebla-001@puebla.qa` hasta `puebla-010@puebla.qa`

Las claves del seed son solo para ambiente local/QA de practica y no deben reutilizarse en produccion.

## Regla de usuario conectado

Marcaciones:

- La pantalla movil ya no permite seleccionar operario.
- La API resuelve el empleado desde el usuario autenticado.
- Si el cliente envia otro `user_name`, la API guarda el codigo del empleado conectado.

Servicios:

- La creacion de orden ya no muestra lista de tecnicos.
- Para usuarios tecnicos, la API asigna la orden al empleado conectado.
- Admin/coordinador puede seguir creando ordenes de gestion general.

## Hora extra MVP

Se clono la regla funcional del legacy:

- En cierre de jornada se compara la hora real contra el fin de ruta mas tolerancia.
- Si la marcacion supera el horario planeado, se calcula `extra_minutes`.
- Si hay minutos extra y no viene justificacion, la API responde `422 JUSTIFICACION_HORA_EXTRA_REQUERIDA`.
- No se calculan valores monetarios en este MVP.

## Dashboard dinamico

El inicio consulta datos reales de la organizacion:

- Servicios activos.
- Cumplimiento de servicios.
- Equipo en ruta.
- Marcaciones del dia.
- Evidencias.
- Novedades.
- Modulos activos.

No se muestran indicadores vacios cuando existe operacion sembrada.

## Validaciones realizadas

- `npm run seed:ops`: OK.
- `npx prisma validate --schema apps/api/prisma/schema.prisma`: OK.
- `npm --workspace apps/web run typecheck`: OK.
- Login local `admin@scj.qa`: OK.
- Consulta servicios SCJ: 8 ordenes.
- Consulta asistencia SCJ: 5 empleados con marcaciones.
- Tecnico `scj-001@scj.qa`:
  - cierre tarde sin justificacion: `422`.
  - cierre tarde con justificacion: OK.
  - `user_name` enviado como falso fue reemplazado por `SCJ-001`.

## Estado Supabase QA

Se preparo la migracion de tablas operativas y el seed REST para Supabase QA.

Tablas incluidas:

- `service_references`
- `service_reference_parts`
- `vehicles`
- `operational_routes`
- `route_assignments`
- `time_punches`
- `gps_pings`
- `service_orders`
- `service_incidents`
- `service_evidence`

El seed Supabase crea o reutiliza usuarios Auth para:

- `admin@scj.qa`
- `scj-001@scj.qa` hasta `scj-010@scj.qa`
- `admin@puebla.qa`
- `puebla-001@puebla.qa` hasta `puebla-010@puebla.qa`

Clave temporal QA:

```text
ApexOS-QA-2026!
```

Validacion pendiente:

- Aplicar la migracion SQL en Supabase QA.
- Ejecutar `npm run seed:supabase:ops`.
- Validar conteos por REST.

Bloqueo actual:

- `DATABASE_URL` aun apunta a base local `apexos`.
- Supabase QA responde `404` para las tablas operativas porque la migracion SQL no ha sido aplicada.
