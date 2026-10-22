# Transporte: selectores con búsqueda local

- Ambiente: desarrollo local, rama `desarrollo`.
- HEAD inicial y final: `85fdbe81ee293e866ac8a6d06c5ff22d264c8874`; cambios sin commit.
- Especialidades: orquestación, frontend y QA.
- Alcance: 40 controles nativos en 13 archivos de Transporte. Incluye flota/ficha vehicular, órdenes, operación, tarifarios, liquidaciones, documentos, cubicaje, perfiles vehiculares, POD, notificaciones, configuración y catálogos administrativos propios del módulo.
- Sin cambios de API, base de datos, infraestructura, permisos o dependencias. Sin push, promoción ni despliegue.

## Comportamiento

`TransportSearchSelect` conserva las opciones, valores, eventos `change`, campos deshabilitados, `required`, FormData y variantes controladas/no controladas de cada formulario. El selector nativo queda oculto; la interacción visible es un combobox con resultados en portal para evitar recortes en modales/tablas.

Permite buscar texto, códigos, varios términos e iniciales; ignora mayúsculas y tildes. Enter o clic abre la lista; flechas navegan, Enter selecciona y Escape cierra sin cerrar el modal. La búsqueda sin resultados se indica explícitamente. El restablecimiento del formulario conserva la semántica de cada campo. El buscador múltiple de tiendas ya existente se conserva.

## Evidencia ejecutada

1. `npm --workspace apps/web run typecheck`: **passed**.
2. Desde `apps/web`: `node ../../node_modules/eslint/bin/eslint.js components/transport/TransportSearchSelect.tsx`: **passed**, sin advertencias.
3. `node --test --test-reporter=spec apps/web/test/transport-*.test.mjs`: **89 passed / 2 failed**, 91 pruebas. Las nuevas pruebas de búsqueda e inventario pasan; la suite de interacciones de documentos pasa con el mock del nuevo componente.
4. `node scripts/certifications/transport-search-select-local.cjs --app`: **passed**. Navegador Edge headless, fixtures a 1280 y 390 px: apertura, iniciales, tildes, selección por teclado/ratón, evento único, actualización externa, vacío, Escape, FormData, validación requerida, reset controlado/no controlado, accesibilidad y límites del desplegable. También visita autenticada a las nueve rutas principales locales y apertura con Enter donde hay controles visibles. Bloquea solicitudes HTTP externas desde el navegador.
5. Auditoría recursiva: no quedan etiquetas `<select>` simples en las páginas/componentes propios de Transporte fuera del selector oculto del nuevo componente. El selector global de idioma pertenece a la cabecera compartida y está fuera de alcance.
6. `git diff --check`: **passed**.

Captura inspeccionada de Liquidaciones: `C:/Users/mq1/AppData/Local/Temp/apex-transport-search-K25YJ3/liquidaciones-local.png`. Capturas de fixtures: `search-1280.png` y `search-390.png` en el mismo directorio temporal. Salida de navegador: `%TEMP%/transport-search-final.txt`; regresión: `%TEMP%/transport-tests-final.txt`. Estos artefactos locales no se versionan.

## Fallos preexistentes y límites

- `transport-settlement-tower.test.mjs`, “la contabilizacion advierte el bloqueo y captura el pago”: espera el texto `idempotente`, ausente en el archivo inicial.
- `transport-vehicle-master-catalogs.test.mjs`, “la ficha enlaza sucursal y crea el centro de costo en la estructura contable”: espera la llamada literal sin parámetros a `organization-tree`, ausente en el archivo inicial.
- Ambas expectativas se contrastaron contra `git show HEAD:<archivo>` y ya fallaban antes del cambio. No se modificaron para ocultar los fallos.
- El recorrido de rutas no certifica crear/editar/guardar todas las entidades ni todos los formularios internos. Las interacciones comunes se certificaron con fixtures; falta una certificación funcional integral de todos los flujos internos con datos reales locales.

## Dictamen

Implementación disponible para evaluación local. **QA: NO APTO para certificación integral/publicación**, por los dos fallos previos y la cobertura funcional integral pendiente. Promoción no solicitada y bloqueada: estas pruebas no sustituyen los manifiestos ni gates de `desarrollo -> develop -> main`. Siguiente acción autorizada: evaluación del usuario en local y ajustes dentro de `desarrollo`.
