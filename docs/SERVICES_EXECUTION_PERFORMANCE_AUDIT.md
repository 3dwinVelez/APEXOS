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
| Subir fotografia | Habia proteccion parcial de duplicados, pero sin idempotencia por intento de carga | Reintentos ambiguos |
| Reintentar fotografia | El error podia limpiar la evidencia capturada | Perdida de confianza y recaptura |
| Avanzar estado | Respuesta completa reemplazaba estado local | Perdida de evidencias locales recientes |
| Escrituras API | Invalidacion global de cache GET | Refetch amplio posterior |

## Correcciones Aplicadas

- `PhotoCapture`: preview local inmediata, metadatos de tamanos, progreso visual y estados por archivo.
- Pagina de ejecucion: conserva foto en error, anexa evidencia retornada, previene doble carga localizada, fusiona respuestas de orden.
- `api.ts`: invalidacion especifica por orden y deduplicacion Supabase por `client_upload_id`.
- `service.js`: deduplicacion Prisma por `metadata.client_upload_id` antes de la regla existente de duplicados.
- Smoke test: `npm run qa:services-performance`.

## Metricas Finales

| Accion | Antes p50 | Antes p95 | Despues p50 | Despues p95 | Mejora |
| --- | ---: | ---: | ---: | ---: | ---: |
| Abrir orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Iniciar orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Guardar respuesta | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |
| Capturar fotografia | Preview tras procesamiento | Variable por archivo | Preview local inmediata | <100 ms esperado | Percepcion inmediata |
| Subir fotografia | POST con duplicado protegido | Pendiente QA | POST idempotente + append local | Menor riesgo por reintento | Menos friccion |
| Avanzar paso | Reemplazo completo | Pendiente QA | Fusion local | Pendiente QA | Menos perdida de estado |
| Finalizar orden | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente QA | Pendiente |

| Accion | Consultas antes | Consultas despues | Payload antes | Payload despues |
| --- | ---: | ---: | ---: | ---: |
| Subir fotografia frontend | POST | POST idempotente | Evidencia creada | Evidencia creada o existente |
| Reintento fotografia | Duplicado bloqueado por tipo | Retorno por `client_upload_id` | Error/reintento ambiguo | Registro unico |

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

La intervencion mejora rendimiento percibido de evidencias y reduce riesgo de duplicados por reintento, pero el flujo no debe declararse totalmente optimizado hasta correr mediciones Nyvora antes/despues en ambiente real.
