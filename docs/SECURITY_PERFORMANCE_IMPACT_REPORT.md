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

## Fase 2 — resultados locales

| Control | Medición | Resultado |
| --- | --- | ---: |
| `/metrics` autorizado | 25 solicitudes, después de calentamiento | p50 2,221 ms; p95 3,489 ms |
| Firma binaria API | 100.000 detecciones JPEG | 6,434 ms total; 0,064 µs por detección |
| Firma web | lectura previa | 16 bytes por archivo |
| Integridad/dimensiones web | `createImageBitmap`, imagen limitada a 2 MB | asíncrono, una decodificación antes de carga |

El benchmark QA ejecutado durante el bloque A mostró alta variabilidad externa en `service_orders`: p95 812 ms y luego 395 ms, sin errores. El cambio local no estaba desplegado y Servicios HTML permaneció en 120–121 ms, por lo que no existe una relación causal con `/metrics`. El segundo resultado quedó dentro del presupuesto de 700 ms.

La compilación productiva, typecheck, lint, pruebas de contexto y pruebas negativas pasaron después del bloque de archivos. La sobrecarga de firma es despreciable; la decodificación asíncrona es el control necesario para detectar imágenes truncadas y limitar dimensiones, y sucede antes de la transferencia a Storage.

## Fase 3 — dependencias y RLS

El build de Next 15.5.22 conservó 64 rutas y tamaños de bundles equivalentes. Servicios web obtuvo p95 de 116,23 ms y 134,96 ms en las dos repeticiones; la segunda supone +11,9% frente a 120,59 ms y requiere observar la variabilidad, sin cambio desplegado. `service_orders` externo obtuvo 813,65 ms y luego 371,69 ms; la segunda muestra pasó el presupuesto.

Medición productiva simulando el rol `authenticated` y una membresía existente, 20 SELECT por objetivo:

| Flujo RLS | p50 cliente | p95 cliente | Execution Time del plan |
| --- | ---: | ---: | ---: |
| Servicios | 192,384 ms | 232,719 ms | 30,157 ms |
| Usuarios | 163,038 ms | 189,859 ms | 1,880 ms |
| Empleados | 179,451 ms | 250,119 ms | 7,083 ms |
| Evidencias | 205,251 ms | 281,743 ms | 34,155 ms |
| Storage | 200,833 ms | 226,668 ms | 42,675 ms |

El tiempo cliente incluye la conexión remota desde el puesto de auditoría. Los planes completos con buffers permanecen en los reportes temporales no versionados.
