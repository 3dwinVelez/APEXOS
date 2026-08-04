# APEXOS - Performance Prefetch Standard

Fecha: 2026-08-03

## Regla

Next.js prefetch debe conservarse cuando una navegacion es aislada, probable y aporta continuidad al flujo. Debe deshabilitarse con `prefetch={false}` cuando un componente renderiza muchos enlaces visibles y esos enlaces generan ruido RSC antes de que la pantalla actual sea operativa.

## Usar `prefetch={false}`

- Navegacion lateral con muchos modulos.
- Navegacion movil persistente con multiples rutas.
- Dashboards con grillas/listas de enlaces a modulos.
- Enlaces secundarios visibles durante el primer render que no son la accion principal del usuario.
- Rutas que disparan fetches RSC `?_rsc=...` y compiten con auth, datos principales o T3/T4.

## Mantener prefetch

- Acciones principales altamente probables y aisladas.
- Enlaces criticos de continuidad donde hay pocos destinos visibles.
- Transiciones de detalle cuando se ha medido que no introducen solicitudes secundarias costosas.

## Medicion

Antes de desactivar prefetch, registrar:

- cantidad de solicitudes `?_rsc=...`;
- inicio relativo de cada solicitud frente a T0;
- si ocurre antes de T3/T4;
- impacto en requests bloqueantes, JS, DOM, p90 y p95;
- diferencia entre escritorio y movil.

## Anti-patrones

- Desactivar globalmente todo el prefetch de Next.js.
- Mantener prefetch en sidebars con decenas de enlaces sin medir waterfall.
- Justificar la regla con p50 solamente cuando p95 muestra variabilidad.
- Corregir ruido RSC cambiando permisos, auth o datos principales sin evidencia.
