# APEXOS UI V3 - Correccion de bundle en /dashboard/proyectos

Fecha: 2026-08-03

## Causa raiz

`/dashboard/proyectos/page.tsx` era un Client Component e importaba `recharts` directamente. En la candidata con Next 15.5.22, esa frontera hizo que el server page bundle incluyera codigo ampliado de `recharts` aunque el chunk cliente especifico pareciera equivalente. No hubo barrel export ni provider global arrastrando charts.

Arbol confirmado:

`/dashboard/proyectos/page.tsx`
  -> import directo `AreaChart/BarChart/ResponsiveContainer/...` desde `recharts`
  -> server page bundle candidato antes: 85 ocurrencias de `recharts`

Despues:

`/dashboard/proyectos/page.tsx`
  -> `dynamic(() => import(./ProjectsCharts), { ssr: false })`
  -> `ProjectsCharts.tsx`
     -> `recharts` en chunks diferidos de cliente

## Bundle

| Metrica | Main | Candidata antes | Candidata despues |
| --- | ---: | ---: | ---: |
| Bundle server | 69810 B | 441111 B | 57626 B |
| Recharts en server page | 7 | 85 | 0 |
| Chunk cliente page | 42013 B | 42013 B | 41313 B |
| Tamano Next | 15.2 kB | 115 kB | 12.2 kB |
| First Load JS | 255 kB | 255 kB | 152 kB |
| T3 | 548 ms | no comparable; corrida pre-fix invalidada por medicion incremental | 405 ms |
| T4 | 553 ms | no comparable; corrida pre-fix invalidada por medicion incremental | 420 ms |

## Hipotesis

| Hipotesis | Evidencia | Confirmada | Accion |
| --- | --- | --- | --- |
| Barrel compartido | No hay reexport transitivo detectado | No | Sin accion |
| Server Component importa charts | La ruta es Client Component con import directo | Parcial | Aislar charts |
| Frontera client ampliada | `page.tsx` cargaba charts en la frontera de pagina | Si | Dynamic client-only |
| Provider global arrastra charts | Layout/providers no importan `recharts` | No | Sin accion |
| Dynamic import perdio ssr:false | No existia dynamic import previo | Si | Agregado `ssr:false` |
| Tree shaking insuficiente | Server bundle tenia 85 ocurrencias de `recharts` | Si | Separar modulo pesado |
| Medicion Next agrupa distinto | First Load JS y server page divergian | Si | Documentado |

## Estado funcional

Se conservan los dos graficos, datos, filtros, acciones, layout responsive y skeleton compacto mientras carga el chunk diferido.
