# Modulo Transporte

## Cambios aplicados

- Vehiculos se ajusto como ficha maestra transversal, no como modulo operativo.
- El panel principal muestra placas, estado documental, score maestro, sede base, propiedad y vencimientos criticos.
- La ficha usa pestanas: datos generales, propiedad, documentos legales, adjuntos, datos tecnicos y auditoria.
- Se agrego carga de documentos por placa con tipo documental, fechas, version, estado y ruta de almacenamiento logica.
- Se calcula estado maestro documental y Vehicle Master Score de 0 a 100.
- Se expone endpoint de metricas para tablero inicial y endpoint de consulta para Planeacion.
- La ficha permite asociar un empleado activo como conductor autorizado o registrar un conductor manual/externo sin convertir Vehiculos en operacion de rutas.

## Regla de experiencia

Transporte debe comportarse como maestro confiable de flota: consulta rapida primero, captura y mantenimiento en ficha separada. No debe incluir checklist preoperacional, inicio de ruta, despacho ni asignacion activa; Planeacion consume estos datos y decide si puede iniciar una ruta.

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
