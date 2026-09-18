# Diagnostico

El monitor consultaba correctamente las marcaciones y actividades, pero la proyeccion ligera de `operations-map` excluia el contenido Base64 para evitar transferir fotografias en cada refresco. La interfaz interpretaba esa ausencia como evidencia no disponible y no existia una operacion posterior para recuperarla.

La correccion conserva la consulta periodica ligera y agrega una lectura puntual por tipo e identificador. El servidor obtiene la evidencia solo cuando el usuario pulsa `Cargar evidencia`, valida `hr:read` y restringe la consulta al tenant autenticado.

La alternativa de volver a incluir Base64 en `operations-map` fue descartada porque aumentaria el peso de cada refresco y degradaria el monitor a medida que crecen los eventos.
