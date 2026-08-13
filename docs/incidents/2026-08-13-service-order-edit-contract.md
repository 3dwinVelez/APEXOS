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
