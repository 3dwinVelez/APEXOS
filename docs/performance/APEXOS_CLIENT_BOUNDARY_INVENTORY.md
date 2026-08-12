# Inventario de límites Client/Server

Se identificaron 77 archivos con `"use client"`: 46 páginas/componentes bajo Dashboard, 24 componentes compartidos y 7 rutas públicas u otros límites.

| Archivo/grupo | Motivo | Subárbol | JS | ¿Reducible? | Riesgo |
|---|---|---|---:|---|---|
| `app/dashboard/layout.tsx` (server) | Importa seis islas cliente | Todas las rutas autenticadas | 41,447 B de chunk layout | Sí | Alto |
| `RouteAccessGuard.tsx` | estado, efecto, pathname/router, permisos | Todo `children` de la ruta | chunks acceso compartidos | Sí | Alto: seguridad/UX |
| `Sidebar.tsx` | estado, efecto, permisos | navegación desktop | 6,906 B fuente | Parcial | Medio |
| `AiExperienceLayer.tsx` | 10 estados, varios efectos, eventos y consultas | overlay global de dashboard | 21,469 B fuente | Sí | Medio |
| `PlatformAlerts.tsx` | listeners globales y estado | aplicación completa, incl. públicas | 4,213 B fuente | Sí | Bajo/medio |
| `SessionLifecycle.tsx` | actividad, visibilidad e intervalo | aplicación completa | 949 B fuente | Parcial | Alto |
| `MobileNav.tsx` | pathname e interacción | dashboard completo | 1,895 B fuente | Poco | Bajo |
| `ApexAiHeader.tsx` | pathname/estado de IA | dashboard completo | 1,488 B fuente | Sí | Bajo |
| `TechnicianWorkspaceHeader.tsx` | sesión/navegación | dashboard completo | 1,542 B fuente | Parcial | Medio |
| 46 límites bajo dashboard | formularios, tablas, gráficos, captura y navegación | ruta individual | variable | Caso por caso | Variable |

Hallazgo principal: el layout no es Client Component, pero envuelve todas las páginas en `RouteAccessGuard` cliente y monta cinco islas adicionales. La capa IA se oculta con CSS (`technician-hide`), no mediante montaje condicional; por ello su JavaScript, efectos y listeners existen aunque el usuario no vea el elemento.

No se recomienda migrar las 46 pantallas. El orden seguro es: instrumentar, bajar el guard al segmento mínimo o resolver acceso antes del render, y cargar la experiencia IA bajo demanda. Cualquier cambio al guard requiere pruebas explícitas de roles y empresas.
