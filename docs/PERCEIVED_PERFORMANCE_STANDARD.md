# Estándar de Rendimiento Percibido

## Principios

1. **Respuesta visual inmediata** — Toda interacción del usuario debe tener feedback visual en <100ms.
2. **Actualizaciones optimistas** — La UI debe reflejar el cambio localmente antes de confirmación del servidor.
3. **Estados de sincronización** — Cada operación debe mostrar su estado: pendiente, confirmando, confirmado, error.
4. **Carga no bloqueante** — Las operaciones pesadas (fotos, reportes) no deben bloquear la interacción principal.
5. **Cierre de modales** — Los modales deben cerrarse inmediatamente, no esperar confirmación del backend.
6. **Invalidación granular** — Una mutación solo invalida el caché de la entidad modificada, no todo el módulo.
7. **Precarga** — El siguiente paso debe iniciar su carga antes de que el usuario lo solicite.
8. **Presupuesto de renderizado** — Ningún componente debe tomar >50ms en renderizar.

## Reglas para el frontend

### Mutaciones
- Usar `clearApiReadCaches(scope)` con scope específico, nunca sin argumento.
- Cuando sea seguro, actualizar el caché local directamente en lugar de forzar refetch.
- El modal debe cerrarse antes de que llegue la respuesta del backend.

### Navegación
- La navegación entre pasos del servicio debe ser inmediata, con optimistic state.
- La pantalla de listado debe mantener su scroll y filtros al regresar desde detalle.
- Los KPIs y filtros deben conservarse en estado local (no recargarse de la API).

### Fotografías
- Vista previa local inmediata con `URL.createObjectURL`.
- Estado por archivo: pendiente, cargando, cargada, fallida.
- La foto no debe desaparecer al fallar: debe mostrar botón de reintento.
- La galería no se recarga completa después de subir una foto.
- Las fotos se comprimen antes de subir (máximo 2MB).

### Cache
- GET cache TTL: 10s, stale-while-revalidate: 60s
- Mutación → invalidar solo la ruta de la entidad modificada
- No invalidar consultas de maestros, listados de otros módulos, ni datos no relacionados
- El caché de acceso a módulos dura 60s en sessionStorage

## Presupuestos por acción

| Acción | Presupuesto |
| ------ | ----------- |
| Feedback visual al tocar | <100ms |
| Abrir orden de servicio | <1000ms ideal |
| Transición de estado (backend) | p95 <500ms |
| Guardar respuesta sin foto | p95 <600ms |
| Avanzar paso en wizard | p95 <400ms |
| Preview de fotografía | Inmediata (local) |
| Cerrar modal | <50ms |
| Regresar a listado | <300ms |
| Carga de foto (upload+confirm) | <2000ms en 4G |
| Consulta de listado | p95 <1000ms |

## Verificación

Usar Chrome DevTools Performance/Network para medir:

- `performance.mark()` + `performance.measure()` para interacciones clave
- Network waterfall para identificar solicitudes secuenciales
- React Profiler para detectar renders excesivos

Ejemplo de medición:

```javascript
performance.mark("avanzar-paso-start");
await api(`/api/v1/services/orders/${id}/execution`, { method: "PATCH" });
performance.mark("avanzar-paso-end");
performance.measure("avanzar-paso", "avanzar-paso-start", "avanzar-paso-end");
```
