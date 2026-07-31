# APEXOS Frontend Weight Reduction Report

## Reduccion Confirmada

Ruta principal intervenida: `/dashboard`.

| Metrica | Antes | Despues | Delta |
| ------- | ----: | ------: | ----: |
| Route size | 11.6 kB | 7.13 kB | -4.47 kB |
| First Load JS | 264 kB | 158 kB | -106 kB |
| Shared First Load JS | 103 kB | 103 kB | 0 kB |
| Consumidores de `recharts` | 2 | 1 | -1 |

Rutas continuadas:

| Ruta | Antes | Despues | Delta |
| ---- | ----: | ------: | ----: |
| `/dashboard/administracion` route size | 23.1 kB | 22.9 kB | -0.2 kB |
| `/dashboard/servicios` route size | 16.8 kB | 16.4 kB | -0.4 kB |
| `/dashboard/servicios` First Load JS | 157 kB | 156 kB | -1 kB |
| `/dashboard/servicios/[id]` First Load JS | 165 kB | 165 kB | 0 kB |

## Cambios Tecnicos

- Se elimino `recharts` de `/dashboard`.
- Se reemplazaron `ResponsiveContainer`, `LineChart`, `BarChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Bar`, `Line` y `Cell` por componentes nativos `TrendStrip` y `MetricBars`.
- No se agregaron dependencias.
- No se modificaron contratos API, permisos ni logica de negocio.
- Administracion redujo estructura en usuarios/roles sin cambiar llamadas ni permisos.
- Servicios redujo decoradores y conservó las consultas existentes.

## Observacion

`/dashboard/proyectos` conserva `recharts`; el build atribuye mas peso de ruta a esa pantalla despues de liberar `/dashboard`, pero su First Load JS bajo de 256 kB a 255 kB. Queda como candidato de fase posterior.
