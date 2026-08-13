# Incidente de edicion de ordenes por contrato inconsistente

Fecha: 2026-08-13

## Sintoma

Al abrir la edicion de una orden, la interfaz fallo con `Cannot read properties of undefined (reading 'find')` y el limite de errores reemplazo toda la pantalla.

## Riesgo identificado

El monitor asumía que referencias, tecnicos, tipos de servicio y almacenes siempre llegaban como arreglos directos. Tambien asumía que toda orden incluia `photos`, `incidents` e `items`. Un despliegue con respuestas envueltas, datos historicos o relaciones omitidas podia dejar una coleccion indefinida y bloquear el renderizado.

## Control requerido

- Normalizar arreglos directos y respuestas `{ data: [...] }` en el limite de entrada.
- Convertir colecciones ausentes de ordenes historicas en arreglos vacios.
- Certificar en QA apertura, modificacion, guardado y reapertura de una orden real.
- Validar que monitor, ejecucion, evidencias y reporte sigan operativos antes de promover a `main`.

## Reincidencia critica

La primera intervencion cubrio el monitor y su modal, pero la pantalla de detalle conservaba accesos directos a `data.items.find`. Una orden historica sin `items` podia seguir derribando el recorrido al abrirla. La correccion de reincidencia normaliza el contrato completo en la frontera de la pantalla operativa, incluidas colecciones anidadas y preguntas de encuesta.

La certificacion visual deja de limitarse a llamadas API: debe abrir el monitor, editar una orden y navegar al detalle usando tambien una respuesta sin colecciones opcionales. Si aparece el limite global de errores o un error de consola no controlado, la promocion queda bloqueada.
