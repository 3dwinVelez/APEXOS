# Reporte de incremento — Fundación Transporte/TMS

## Estado

El primer incremento del TMS está implementado y ejecutándose en la rama `desarrollo`, exclusivamente en ambiente local. No constituye todavía el TMS integral terminado ni una entrega autorizada para QA o producción.

## Alcance implementado

- Maestros de transportadores, conductores y puntos de entrega.
- Orígenes operativos georreferenciados.
- Tarifarios versionados con vigencia, transportador, lane, servicio, vehículo y componentes de costo.
- Sustitución controlada de versiones sin alterar tarifarios publicados.
- Necesidades logísticas con validación explícita de datos incompletos.
- Agrupaciones automáticas de demanda compatible.
- Planeación de viajes, secuencia heurística de paradas, distancia, duración y mapa esquemático.
- Comparación de alternativas tarifarias y confirmación del viaje con cálculo ejecutado por el servidor.
- Asignación con controles documentales, capacidad de vehículo y licencia del conductor.
- Máquina de estados del viaje y bitácora inmutable de eventos operativos.
- Intentos de entrega, novedades y POD para entregas totales o parciales.
- Costos estimado, comprometido y real mediante liquidación y aprobación.
- Torre de control local y pantallas operativas/maestras en la aplicación web.
- Aislamiento por empresa y retiro lógico para los maestros nuevos.

## Certificación

El flujo funcional local fue certificado de extremo a extremo con 24 controles aprobados. La evidencia final de ejecución es `run-20260904154104.json` y el detalle técnico está en `local-validation.md`.

## Próximas fases

Quedan fuera de este incremento la licitación/oferta avanzada a transportadores, optimización VRP apoyada por red vial y tráfico, integración GPS/ETA, logística inversa completa, conciliación con factura del transportador, loading 3D y certificación en QA. Cada fase deberá iniciar en `desarrollo` y seguir el flujo controlado `desarrollo -> develop -> main` únicamente con autorización explícita.
