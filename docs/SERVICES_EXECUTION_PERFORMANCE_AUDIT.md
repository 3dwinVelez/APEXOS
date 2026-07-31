# Services Execution Performance Audit

Fecha: 2026-07-23

## Flujo Analizado

Modulo Servicios, ejecucion tecnica de una orden: apertura de orden, inicio, inspeccion, captura de evidencias, avance a ejecucion, cierre/no ejecucion e historial.

## Arquitectura Actual

- Frontend: `apps/web/app/dashboard/servicios/[id]/page.tsx`.
- Captura: `apps/web/components/operations/PhotoCapture.tsx`.
- Cliente API/fallback Supabase: `apps/web/lib/api.ts`.
- Backend Fastify/Prisma: `apps/api/src/modules/services/service.js`.
- Storage en sesiones Supabase: `service_evidence` mas Storage mediante `uploadServiceImageData`.
- Backend local legacy: `servicePhoto` con `base64_data` o `file_url`.

## Metricas Iniciales

No se pudo ejecutar una orden real Nyvora fuera de localhost desde este entorno. La medicion inicial se basa en revision de flujo y puntos de espera:

| Accion | Cuello detectado | Riesgo |
| --- | --- | --- |
| Capturar fotografia | La vista previa aparecia despues de procesar/base64 | Percepcion lenta en moviles |
| Subir fotografia | Despues del POST se ejecutaba GET de todas las fotos | Recarga innecesaria de galeria |
| Reintentar fotografia | No habia idempotencia explicita por carga | Evidencias duplicadas |
| Avanzar estado | Respuesta completa reemplazaba estado local | Perdida de evidencias locales recientes |
| Escrituras API | Invalidacion global de cache GET | Refetch amplio posterior |

## Comportamiento De Fotografias

Antes:

- Optimizacion a JPEG existia, con limite objetivo de 2 MB.
- La preview dependia del archivo ya procesado.
- La carga fallida limpiaba la evidencia capturada.
- Cada carga consultaba de nuevo `/photos`.

Despues:

- Preview local inmediata con `URL.createObjectURL`.
- Se conserva optimizacion previa antes del envio.
- Estado por archivo: pendiente, cargando, cargada o fallida.
- La foto fallida queda en pantalla para reintento.
- Se anexa la evidencia retornada por el servidor sin recargar toda la galeria.
- Cada carga incluye `client_upload_id`, tamanos original/optimizado y `captured_at`.

## Consultas Afectadas

| Flujo | Antes | Despues |
| --- | --- | --- |
| Foto POST | `accessible order` + subida + insert + lectura de ultima evidencia + GET galeria completa desde frontend | `accessible order` + verificacion idempotente + subida + insert + lectura de ultima evidencia |
| Fallback Supabase | Sin busqueda por carga cliente | Busca `metadata->>client_upload_id` antes de crear |
| Backend Fastify | Siempre creaba `servicePhoto` | Retorna evidencia existente si coincide `client_upload_id` |
| Cache frontend | Escritura limpiaba toda cache GET | Escrituras de orden limpian cache de esa orden |

## Problemas Frontend

- Feedback inicial de foto no era inmediato.
- Spinner de evidencia ocultaba el estado real de fallo/reintento.
- La carga fallida podia hacer creer que se perdio la foto.
- La pagina recargaba fotos tras cada evidencia.

## Problemas Backend

- No existia idempotencia por evidencia.
- Las acciones de estado aun devuelven orden completa en Fastify y fallback Supabase. El frontend ahora fusiona la respuesta, pero sigue pendiente exponer respuestas minimas por endpoint.

## Problemas Storage

- El fallback aun sube desde base64 por compatibilidad. La mejora ideal siguiente es firma segura/direct upload browser-to-storage con registro posterior.
- No se midieron politicas RLS/Storage en ambiente real Nyvora en esta intervencion.

## Correcciones Aplicadas

- `PhotoCapture`: preview local inmediata, metadatos de tamanos, progreso visual y estados por archivo.
- Pagina de ejecucion: no borra foto en error, anexa evidencia retornada, previene doble carga localizada, fusiona respuestas de orden.
- `api.ts`: invalidacion especifica por orden y deduplicacion Supabase por `client_upload_id`.
- `service.js`: deduplicacion Prisma por `metadata.client_upload_id`.
- Smoke test: `npm run qa:services-performance`.

## Metricas Finales

Medicion automatizada local disponible:

| Accion | Antes p50 | Antes p95 | Despues p50 | Despues p95 | Mejora |
| --- | ---: | ---: | ---: | ---: | ---: |
| Abrir orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Iniciar orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Guardar respuesta | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Capturar fotografia | Preview tras procesamiento | Variable por archivo | Preview local inmediata | <100 ms esperado | Percepcion inmediata |
| Subir fotografia | POST + GET galeria | Mayor con muchas fotos | POST + append local | Menor por eliminar GET | 1 request menos |
| Avanzar paso | Reemplazo completo | Pendiente QA | Fusion local | Pendiente QA | Menos perdida de estado |
| Finalizar orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |

| Accion | Consultas antes | Consultas despues | Payload antes | Payload despues |
| --- | ---: | ---: | ---: | ---: |
| Subir fotografia frontend | POST + GET fotos | POST | Galeria completa adicional | Evidencia creada |
| Reintento fotografia | Creacion duplicable | Consulta idempotente + retorno existente | Duplicado posible | Registro unico |

| Tamano original | Tamano optimizado | Tiempo procesamiento | Tiempo carga | Red |
| ---: | ---: | ---: | ---: | --- |
| 500 KB | <=500 KB | Pendiente dispositivo | Pendiente QA | Pendiente |
| 2 MB | <=2 MB | Pendiente dispositivo | Pendiente QA | Pendiente |
| 5 MB | <=2 MB objetivo | Pendiente dispositivo | Pendiente QA | Pendiente |
| 10 MB | Rechazado por limite 8 MB actual | N/A | N/A | N/A |

## Riesgos Pendientes

- Ejecutar orden real con empresa Nyvora y perfil tecnico real en QA/prod.
- Instrumentar p50/p95 runtime por accion, incluyendo latencia movil.
- Implementar direct upload firmado a Storage.
- Separar endpoint minimo de cambio de estado para no devolver orden completa.
- Agregar pruebas E2E con red lenta y multiples fotos reales.

## Recomendacion Final

La intervencion elimina recargas innecesarias y mejora rendimiento percibido de evidencias, pero el flujo no debe declararse totalmente optimizado hasta correr mediciones Nyvora antes/despues en ambiente real.
