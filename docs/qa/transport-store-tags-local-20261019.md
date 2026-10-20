# Buscador de tiendas con etiquetas

Desarrollo local, rama `desarrollo`, 2026-10-19. Cambio de interfaz sin contratos API, esquema o datos nuevos.

La lista de casillas se sustituye por etiquetas removibles y un buscador por nombre, ciudad o codigo, insensible a tildes. Los resultados aparecen al escribir, omiten tiendas ya seleccionadas y respetan el cliente del recorrido. Cada seleccion agrega una etiqueta y limpia la consulta. Incluye navegacion con flechas, Enter y Escape; Escape no se propaga al modal. Conserva el mismo payload de ids y no modifica tarifas, cantidades, soportes o totales. El contraste de las etiquetas se fija dentro del estilo del dialogo para evitar interferencias del tema global.

Evidencia ejecutada:

- `scripts/certifications/transport-store-tags-browser.mjs` mediante CUA en la sesion local: siete controles aprobados. Busca y agrega tres tiendas, verifica ausencia de casillas, conserva precio de 500.000, quita una etiqueta, conserva precio, agrega nuevamente con Enter y excluye duplicados. Resultado `<TEMP>/apexos-store-tags-browser-20261019.json`.
- Captura final revisada: `<TEMP>/apexos-store-tags-20261019.png`. Tres etiquetas y precio 500.000. Prueba sobre borrador temporal, sin guardarlo; se cierra solo la pestaña de prueba.
- 62 pruebas de regresion aprobadas, incluyendo filtrado, payload, quitar etiquetas, seleccion con teclado, no duplicacion, invariancia de importes y Escape sin cerrar el formulario. Registro `<TEMP>/apexos-store-tags-regression-20261019.log`.
- TypeScript, ESLint del editor y `git diff --check`.

Sin commit, push, despliegue o promocion. La evidencia local no autoriza publicacion en develop/main.
