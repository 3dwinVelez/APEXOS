# Modulo Transporte - TMS integral

## Objetivo

Administrar la necesidad de mover mercancia desde un documento ERP hasta la entrega, evidencia, liquidacion y cierre del viaje, conservando trazabilidad por empresa.

## Limites de dominio

- ERP es propietario de clientes, pedidos, productos, inventario, proveedores y contabilidad.
- Flota es propietaria de la ficha y habilitacion documental del vehiculo.
- Talento Humano es propietario de empleados, jornadas y marcaciones.
- TMS es propietario de atributos logisticos, puntos de entrega, necesidades, viajes, paradas, eventos, POD y liquidaciones.
- `TimeRoute` y `TransportTrip` no son intercambiables. Pueden vincularse en una fase posterior mediante identificadores, sin compartir estados.

## Flujo MVP

```text
ORIGEN + PUNTO DE ENTREGA -> NECESIDAD -> CONSOLIDACION -> EVALUACION TARIFARIA
-> RUTA OPTIMIZADA -> PLANIFICADO -> ASIGNADO -> EN CARGUE
-> DESPACHADO -> EN TRANSITO -> ENTREGA/POD -> LIQUIDACION -> CERRADO
```

Una necesidad sin peso, volumen, coordenadas o ventana queda `incompleta` y expone `validation_errors`. No puede incorporarse a un viaje hasta completar los datos.

## Estados del viaje

| Estado | Transiciones permitidas |
| --- | --- |
| borrador | planificado, cancelado |
| planificado | ofertado, asignado, cancelado |
| ofertado | asignado, cancelado |
| asignado | en_cargue, cancelado |
| en_cargue | despachado, cancelado |
| despachado | en_transito |
| en_transito | entregado |
| entregado | cerrado |
| cerrado/cancelado | ninguna |

El cierre requiere liquidacion aprobada. La entrega requiere que todas las paradas tengan resultado terminal.

## Controles implementados

- `tenant_id` obligatorio y filtrado transversal para todas las entidades TMS.
- RBAC `transport:read` y `transport:write` en API e interfaz.
- Coordenadas registradas como pareja y validadas por rango.
- Fechas de demanda consistentes.
- Planeacion exclusiva de necesidades completas y pendientes.
- Consolidacion sugerida por origen, servicio, tipo de vehiculo y fecha limite.
- Secuenciacion de paradas por proximidad con distancia geodesica y factor vial auditable.
- Comparacion de alternativas contractuales por costo, prioridad o puntaje del transportador.
- Tarifarios inmutables despues de publicados, con version, vigencia y sustitucion controlada.
- Desglose de cargo base, distancia, peso, volumen, paradas, peajes, combustible y minimo.
- Validacion de capacidad por peso y volumen.
- Bloqueo de vehiculos sin habilitacion documental.
- Bloqueo de conductor no disponible o con licencia vencida.
- Maquina de estados sin saltos.
- Bitacora de eventos con actor, fuente, fecha, parada, coordenadas y datos.
- POD obligatorio para entrega completa o parcial.
- Costos estimado, comprometido y real separados.
- Cierre condicionado a liquidacion aprobada.
- Maestros inactivables y transacciones historicas preservadas.
- Tracking GPS por lotes de hasta 200 posiciones, idempotente por dispositivo y evento de cliente.
- Consulta cronologica de tracking por viaje con filtros de fecha y limite controlado.
- Registro auditable de llegada y salida por parada, desde torre operativa o dispositivo movil.
- Deteccion y trazabilidad de posiciones simuladas, precision, velocidad y bateria.
- Configuracion central por empresa para unidades, zona horaria, factor vial, retencion GPS, app movil y notificaciones.
- Ordenes logisticas sobre la necesidad TMS, con detalle, edicion preplaneacion, cancelacion controlada, tracking, POD e importacion CSV validada.
- Monitoreo cartografico OpenStreetMap con señal de flota, ETA, siguiente parada, geocercas y alertas por telemetria.
- Registro durable de notificaciones manuales y automaticas para despacho, entrega y rechazo, con cola de correo opcional.
- POD avanzado con carga real de foto y firma a MinIO, inspeccion binaria, limite de 2 MB, referencias seguras, cantidades parciales, filtros y KPIs de primer intento.
- Las evidencias se visualizan mediante enlaces temporales de cinco minutos y validacion estricta del tenant.
- El monitoreo usa Turf.js para distancia geodesica, geocercas circulares o GeoJSON y desviacion contra el corredor planificado; sin geometria conserva compatibilidad con los viajes existentes.
- Rechazos, cliente cerrado, direccion incorrecta y averia exigen causa, responsable, fotografia y reintento futuro; cada parada conserva su historial de intentos y costos.

## API local

- `GET /api/v1/transport/control-tower`
- `GET /api/v1/transport/monitoring/live|fleet`
- `GET /api/v1/transport/notifications`
- `POST /api/v1/transport/notifications/send`
- `GET /api/v1/transport/pod|pod/stats|pod/:id`
- `POST /api/v1/transport/trips/:tripId/stops/:stopId/evidence`
- `GET /api/v1/transport/evidence/view?reference=...`
- `GET|PUT /api/v1/transport/config`
- `PUT /api/v1/transport/config/mobile|notifications`
- `GET|POST|PUT /api/v1/transport/carriers`
- `GET|POST|PUT /api/v1/transport/drivers`
- `GET|POST|PUT /api/v1/transport/delivery-points`
- `GET|POST|PUT /api/v1/transport/origins`
- `GET|POST|PUT /api/v1/transport/rate-cards`
- `POST /api/v1/transport/rate-cards/:id/versions`
- `POST /api/v1/transport/rate-cards/:id/activate|deactivate`
- `GET /api/v1/transport/planning/workbench`
- `POST /api/v1/transport/planning/evaluate`
- `POST /api/v1/transport/planning/commit`
- `GET|POST /api/v1/transport/needs`
- `GET|POST|PUT|DELETE /api/v1/transport/orders`
- `POST /api/v1/transport/orders/import`
- `GET /api/v1/transport/orders/:id/tracking|pod`
- `GET|POST /api/v1/transport/trips`
- `POST /api/v1/transport/trips/:id/assign`
- `POST /api/v1/transport/trips/:id/transition`
- `POST /api/v1/transport/trips/:id/events`
- `POST /api/v1/transport/trips/:tripId/stops/:stopId/attempts`
- `POST /api/v1/transport/trips/:tripId/stops/:stopId/arrive|depart`
- `GET /api/v1/transport/trips/:id/tracking`
- `POST /api/v1/transport/mobile/gps/batch`
- `POST /api/v1/transport/trips/:id/settlements`
- `POST /api/v1/transport/settlements/:id/approve`

## Siguientes incrementos

1. Tendering y aceptacion de transportadora.
2. Motor cartografico vial con trafico, ventanas y VRP de mayor escala.
3. Geocercas, ETA y alertas por excepcion sobre la telemetria GPS ya persistida.
4. Devolucion fisica y financiera.
5. Match de factura del transportador y provision contable.
6. Loading 3D, compartimientos y restricciones de mercancia.
7. KPIs OTIF, first-attempt delivery, utilizacion, costo y emisiones.

Ninguno de estos incrementos habilita una promocion por si solo. Cada alcance debe contar con migracion, pruebas, certificacion funcional, manifiesto y aprobacion independiente.
