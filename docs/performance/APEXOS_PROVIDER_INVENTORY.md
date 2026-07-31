# Inventario de providers y servicios globales

No se encontraron providers React Context tradicionales montados en los layouts. El costo global proviene de componentes cliente que actúan como servicios.

| Servicio | Montaje | Carga/efectos | Consumidores/render | Solicitudes | Reubicación |
|---|---|---|---|---|---|
| SessionLifecycle | root layout | listeners de actividad/visibilidad + timer 60 s | estado de sesión global | puede refrescar/cerrar sesión | Mantener, pero excluir públicas si el contrato lo permite |
| PlatformAlerts | root layout | error, rejection y eventos; cola de alertas | overlay global | No directa | Posible shell autenticado |
| RouteAccessGuard | dashboard layout | carga permisos al montar/pathname | bloquea todo `children` y hace rerender al resolver | Sí | Candidato principal |
| Sidebar | dashboard layout | carga permisos y actualiza navegación | solo navegación desktop | Sí, misma función que guard | Compartir snapshot |
| AiExperienceLayer | dashboard layout | storage, resize, scroll, asistencia e insights | overlay global; múltiples estados | Sí, insights/sesión | Bajo demanda o segmento |
| MobileNav | dashboard layout | pathname | navegación móvil | No directa | Mantener |

`Sidebar` y `RouteAccessGuard` invocan ambos `loadModuleAccess`. La implementación evita dos viajes simultáneos con una promesa por token y luego usa `sessionStorage`, por lo que no está demostrada una duplicación de red fría. Sí existen dos suscripciones de estado y dos renders consumidores.

El riesgo dominante es invalidar acceso entre empresa/usuario. La caché futura debe estar indexada por token, usuario, empresa, rol y ambiente; el TTL actual no debe ampliarse sin pruebas de revocación.
