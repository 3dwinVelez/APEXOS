# Optimizacion modulo Talento Humano - Eliminacion de redundancia y optimizacion visual

## Cambios realizados

### 1. page.tsx (Dashboard TH) — Monitor redundante eliminado
**Antes**: 369 lineas, 4 llamadas API en paralelo + polling 30s + sidepanel de timeline con evidence images, GPS, observaciones — **exactamente la misma funcionalidad que rutas/page.tsx**.

**Despues**: 57 lineas, solo 2 llamadas API ligeras al montar (employees + vehicles para el banner de validacion). Sin polling, sin operations-map, sin timeline. Funciona como hub de acceso rapido a las 6 sub-paginas del modulo.

**Impacto**: -305 lineas de codigo duplicado, -4 llamadas API por carga/polling, menos datos transferidos.

### 2. mapa/page.tsx — Optimizacion visual y de rendimiento
- Cuadricula de tiles reducida de 9x7 (63 tiles de 256px) a 7x5 (35 tiles)
- Sidebar reducida de 320px a 280px
- Altura maxima del sidebar en mobile reducida de 42vh a 35vh
- Espaciado de metricas compactado (gap-1.5 en vez de gap-2)

### 3. api.ts — Consistencia de code de empleados
- `/api/v1/hr/routes` fallback: se cambio prioridad de derivacion de empleados para que use `metadata.code` primero, consistente con `/api/v1/hr/me` y `/api/v1/hr/employees`

## Archivos modificados
- apps/web/app/dashboard/talento-humano/page.tsx (reducido 86%)
- apps/web/app/dashboard/talento-humano/mapa/page.tsx (tiles 7x5, sidebar 280px)
- apps/web/lib/api.ts (orden code en rutas)
