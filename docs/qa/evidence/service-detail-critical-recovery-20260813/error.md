# Pruebas de error

- Orden sin `items`, `photos` o `incidents`: normalizada a colecciones vacias antes de usar `.find`, `.map` o `.some`.
- Referencias sin `parts`: normalizadas antes del renderizado.
- Encuesta ausente o envuelta en `{ data: [] }`: degradacion controlada a preguntas predeterminadas.
- Contrato de regresion automatizado en `service-order-detail-contract-normalization.test.mjs`.
