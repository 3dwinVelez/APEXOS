# Security Performance Impact Report — Línea base

Esta fase no introdujo controles de ejecución; por tanto, no existe variación atribuible a seguridad. Los valores son la línea base que deberá repetirse con el mismo runner después de cada remediación.

| Flujo | Concurrencia | p50 | p95 | Payload | Errores |
| --- | ---: | ---: | ---: | ---: | ---: |
| Servicios HTML | 10 | 118,04 ms | 120,59 ms | 32,85 KB | 0 |
| Dashboard HTML | 10 | 118,98 ms | 124,72 ms | 36,00 KB | 0 |
| Usuarios/Roles HTML | 10 | 110,80 ms | 119,36 ms | 36,40 KB | 0 |
| Vehículos HTML | 10 | 107,21 ms | 115,60 ms | 36,10 KB | 0 |
| Marcaciones HTML | 10 | 114,84 ms | 125,04 ms | 33,62 KB | 0 |
| `service_orders` directo | 10 | 278,07 ms | 335,63 ms | 8,10 KB | 0 |
| Evidencias metadata | 10 | 178,09 ms | 182,51 ms | 34,05 KB | 0 |

Fuente: `reports/performance/qa-root-cause-2026-07-27T01-06-02-427Z.json`.

## Criterio para remediaciones

- Variación p95 menor de 10%: aceptable.
- Entre 10% y 20%: requiere explicación.
- Superior a 20%: rediseñar o justificar por riesgo.
- Las consultas de estado de usuario/rol deberán usar caché corta e invalidación para no añadir una consulta DB por endpoint.
- La validación de archivos no debe reenviar el blob por múltiples servicios; se autoriza, carga y confirma de forma separada.

No se midieron todavía creación de usuario/rol, fotografía, transición/cierre ni RLS vivo porque faltan cuentas QA aisladas y credenciales API específicas para esos flujos.
