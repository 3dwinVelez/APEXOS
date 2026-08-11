# Regresion

- Se conserva la carga detallada de marcaciones, actividades, GPS y evidencia al abrir un horario.
- El listado ya no ejecuta `operations-map` para una fecha arbitraria cuando no hay detalle abierto.
- La actualizacion periodica usa agregados sin transportar imagenes base64.
- La senal inmediata de marcacion actualiza el resumen y el detalle seleccionado.
- Los eventos modernos con `route_id` siguen usando agregados SQL; solo los registros huerfanos pasan por compatibilidad de identidad.
