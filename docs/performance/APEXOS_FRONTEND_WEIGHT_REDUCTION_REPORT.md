# APEXOS Frontend Weight Reduction Report

## Reduccion Confirmada

Ruta principal intervenida: `/dashboard`.

| Metrica | Antes | Despues | Delta |
| ------- | ----: | ------: | ----: |
| Route size | 11.6 kB | 7.13 kB | -4.47 kB |
| First Load JS | 264 kB | 158 kB | -106 kB |
| Shared First Load JS | 103 kB | 103 kB | 0 kB |
| Consumidores de `recharts` | 2 | 1 | -1 |

## Cambios Tecnicos

- Se elimino `recharts` de `/dashboard`.
- Se reemplazaron `ResponsiveContainer`, `LineChart`, `BarChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Bar`, `Line` y `Cell` por componentes nativos `TrendStrip` y `MetricBars`.
- No se agregaron dependencias.
- No se modificaron contratos API, permisos ni logica de negocio.

## Observacion

`/dashboard/proyectos` conserva `recharts`; el build atribuye mas peso de ruta a esa pantalla despues de liberar `/dashboard`, pero su First Load JS bajo de 256 kB a 255 kB. Queda como candidato de fase posterior.
