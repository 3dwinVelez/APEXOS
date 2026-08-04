# APEXOS - Next.js Server/Client Boundary Standard

Fecha: 2026-08-03

## Regla

Las paginas App Router deben permanecer como Server Components salvo que exista una necesidad real de estado cliente, eventos de navegador o librerias que dependan de DOM. La interactividad pesada se aisla en Client Components pequenos.

## Graficos y librerias pesadas

- No importar `recharts` directamente desde `page.tsx`.
- Colocar graficos en un Client Component dedicado.
- Cargar graficos con `next/dynamic` cuando no sean necesarios para T3/T4.
- Usar `ssr: false` cuando la libreria no necesita render server y aumenta el bundle server.
- Mantener placeholders con dimensiones estables para evitar saltos de layout.

## Imports

- Evitar barrels que arrastren dependencias pesadas.
- Preferir imports directos y especificos.
- Usar `import type` para tipos.
- Revisar que una pagina server no herede dependencias cliente por reexportaciones.

## Criterio de aceptacion

Una ruta corregida debe demostrar:

- server bundle sin librerias de graficos innecesarias;
- route size dentro del presupuesto;
- First Load JS sin regresion significativa;
- T3/T4 sin degradacion;
- ausencia de errores de hidratacion.
