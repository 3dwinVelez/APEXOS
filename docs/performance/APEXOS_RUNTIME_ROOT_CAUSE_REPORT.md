# APEXOS — auditoría de causa raíz del rendimiento real

## 1. Resumen ejecutivo

**Dictamen: CAUSA RAÍZ PARCIALMENTE IDENTIFICADA.**

No existe evidencia de que el diseño visual sea la causa dominante. El costo confirmado es mixto: 103 kB de JavaScript compartido, un shell autenticado con seis islas cliente, 77 límites cliente y una preparación de permisos de hasta cinco llamadas en varias olas antes de liberar la página. A la vez, las mediciones QA históricas muestran que Supabase REST (152–309 ms promedio según recurso) supera claramente al documento autenticado (~108–134 ms).

No se ejecutó ni conservó un piloto porque faltó una sesión QA reproducible para medir contenido útil, React renders y seguridad por rol/empresa. Cambiar el guard, permisos o caché sin esa validación sería riesgoso.

## 2. Commits y ambiente

- `main`: `4594572ad2c476cdccf23bfb6c661566274ab3a8`
- base funcional `develop`: `55f9318abcc84b761244ff50c7abd814e3220226`
- remediación visual de referencia: `fd0705827947d201edd80ccd78cd4e58e57c5960`
- rama aislada: `codex/perf-runtime-root-cause`
- Next 15.5.22; Node observado 24.14.0, aunque el repositorio exige 22.x.

La rama parte de `develop`, no de la remediación visual, y no modifica `main` ni `develop`.

## 3. Metodología y validación

Se inspeccionaron manifests/chunks del build, límites cliente, layouts, efectos, consumidores de dependencias y cascadas de acceso. Se comparó con métricas previas de `main` y con resultados QA existentes. TypeScript, ESLint, build productivo y prueba de contexto de rendimiento pasan.

Offline First: 40/49 pruebas pasan; nueve fallan en `offline-storage.test.mjs`, principalmente porque snapshots fechados quedan expirados en la fecha actual. Es una novedad de línea base, no producida por esta auditoría, y no se modificó.

Limitaciones: sin credenciales QA no hubo traza autenticada, React Profiler, throttling móvil real ni separación API/SQL. Node distinto del requerido puede afectar tiempos de build, no los tamaños emitidos.

## 4. Composición del bundle

El build contiene 2,796,833 bytes JS crudos en 103 archivos y 87,114 bytes CSS. Next reporta 103 kB compartidos. Administración queda en 23 kB de ruta y 179 kB First Load, esencialmente igual a `main` (180 kB). Dashboard llega a 262 kB por su código de ruta y gráficos.

El chunk compartido de 124,694 bytes contiene acceso/API/Supabase; el layout dashboard agrega 41,447 bytes crudos. Detalle completo en `APEXOS_BUNDLE_COMPOSITION.md`.

## 5. Límites Client/Server

Hay 77 límites cliente: 46 bajo Dashboard y 24 componentes compartidos. Aunque el layout dashboard es servidor, `RouteAccessGuard` envuelve todo el contenido y el layout monta Sidebar, headers, navegación móvil y experiencia IA. La optimización debe reducir el shell, no migrar 58 pantallas.

## 6. Providers y servicios globales

No hay un árbol de Context providers. El equivalente funcional son `SessionLifecycle` y `PlatformAlerts` en root, más acceso, Sidebar e IA en dashboard. `AiExperienceLayer` permanece montado aunque CSS lo oculte y registra storage, resize, scroll y consultas.

## 7. Sesión, empresa y permisos

En frío, `loadModuleAccess` consulta admins y empresas en paralelo, actualiza contexto API/empleado y finalmente consulta estado de módulos. Puede producir cinco llamadas en tres/cuatro olas. Sidebar y guard llaman la misma función, aunque una promesa por token evita duplicar simultáneamente la red y `sessionStorage` reutiliza el resultado.

## 8. Solicitudes

El documento no domina por sí solo: Dashboard 110.45 ms promedio, Usuarios/Roles 115.07 ms y Servicios 122.14 ms. Supabase: órdenes 308.97 ms, evidencias 200.18 ms, empleados 176.56 ms. Son resultados de concurrencia 10 y no sustituyen una navegación autenticada.

## 9. Frontend vs API vs base de datos

- Frontend confirmado: shell/hidratación global y First Load 127–262 kB según ruta.
- Red/REST confirmado: recursos de datos con 152–309 ms promedio.
- API: no evaluable en esa corrida (`api_url_configured=false`).
- Base de datos: no atribuible sin trazas SQL; no se recomiendan índices todavía.

Por tanto, no se puede declarar frontend o base de datos como causa dominante única.

## 10. Perfilado React

El perfil dinámico no fue posible sin sesión QA. El análisis estático identifica renders tras resolver permisos en Sidebar y guard; `AiExperienceLayer` posee aproximadamente diez estados y varios efectos/listeners. Esto es una hipótesis medible, no una cifra de renders. No se recomienda memoización indiscriminada.

## 11. Desktop

Administración no mejoró con el piloto visual previo porque 156 kB de sus 179 kB no pertenecen al código específico reportado de la ruta. Dashboard es más pesado (262 kB) por Recharts y lógica propia. La prioridad desktop es el camino crítico de acceso y datos.

## 12. Mobile

Mobile comparte el layout dashboard y, por tanto, el costo de permisos, navegación e IA. Ocultar desktop con CSS no evita hidratación. No se obtuvieron métricas Fast/Slow 4G; cualquier afirmación de mejora móvil sería no concluyente.

## 13. Servicios

Servicios carga 155 kB y detalle 163 kB. El costo de red de órdenes (309 ms promedio) y evidencia (200 ms) señala una oportunidad mayor que una nueva simplificación visual. Falta separar gateway, PostgREST y SQL.

## 14. Offline First

Dexie está confinado al módulo offline y no se detectó como dependencia global directa. No se alteraron almacenamiento, sincronización ni contratos. Los nueve fallos temporales de línea base deben tratarse en una tarea separada.

## 15. Causas raíz

1. **Preparación serial de acceso:** hasta cinco llamadas en varias olas; archivos `moduleAccess.ts`, `RouteAccessGuard.tsx`, `Sidebar.tsx`.
2. **Shell cliente transversal:** seis islas en `app/dashboard/layout.tsx`; la IA oculta sigue montada.
3. **Latencia de datos:** Supabase REST excede el tiempo de documento y muestra p95 de hasta ~400 ms.
4. **Costo específico de ruta:** Recharts explica parte de Dashboard, no Administración.

## 16–17. Pilotos y resultados

No se conservó ningún piloto. Falta la medición autenticada requerida para demostrar ≥10% de mejora o eliminar una cascada sin regresión de permisos.

## 18. Regresiones

No se introdujeron cambios funcionales. TypeScript, lint, build y prueba de rendimiento pasan. La suite offline conserva nueve fallos de línea base.

## 19. Riesgos

El mayor riesgo es reutilizar permisos entre empresa, usuario, rol o ambiente. También existe riesgo de diferir IA sin preservar eventos tempranos. No se debe optimizar caché ni mover el guard sin una matriz multirol.

## 20. Plan priorizado

1. Instrumentar marcas de acceso, primer contenido y datos con una cuenta QA por rol.
2. Pilotar la reducción de una ola serial en `loadModuleAccess`.
3. Pilotar carga bajo demanda de `AiExperienceLayer`.
4. Trazar Supabase/API hasta SQL en órdenes y evidencias.
5. Solo después revisar ruta Dashboard/Recharts.

## 21. Dictamen

**CAUSA RAÍZ PARCIALMENTE IDENTIFICADA.** Hay causas concretas y archivos responsables, pero faltan trazas autenticadas, React profiling y telemetría API/SQL para cuantificar cuál domina y validar un piloto con los umbrales exigidos.
