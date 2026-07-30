# Composición del bundle de APEXOS

## Resultado

El build productivo de `develop@55f9318` genera 103 archivos JavaScript (2,796,833 bytes sin comprimir) y un CSS global de 87,114 bytes. Next.js informa 103 kB compartidos por todas las rutas.

| Ruta | Ruta | First Load JS |
|---|---:|---:|
| Login | 7.22 kB | 117 kB |
| Dashboard | 11.6 kB | 262 kB |
| Administración | 23.0 kB | 179 kB |
| Servicios | 16.8 kB | 155 kB |
| Detalle servicio | 14.9 kB | 163 kB |
| WMS | 21.0 kB | 127 kB |

La comparación con `main@4594572` es prácticamente neutra: Administración 180→179 kB, Dashboard 263→262 kB y Servicios 155→155 kB. Esto descarta una regresión grande atribuible a los commits funcionales recientes.

## Chunks de Administración

Tamaños siguientes son bytes crudos de los archivos emitidos; no deben sumarse directamente al valor comprimido de Next.

| Chunk | Bytes | Alcance/importador dominante | Inicio | Optimizable |
|---|---:|---|---|---|
| `webpack` | 3,704 | runtime global | Sí | Bajo |
| `87` | 173,023 | framework compartido | Sí | Bajo |
| `18` | 173,994 | framework compartido | Sí | Bajo |
| `9664` | 8,555 | shell cliente | Sí | Bajo |
| `2009` | 10,180 | iconografía Lucide | Sí | Medio |
| `3714` | 19,758 | ruta Administración | Sí | Medio |
| `2883` | 124,694 | API, acceso, Supabase y utilidades compartidas | Sí | Alto |
| `3584` | 25,741 | acceso de módulo/Supabase | Sí | Alto |
| layout dashboard | 41,447 | Sidebar, guard, navegación e IA | Sí | Alto |
| página Administración | 94,500 | UI y lógica de ruta | Sí | Medio |

La evidencia disponible no incluye source maps ni un analizador webpack instalado. Se usaron los manifiestos de cliente de Next y búsqueda de símbolos en chunks como mecanismo equivalente. No se detectó una duplicación demostrable de React u otra librería base.

## Dependencias

- `recharts` tiene dos consumidores: Dashboard y Proyectos; explica que Dashboard sea la ruta más pesada, pero no los 179 kB de Administración.
- `dexie` está confinado a Offline First y sus pruebas; no se carga globalmente por import directo.
- `lucide-react` tiene consumidores amplios, pero `optimizePackageImports` está configurado.
- `zustand` tiene un único consumidor (`store/auth.ts`).
- No se encontraron consumidores de aplicación para React Query, React Hook Form o Zod. Esto amerita confirmación antes de retirar paquetes; instalados no equivale a enviados al navegador.

La mejor oportunidad no es reemplazar primitivas visuales: es reducir el shell cliente y separar la preparación de permisos del código compartido.
