# Optimizacion modulo Talento Humano - Eliminacion de redundancia y optimizacion visual

## Cambios realizados

### 1. page.tsx (Dashboard TH) — Monitor redundante eliminado
**Antes**: 369 lineas, 4 llamadas API en paralelo + polling 30s + sidepanel de timeline con evidence images, GPS, observaciones — **exactamente la misma funcionalidad que rutas/page.tsx**.

**Despues**: 57 lineas, solo 2 llamadas API ligeras al montar (employees + vehicles para el banner de validacion). Sin polling, sin operations-map, sin timeline. Funciona como hub de acceso rapido a las 6 sub-paginas del modulo.

**Impacto**: -305 lineas de codigo duplicado, -4 llamadas API por carga/polling, menos datos transferidos.

### 2. mapa/page.tsx — Optimizacion visual y de rendimiento
- Cuadricula de tiles reducida de 9x7 (63 tiles de 256px) a 7x5 (35 tiles)
- Sidebar reducida de 320px a 280px
- Altura maxima del sidebar en mobile reducida de 42vh a 35vh
- Espaciado de metricas compactado (gap-1.5 en vez de gap-2)

### 3. api.ts — Consistencia de code de empleados
- `/api/v1/hr/routes` fallback: se cambio prioridad de derivacion de empleados para que use `metadata.code` primero, consistente con `/api/v1/hr/me` y `/api/v1/hr/employees`

## Archivos modificados
- apps/web/app/dashboard/talento-humano/page.tsx (reducido 86%)
- apps/web/app/dashboard/talento-humano/mapa/page.tsx (tiles 7x5, sidebar 280px)
- apps/web/lib/api.ts (orden code en rutas)

## Incidente demo04 - marcaciones lentas y monitor sin actualizar

Fecha de validacion: 2026-07-10.

### Sintomas

- La pantalla movil de marcacion tardaba mas de lo necesario antes de registrar una marca.
- El monitor en vivo podia no asociar la huella GPS o la ultima marca con la persona correcta.
- Algunos empleados autocreados quedaban visibles como `usuario-###` en lugar del alias operativo real.

### Causa raiz

- `marcacion/page.tsx` esperaba un ping manual a `/hr/gps/ping` dentro de `refreshGps()` antes de enviar `/hr/time-punches`. Esa llamada era redundante porque la marcacion ya genera su propia huella GPS transaccional.
- El fallback Supabase de `operations-map` no correlacionaba consistentemente `employee_id`, `user_id`, `user_name`, email y metadata; por eso una marca/ping podia quedar escrita pero no aparecer en el monitor.
- El backend Prisma priorizaba codigos genericos `usuario-###` sobre `user.name` o el alias enviado por la pantalla movil.

### Correccion

- El ping manual de presencia quedo como fire-and-forget; la marcacion solo espera GPS local y la escritura de la marca.
- `operations-map` y `attendance` en fallback Supabase filtran por fecha operativa America/Bogota y correlacionan identidades por `employee_id`, `user_id`, `user_name`, email y metadata.
- El servicio HR usa una resolucion comun de identidad para evitar aliases genericos en marcaciones, actividades, GPS y monitor.

### Evidencia funcional

Caso local `demo04@apex.local`, ruta 8:

- Marcaciones: `entrada`, `inicio_almuerzo`, `fin_almuerzo`, `salida`.
- Cada marcacion conserva GPS y `user_name: demo04`.
- Evento operativo con evidencia `image/png` deja huella GPS adicional.
- Asistencia devuelve 4 marcas y `next_type: null`.
- Jornada queda cerrada (`session_active: false`).
- Monitor en vivo muestra `demo04`, `online: true`, `footprint_source: live`, `last_punch_type: salida`.
- Resumen de ruta: 4 `punch_points`, 1 `activity_point`, 5 `gps_pings`, 1 persona online y con GPS.

## Regresion produccion Supabase - usuario demo04 no visible

Fecha de diagnostico: 2026-07-10.

### Sintomas observados en Railway

- El mapa mostraba una persona asignada como `USR-1783623776426`, pero sin GPS.
- La marcacion movil mostraba `demo04` y permitia avanzar en marcas, pero indicaba que no habia horario asignado.
- El monitor administrativo del horario no mostraba marcaciones ni actividades.
- Una actividad con evidencia se guardaba desde movil, pero no aparecia en reportes ni trazabilidad.

### Causa raiz adicional

- En produccion Supabase, la ficha operativa puede existir como empleado `USR-...` mientras el usuario autenticado opera como `demo04`. El fallback buscaba empleado solo por `user_id`; si la ficha no estaba enlazada, creaba una identidad virtual y las marcas quedaban bajo otro alias.
- `/hr/me` no devolvia `document_number` ni aliases suficientes para que la pantalla movil encontrara horarios asignados por codigo/documento.
- La lectura fallback de `/hr/attendance` devolvia datos incompletos para reportes: no incluia `employee_id`, `user_id`, fecha, ruta, GPS ni extras.
- No existia lectura completa de `/hr/work-activities` desde Supabase; las actividades se guardaban como `gps_pings.source=work_activity`, pero reportes no las recuperaban.
- El monitor solo asociaba eventos con `route_id` explicito; si una marca/actividad nacia sin ruta por no detectar horario en movil, quedaba huerfana.

### Correccion aplicada

- `currentSupabaseEmployee()` ahora reconcilia por `user_id`, email, nombre, documento, codigo y metadata antes de usar empleado virtual.
- Marcas, actividades y pings guardan `identity_aliases`, `supplied_user_name`, `employee_code`, `employee_name` y email operativo.
- Si movil no envia `route_id`, el fallback infiere el horario activo del dia por asignacion y aliases del empleado.
- `operations-map` asocia eventos sin ruta explicita cuando coinciden con la persona asignada al horario.
- `/hr/attendance` devuelve contrato completo para reportes y trazabilidad.
- `/hr/work-activities` GET lee actividades/evidencias desde `gps_pings.source=work_activity`.
- Marcacion movil y reportes cruzan datos por aliases, no solo por igualdad exacta de `user_name`.
