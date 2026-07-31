# APEXOS UI Adoption Inventory

Fecha: 2026-07-29

Rama: `codex/perf-ui-remediation`

Base: `main@4594572ad2c476cdccf23bfb6c661566274ab3a8`

Candidata inicial: `develop@4ef234c8c2da01eae58d5af09b44dfcd0bbe0776`

## Método

Inventario estático previo a cualquier migración. Se analizaron las 58 rutas `page.tsx`.

Abreviaturas:

- `Tipo`: `D` Desktop, `R` Responsive/híbrida y `M` orientada a operación Mobile.
- `Legacy`: declaraciones nativas de `button`, `input`, `select`, `textarea` o `table`.
- `DS`: importaciones de `Card`, `DataTable`, feedback o controles de formulario nuevos.
- `Local`: ocurrencias de estilos locales `className`.
- `Decor`: sombras, gradientes, blur o radios decorativos detectados.
- `Req`: puntos de solicitud visibles dentro del archivo. Las llamadas encapsuladas en `lib/api.ts` no aparecen en este conteo.
- `Hooks`: `useState`, `useEffect`, `useMemo` y `useCallback`, como proxy estático; no equivale a renders medidos.
- `Tamaño`: bytes del archivo fuente, no JavaScript transferido.
- `DOM`, requests reales y renders React requieren sesión QA e instrumentación runtime. Se marcan `N/D` y no se inventan valores.

## Resultado global

- 58/58 pantallas: **No migradas**.
- 0 pantallas importan `Card`, `DataTable`, feedback o controles de formulario nuevos.
- 4 pantallas usan el `Button` anterior, exactamente como en `main`; no constituyen adopción del nuevo piloto.
- 895 controles nativos permanecen declarados en páginas y componentes.
- 99 archivos frontend frente a 94 en `main`.
- 30 componentes frente a 25 en `main`.
- 163 patrones decorativos permanecen.

La causa de la adopción fallida es directa: los componentes se añadieron como archivos aislados, sin una migración de consumidores ni retirada de implementaciones anteriores.

## Matriz de 58 pantallas

| Ruta | Módulo | Tipo | Layout | Tamaño | Legacy | DS | Local | Decor | Req | Hooks | Librerías | DOM/runtime | Estado | Prioridad | Riesgo |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| `/` | público | D | público | 7.977 | 4 | 0 | 53 | 7 | 0 | 1 | lucide | N/D | No migrada | P3 | Bajo |
| `/login` | acceso | R | público | 16.110 | 2 | 0 | 47 | 7 | 1 | 3 | lucide | 143 nodos | No migrada | P3 | Medio |
| `/register` | acceso | D | público | 2.778 | 2 | 0 | 9 | 0 | 0 | 1 | lucide | N/D | No migrada | P3 | Bajo |
| `/onboarding` | acceso | D | público | 6.729 | 2 | 0 | 24 | 0 | 0 | 2 | lucide | N/D | No migrada | P3 | Bajo |
| `/servicios/solicitar` | servicios | R | público | 25.997 | 17 | 0 | 96 | 43 | 2 | 7 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard` | dashboard | R | dashboard | 26.846 | 0 | 0 | 92 | 3 | 0 | 5 | lucide,recharts | N/D | No migrada | P2 | Medio |
| `/dashboard/[module]` | genérico | D | dashboard | 5.197 | 1 | 0 | 30 | 0 | 0 | 0 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/administracion` | administración | R | dashboard | 148.535 | 40 | 0 | 363 | 4 | 1 | 42 | lucide | N/D | No migrada | P1 | Alto |
| `/dashboard/administracion/suscripciones` | administración | R | dashboard | 45.783 | 49 | 0 | 215 | 4 | 0 | 12 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/apex-ai` | apex-ai | D | dashboard | 11.551 | 2 | 0 | 65 | 0 | 0 | 7 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/compras` | compras | D | dashboard | 7.877 | 1 | 0 | 51 | 0 | 0 | 0 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/compras/facturas` | compras | D | dashboard | 31.930 | 29 | 0 | 111 | 0 | 0 | 8 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/compras/ordenes/nueva` | compras | D | dashboard | 43.076 | 20 | 0 | 161 | 2 | 0 | 11 | lucide | N/D | No migrada | P2 | Alto |
| `/dashboard/compras/ordenes/recibir` | compras | D | dashboard | 2.172 | 1 | 0 | 8 | 0 | 0 | 2 | — | N/D | No migrada | P3 | Alto |
| `/dashboard/compras/proveedores` | compras | R | dashboard | 32.241 | 25 | 0 | 124 | 2 | 0 | 11 | lucide | N/D | No migrada | P1 | Medio |
| `/dashboard/configuracion` | configuración | D | dashboard | 139 | 0 | 0 | 0 | 0 | 0 | 0 | — | N/D | Excluida: placeholder | P3 | Bajo |
| `/dashboard/contabilidad` | contabilidad | D | dashboard | 5.276 | 0 | 0 | 20 | 0 | 0 | 0 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/contabilidad/asientos` | contabilidad | D | dashboard | 36.081 | 34 | 0 | 165 | 0 | 0 | 12 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/contabilidad/cuentas-por-pagar` | contabilidad | D | dashboard | 54.206 | 47 | 0 | 247 | 0 | 0 | 15 | lucide | N/D | No migrada | P2 | Alto |
| `/dashboard/contabilidad/estructura` | contabilidad | D | dashboard | 12.905 | 13 | 0 | 50 | 0 | 0 | 8 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/contabilidad/plan-cuentas` | contabilidad | D | dashboard | 13.396 | 16 | 0 | 70 | 0 | 0 | 12 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/contabilidad/reportes` | contabilidad | D | dashboard | 13.011 | 7 | 0 | 44 | 0 | 0 | 8 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/contabilidad/terceros` | contabilidad | D | dashboard | 28.327 | 35 | 0 | 118 | 0 | 0 | 17 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/cxc/clientes/[id]/estado-cuenta` | cxc | D | dashboard | 4.051 | 1 | 0 | 31 | 0 | 0 | 2 | — | N/D | No migrada | P3 | Alto |
| `/dashboard/cxc/documentos` | cxc | D | dashboard | 3.953 | 2 | 0 | 27 | 0 | 0 | 4 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/cxc/reportes/cartera` | cxc | D | dashboard | 4.371 | 1 | 0 | 32 | 0 | 0 | 2 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/cxc/retenciones` | cxc | D | dashboard | 5.444 | 9 | 0 | 32 | 0 | 0 | 6 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/facturacion` | facturación | D | dashboard | 2.379 | 0 | 0 | 14 | 1 | 0 | 0 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/facturacion/documentos` | facturación | D | dashboard | 1.304 | 0 | 0 | 6 | 0 | 0 | 2 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/facturacion/emitir` | facturación | D | dashboard | 3.822 | 4 | 0 | 15 | 0 | 0 | 5 | lucide | N/D | No migrada | P2 | Alto |
| `/dashboard/inventario` | inventario | D | dashboard | 7.560 | 0 | 0 | 48 | 0 | 0 | 0 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/inventario/bodegas` | inventario | D | dashboard | 16.347 | 17 | 0 | 76 | 0 | 0 | 9 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/inventario/familias` | inventario | D | dashboard | 12.344 | 11 | 0 | 52 | 0 | 0 | 5 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/inventario/productos/nuevo` | inventario | R | dashboard | 50.998 | 37 | 0 | 162 | 2 | 0 | 16 | lucide | N/D | No migrada | P2 | Alto |
| `/dashboard/inventario/reportes` | inventario | D | dashboard | 11.989 | 7 | 0 | 73 | 0 | 0 | 10 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/inventario/stock` | inventario | D | dashboard | 6.730 | 5 | 0 | 40 | 0 | 0 | 6 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/inventario/wms` | inventario | R | dashboard | 107.762 | 56 | 0 | 397 | 11 | 0 | 10 | lucide | N/D | No migrada | P2 | Alto |
| `/dashboard/proyectos` | proyectos | R | dashboard | 54.903 | 41 | 0 | 200 | 5 | 0 | 11 | lucide,recharts | N/D | No migrada | P2 | Medio |
| `/dashboard/servicios` | servicios | R | dashboard | 68.414 | 33 | 0 | 213 | 9 | 1 | 21 | lucide | N/D | No migrada | P1 | Alto |
| `/dashboard/servicios/[id]` | servicios | M/R | dashboard | 56.852 | 23 | 0 | 173 | 17 | 1 | 9 | lucide | N/D | No migrada | P1 | Alto |
| `/dashboard/servicios/nuevo` | servicios | R | dashboard | 12.830 | 12 | 0 | 41 | 5 | 0 | 3 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/servicios/referencias` | servicios | R | dashboard | 36.144 | 41 | 0 | 160 | 5 | 0 | 15 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/servicios/reportes` | servicios | R | dashboard | 31.297 | 17 | 0 | 74 | 2 | 0 | 18 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/talento-humano` | talento humano | R | dashboard | 5.119 | 0 | 0 | 26 | 2 | 0 | 1 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/talento-humano/mapa` | talento humano | M/R | dashboard | 34.588 | 14 | 0 | 104 | 7 | 0 | 20 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/talento-humano/marcacion` | talento humano | M | dashboard | 51.247 | 22 | 0 | 117 | 12 | 0 | 21 | lucide | N/D | No migrada | P1 | Alto |
| `/dashboard/talento-humano/nomina` | talento humano | D | dashboard | 12.441 | 21 | 0 | 71 | 0 | 0 | 3 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/talento-humano/reportes` | talento humano | R | dashboard | 18.197 | 10 | 0 | 68 | 1 | 0 | 10 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/talento-humano/rutas` | talento humano | M/R | dashboard | 51.477 | 39 | 0 | 199 | 3 | 0 | 24 | lucide | N/D | No migrada | P1 | Alto |
| `/dashboard/transporte` | transporte | R | dashboard | 45.558 | 17 | 0 | 126 | 1 | 0 | 16 | lucide | N/D | No migrada | P2 | Medio |
| `/dashboard/ventas` | ventas | D | dashboard | 2.808 | 0 | 0 | 14 | 1 | 0 | 0 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/ventas/clientes` | ventas | D | dashboard | 4.308 | 7 | 0 | 16 | 0 | 0 | 4 | lucide | N/D | No migrada | P3 | Bajo |
| `/dashboard/ventas/facturas` | ventas | D | dashboard | 4.337 | 3 | 0 | 27 | 0 | 0 | 4 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/ventas/facturas/[id]` | ventas | D | dashboard | 9.199 | 3 | 0 | 70 | 0 | 0 | 5 | — | N/D | No migrada | P2 | Alto |
| `/dashboard/ventas/facturas/nueva` | ventas | D | dashboard | 18.996 | 24 | 0 | 87 | 1 | 0 | 6 | — | N/D | No migrada | P2 | Alto |
| `/dashboard/ventas/ordenes` | ventas | D | dashboard | 1.253 | 0 | 0 | 6 | 0 | 0 | 2 | — | N/D | No migrada | P3 | Bajo |
| `/dashboard/ventas/ordenes/nueva` | ventas | D | dashboard | 3.728 | 6 | 0 | 11 | 0 | 0 | 4 | — | N/D | No migrada | P2 | Alto |
| `/dashboard/ventas/reportes` | ventas | D | dashboard | 12.789 | 11 | 0 | 83 | 0 | 0 | 4 | — | N/D | No migrada | P3 | Bajo |

## Duplicación y componentes

Patrones anteriores:

- controles HTML con clases repetidas en cada página;
- tablas locales sin contrato común;
- cards, paneles, badges y estados construidos inline;
- layouts extensos en Administración, WMS, Servicios y Proyectos;
- iconografía Lucide importada por pantalla;
- Recharts en Dashboard y Proyectos.

Componentes nuevos:

| Componente | Adopción | Evaluación inicial |
| --- | ---: | --- |
| `Button` | 4 páginas, ya existía antes de la remediación | Necesario; simplificar sin duplicar estilos globales |
| `Card` | 0 | Wrapper de un solo nodo; adoptar solo donde reemplace un wrapper equivalente |
| `DataTable` | 0 | Agrega `section` y `div`; no adoptar hasta comprobar reducción DOM |
| `Pagination` | 0 | Útil si sustituye paginación local |
| `Badge`, `Alert`, `Skeleton`, `EmptyState` | 0 | Adoptar selectivamente, sin montar estados ocultos |
| `Input`, `Select`, `Textarea` | 0 | El wrapper `label` puede alterar formularios; requiere piloto controlado |

## Priorización de pilotos

1. **Tabla extensa:** `/dashboard/administracion`, sección Usuarios/Roles. Alto valor y alto riesgo; debe dividirse por sección sin cambiar lógica.
2. **Formulario:** `/dashboard/compras/proveedores`. Tamaño medio, formulario y tabla en una ruta acotada.
3. **Operativa con filtros:** `/dashboard/servicios`. Prioridad P1 por regresión de bundle y uso Desktop/Mobile.

Flujos Mobile posteriores, solo si los pilotos Desktop cumplen presupuesto:

1. `/dashboard/servicios` en modo técnico.
2. `/dashboard/servicios/[id]`.
3. checklist/evidencia dentro del detalle.

## Decisión de Fase 1

El inventario confirma una implementación fallida por **creación sin adopción**. Se autoriza pasar a Fase 2 para simplificar primitivas. No se autoriza una migración transversal.
