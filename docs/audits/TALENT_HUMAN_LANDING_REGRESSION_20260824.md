# Rastreo del ordenamiento de Talento Humano

## Hallazgo

La reorganización visual y funcional de la portada de Talento Humano fue introducida por `3159eb30066c6aa50ba3672f563e2ed3dd69a034` (`feat(hr): reorganize talent landing by business domain`). Agrupó las funciones bajo el dominio **Mallas horarias**, ordenó el recorrido Planeación → Marcación → Monitor → Reportes y separó Nómina como capacidad en planeación.

El ajuste de contraste necesario para esa portada quedó en `88d2ca2f69620fe8f7bbc08d96dee6a62acf62e8`. Este commit representa la versión funcional más reciente del archivo y de su prueba de arquitectura de información.

## Pérdida

El rollback masivo `179f80f8e609cf96668fea5c3c33adb76c3eea63` revirtió ambos ajustes el 21 de agosto de 2026. Ese rollback modificó 238 archivos y eliminó 14.263 líneas porque restauró un árbol anterior completo después de una falla de esquema. Por eso la portada anterior volvió a `origin/desarrollo`, `develop` y `main`, aunque los commits funcionales siguen presentes en el historial.

La copia funcional todavía está materializada en la rama local histórica `desarrollo` con punta `07a4cdb7c76905068798486dc30c5381a0b2005d`; no está publicada actualmente en ninguna de las tres ramas remotas controladas. La recuperación correcta debe aplicar exclusivamente `3159eb3` y `88d2ca2`, o sus hunks revisados, sobre el `origin/desarrollo` vigente. No debe fusionarse la rama local histórica ni restaurarse su árbol completo.

## Hallazgo lateral

El commit de Servicios `351431ab911a7a87bd1e7adc5dabe4ae3e31bcb5` también modificó `talento-humano/rutas/page.tsx` para corregir el cálculo UTC de fechas. Ese cambio no correspondía al propósito declarado del commit y ejemplifica por qué una promoción debe validar el inventario exacto, no confiar en el mensaje del commit.

## Prevención

Desde esta revisión, todo manifiesto nuevo usa el esquema de alcance v2 con intención, módulos e inventario exacto de cambios. La compuerta rechaza archivos adicionales aunque estén dentro de un directorio permitido. Los aportes de distintas máquinas se comparan contra el destino remoto vigente y los commits con cambios cruzados se dividen o reconstruyen antes de QA.

Este documento es diagnóstico. No autoriza ni ejecuta la recuperación funcional, una promoción o un despliegue.
