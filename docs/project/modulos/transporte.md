# Modulo Transporte

## Cambios aplicados

- Vehiculos se ajusto como ficha maestra transversal, no como modulo operativo.
- La entrada al modulo usa un encabezado compacto y cuatro indicadores esenciales: flota registrada, vehiculos que requieren atencion, score promedio y fichas incompletas.
- La consulta principal presenta una tabla profesional para comparar placas, estado documental, sede, propiedad, conductor autorizado y vencimientos criticos sin abrir cada ficha.
- La tabla permite buscar por placa, marca, sede o conductor; filtrar por estado, sede y propiedad; ordenar por prioridad documental, placa o score; y limpiar filtros activos.
- En pantallas moviles, la tabla se adapta a tarjetas compactas conservando los datos necesarios para decidir que ficha abrir.
- La creacion de vehiculos se guia en tres etapas esenciales: identificacion, operacion y propiedad, y documentos. Las secciones avanzadas aparecen despues de guardar la ficha inicial.
- Las etapas de la ficha usan iconos semanticos para facilitar el reconocimiento visual de identificacion, ubicacion/propiedad, documentos, adjuntos, datos tecnicos y auditoria.
- Cada vehiculo muestra una barra de completitud independiente del score documental. Dentro del editor, la barra se actualiza con los datos diligenciados e indica los siguientes campos recomendados.
- La ficha completa usa pestanas: identificacion, operacion y propiedad, documentos, adjuntos, datos tecnicos y auditoria.
- Se agrego carga de documentos por placa con tipo documental, fechas, version, estado y ruta de almacenamiento logica.
- Se calcula estado maestro documental y Vehicle Master Score de 0 a 100.
- Se expone endpoint de metricas para tablero inicial y endpoint de consulta para Planeacion.
- La ficha permite asociar un empleado activo como conductor autorizado o registrar un conductor manual/externo sin convertir Vehiculos en operacion de rutas.

## Regla de experiencia

Transporte debe comportarse como maestro confiable de flota: comparacion y consulta rapida primero, captura y mantenimiento en ficha separada. La vista principal debe reducir ruido visual, priorizar excepciones documentales y permitir que cualquier persona entienda que vehiculo necesita atencion. La ficha debe explicar que completar y mostrar primero solo los datos esenciales para crear un vehiculo.

La ficha de Flota no debe incluir checklist preoperacional, inicio de ruta, despacho ni asignacion activa. Esas responsabilidades pertenecen al dominio operacional TMS, que consume el maestro de vehiculos y mantiene viajes, paradas y eventos separados de las jornadas de Talento Humano.

## Validaciones esperadas

- Placa unica, normalizada en mayuscula y sin espacios.
- No crear sin placa, tipo, marca, propiedad y sede base.
- No permitir vencimientos anteriores a fechas de emision.
- Validar VIN/chasis duplicado si se diligencia.
- Usar estado retirado/soft delete para placas con historial.
- Auditar cambios criticos de placa, propietario, estado, sede, propiedad y documentos.

## Integracion transversal

- Planeacion consulta `/api/v1/transport/vehicles/planning/:plate` para recibir estado maestro, vencidos, proximos a vencer, score, capacidad, sede base y restricciones.
- El payload de Planeacion tambien entrega conductor autorizado cuando exista: id, nombre, documento y codigo.
- El dashboard inicial consulta `/api/v1/transport/vehicles/metrics/dashboard` para mostrar salud documental y score promedio de flota.
- IA APEX y reportes pueden usar los mismos datos sin duplicar logica operativa.

## Operacion TMS local

- `/dashboard/transporte/operacion` presenta torre, necesidades, viajes, paradas, entrega y liquidacion.
- `/dashboard/transporte/maestros` administra transportadoras, conductores logisticos y puntos de entrega.
- El flujo inicial soporta necesidad completa o incompleta, planificacion manual, asignacion con validacion de capacidad y documentos, despacho, eventos, POD, liquidacion y cierre.
- `TimeRoute` sigue representando una jornada de Talento Humano; `TransportTrip` representa el movimiento logistico de mercancia.
- La especificacion funcional ampliada se mantiene en `docs/project/modulos/transporte-tms.md`.
