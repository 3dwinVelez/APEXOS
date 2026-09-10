# Diagnostico y validacion: mapa historico de Talento Humano

- Rama de implementacion: `desarrollo`.
- Commit funcional y poblador: `371ed37`.
- Ambiente poblado: Supabase QA `jbirkghkekuifgfsgquq`, tenant SCJ `cbbf3627-4336-4f23-95c6-1077414bcd17`.
- Fixture persistente: `scj_hr_historical_trace_20260909_v1`.
- Revision: modo `Historico`, fecha `2026-09-09`, horario/ruta `81`, placa simulada `QA-HIST-01`.

## Datos rastreables

- Empleada: `juliana@apexos.local`, employee `100`.
- Cuatro marcaciones enlazadas a la ruta: entrada, inicio de almuerzo, fin de almuerzo y salida.
- Trece puntos GPS ordenados entre las 08:00 y las 17:00.
- Una jornada historica cerrada con referencias a las marcaciones de entrada y salida.
- Todas las filas llevan el origen controlado y metadatos `simulated: true`, `historical: true`.
- El poblador es idempotente y no contiene operaciones de eliminacion.

## Bugs corregidos

- La fecha del mapa se calculaba en UTC y podia saltar al dia siguiente despues de las 19:00 en Colombia; ahora usa `America/Bogota`.
- Las marcas sin coordenadas se convertian implicitamente a `(0,0)`; ahora se excluyen del lienzo.
- El historico mantenia zoom fijo centrado solo en la ultima ubicacion; ahora calcula centro y zoom usando pings, marcaciones, actividades y personas visibles.
- El filtro por usuario ahora tambien filtra actividades, evitando mezclar trazas.

## Evidencia

- API `operations-map`: HTTP 200, ruta `81`, 13 pings, 4 punch points ordenados, 1 grupo de marcas y cobertura GPS del usuario asignado.
- Pruebas API focales: 10 aprobadas, 0 fallidas.
- Pruebas web focales: 8 aprobadas, 0 fallidas.
- TypeScript web: aprobado.
- `git diff --check`: aprobado.
- Revision visual: bloqueada por el rol de la sesion de navegador existente (`Acceso no autorizado`); no se altero RBAC.

El fix permanece en `desarrollo`. La poblacion historica ya esta disponible en SCJ QA; `develop`, `main` y produccion no fueron modificados por esta intervencion.
