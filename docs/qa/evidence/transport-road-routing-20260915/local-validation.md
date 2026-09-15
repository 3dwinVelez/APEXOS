# Validación local — planeación y direccionamiento vial

- Fecha: 2026-09-15
- Rama: `desarrollo`
- Ambiente: local
- Motor: OSRM, perfil `driving`, red vial OpenStreetMap
- Resultado: aprobado para desarrollo local

## Resultado funcional

- El planeador consulta el servicio `trip` de OSRM, conserva el origen y permite que el motor optimice el orden de las paradas.
- La API devuelve distancia y duración viales, tramos ordenados y geometría GeoJSON `LineString`.
- El mapa de planeación usa Leaflet, dibuja la geometría real sobre OpenStreetMap, muestra origen/paradas y ajusta automáticamente el encuadre.
- El endpoint y las teselas son configurables mediante `TMS_ROUTING_URL` y `NEXT_PUBLIC_TMS_TILE_URL`.
- Si OSRM no responde, el sistema identifica explícitamente el fallback y no lo presenta como mapa vial certificado.

## Evidencia ejecutada

- Certificación lineal local: aprobada; `engine=osrm`, 295 puntos de geometría y 9,77 km para una ruta de prueba en Bogotá.
- Pruebas del motor, dominio y UI: 36/36.
- TypeScript: aprobado.
- ESLint: 0 errores; 9 advertencias preexistentes fuera del alcance.
- Build Next.js: aprobado, 103 rutas.
- Navegador: mapa interactivo visible con etiqueta “Motor OSRM”, controles de zoom, atribución OpenStreetMap, distancia vial y secuencia propuesta.

## Operación por ambiente

El servidor comunitario de OSRM es adecuado para desarrollo y pruebas moderadas. Antes de QA o producción se debe configurar una instancia OSRM propia o un proveedor con SLA. Las teselas estándar de OpenStreetMap son de disponibilidad best-effort y deben sustituirse por un proveedor apropiado si el volumen comercial lo requiere.

Referencias técnicas:

- https://project-osrm.org/docs/v5.6.4/api/
- https://operations.osmfoundation.org/policies/tiles/
