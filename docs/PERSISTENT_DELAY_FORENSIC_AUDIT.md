# Diagnóstico Forense — Delay Persistente en Nyvora / APEXOS

Fecha: 2026-07-25  
Commit auditado: `135a665` (módulo facturación ventas y CxC)  
Commit corrección: `dc28d74`

## Síntomas

- La plataforma se siente lenta al navegar entre pantallas, guardar formularios y cambiar estados operativos.
- Las transiciones de órdenes de servicio (inicio, inspección, ejecución, cierre) tienen delay perceptible.
- Consultar información después de guardar requiere esperar.
- Capturar y visualizar fotografías tiene latencia.

## Hipótesis verificadas

| Hipótesis | Evidencia | Confirmada | Impacto | Corrección |
| --------- | --------- | ---------- | ------- | ---------- |
| Railway y Supabase en regiones diferentes | No se pudo medir directamente (sin Railway API); Supabase QA en `us-east-2` | No concluyente | Potencial 50-150ms | Pendiente: verificar región Railway en dashboard |
| C/acción retorna orden completa con includes | Código: `include: orderInclude()` incluye reference+parts+incidents+photos en cada transición | **Confirmada** | Alto | Migrado a `select` mínimo |
| Cada escritura invalida TODO el cache frontend | `clearApiReadCaches()` sin scope en cada mutación | **Confirmada** | Alto | Invalidación granular por scope |
| Backend realiza consultas secuenciales | `accessibleOrder()` + luego update en cada transición | Confirmada | Bajo-me dio | Dependiente de Prisma, difícil de fusionar |
| Las órdenes con fotos tienen payload grande | `orderInclude()` incluye fotos completas con `base64_data` | **Confirmada** | Alto | Transiciones ya no incluyen fotos |
| RLS agrega costo | `pg_stat_statements` histórico muestra 2.2s en evidence | Confirmada previamente | Medio | Ya migrado a Storage |
| 5+ consultas por pantalla inicial | Código `api.ts` + fallback Supabase | **Confirmada** | Alto | Invalidación granular evita refetch |
| Frontend espera procesos secundarios | No se encontraron sleeps artificiales | No confirmada | Medio | Pendiente revisión de modales |
| Auth repetido | Memoización de 30s ya existe | Corregido previamente | — | Ya implementado |
| Componentes grandes se rerenderizan | No instrumentado completamente | No concluyente | Potencial | Pendiente perfil React |

## Causa raíz principal

**Payload innecesario en cada transición de estado de servicios.** Cada cambio de estado (`startOrder`, `moveToInspection`, `moveToExecution`, `closeOrder`, `closeNotExecuted`) retornaba la orden completa con todas sus relaciones:

- Referencia + partes de referencia
- Todos los incidentes
- Todas las fotos (con `base64_data` completo en algunos casos)

Para un operario avanzando paso a paso (4-6 transiciones por servicio), esto significa descargar la orden completa 4-6 veces, incluyendo datos que no cambiaron.

## Causa raíz secundaria

**Invalidación global de caché en cada mutación.** `clearApiReadCaches()` sin argumento eliminaba TODO el caché de consultas GET del frontend. Después de cada transición (start, inspection, execution, close), el frontend:

1. Descartaba todos los datos cacheados
2. Refetch obligatorio de todas las consultas activas
3. Refetch de datos que no cambiaron (maestros, otros servicios, listados)

Esto explica el waterfall post-guardado: el usuario sentía que la pantalla se "refrescaba" completa en lugar de solo actualizar el paso.

## Distribución del tiempo estimada (antes de la corrección)

Para transiciones de estado de servicios:

| Capa | % estimado | Detalle |
| ---- | ---------- | ------- |
| Red frontend-backend | 15-20% | 1 solicitud simple |
| Auth + permisos | 5-10% | Caché de 30s |
| Consulta orden (`accessibleOrder`) | 15-25% | 1 SELECT con includes pesados |
| Serialización respuesta | 20-35% | Toda la orden con fotos → JSON |
| Transferencia payload | 10-20% | Tamaño de respuesta grande (50-500KB+) |
| Invalidación + refetch frontend | 25-40% | Refetch de todas las consultas activas |
| Renderizado | 10-20% | Re-render completo al recibir datos nuevos |

## Cambios aplicados

| Cambio | Archivo | Impacto esperado |
| ------ | ------- | ---------------- |
| Transiciones usan `select` mínimo | `service.js` | Reduce payload 70-95% |
| Invalidación granular de caché | `api.ts` | Elimina refetch masivo |
| `interactionId` en logs | `performanceContext.js + server.js` | Permite trazar E2E |
| `serialization_ms` tracking | `performanceContext.js` | Mide serialización real |

## Métricas esperadas post-corrección

| Acción | Antes (estimado) | Después (estimado) |
| ------ | --------------- | ------------------ |
| Iniciar orden | 800-2000ms | 150-400ms |
| Avanzar a inspección | 1000-2500ms | 200-500ms |
| Avanzar a ejecución | 800-2000ms | 150-400ms |
| Cerrar orden | 1500-3000ms | 400-800ms |
| Guardar paso | 800-2000ms | 200-500ms |

## Riesgos pendientes

- Regiones no verificadas (Railway dashboard)
- Pool de conexiones Prisma no auditado en producción
- No se probó con datos reales de producción
- React Profiler no ejecutado (requiere sesión autenticada)
- Las transiciones de orden reducen payload pero siguen necesitando validar datos localmente

## Recomendaciones adicionales

1. Desplegar estas correcciones en QA y ejecutar perfil de red con Chrome DevTools
2. Verificar región Railway vs Supabase desde el dashboard Railway
3. Apuntar `NEXT_PUBLIC_API_URL` al backend Railway QA (no localhost)
4. Medir p50/p95 con datos reales y 50+ órdenes concurrentes
5. Si la latencia persiste: evaluar endpoint agregado para dashboard
