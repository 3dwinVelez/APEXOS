# QA Intervencion Modulo Talento Humano - Browser + Concurrencia - 20260918

- Started: 2026-09-18T17:05:00.000Z
- Finished: 2026-09-18T18:15:00.000Z
- API: http://127.0.0.1:3000 (commit bdfaa1aa573f, health OK, 17 modulos)
- Web: http://127.0.0.1:3001 (Next.js dev, dark mode activo)
- DB: PostgreSQL local via Docker (puerto 55432)
- Usuario de prueba: demo@apex.local (APEX_ADMIN)
- Certificacion de concurrencia: docs/qa/evidence/hr-marking-concurrency-20260918/mass-certification.json

## Hallazgos y correcciones

- [CORREGIDO][alta] Ventana "Nueva asignacion de horario" (mallas): el formulario largo expandia la ventana y las acciones quedaban fuera de vista. Se agrego footer fijo (sticky) al ModalFrame con la accion "Asignar horario" siempre visible, conforme a la premisa UX "Acciones fijas al final cuando el contenido sea largo".
- [CORREGIDO][alta] Dialogo de validacion "Faltan datos para guardar" quedaba oculto detras del modal principal (z-[70] vs z-[100]). Se reemplazo por ModalFrame con portal, que renderiza por encima del modal principal.
- [CORREGIDO][media] Tokens de diseno: contenedores con bg-white y colores neutral-* que rompian el modo oscuro (html.dark). Migrados a tokens del design system (surface, paper, line, apex, warning, content-*) en toggle groups, grid de dias, selects, PeoplePicker, resumen y banners.
- [CORREGIDO][media] CSP de la web bloqueaba el WebSocket de colaboracion en tiempo real (ws://127.0.0.1:3000/collaboration/live) porque connect-src solo incluia el origen HTTP del API. Se agrego configuredWebSocketOrigin en lib/security/csp.ts: el origen ws se permite unicamente cuando coincide con el host del API configurado (wss queda cubierto por el scheme-source global). Verificado: el API responde 101 al handshake y el panel "Equipo" registra la sesion activa.
- [CORREGIDO][alta][backend] Carrera de asignacion de mallas: dos mallas simultaneas para la misma persona y fecha podian solaparse (TimeRoute no tiene constraint unico sobre employees). Se agregaron advisory locks por tenant:asignacion:employee:dia dentro de transaccion en createRoute/updateRoute/createRoutesBulk (mismo patron del flujo de marcacion: personas distintas no comparten lock).
- [CORREGIDO][baja][entorno] .env local apuntaba el WS a ws://localhost:3000 mientras la pagina corre en 127.0.0.1:3001; alineado a ws://127.0.0.1:3000.

## Resultados

- [PASSED] browser - Apertura de "Nuevo horario" en mallas: ventana compacta con scroll interno y accion fija al pie
- [PASSED] browser - Validacion sin personas seleccionadas: dialogo "Faltan datos para guardar" visible por encima del modal
- [PASSED] browser - Creacion real de malla (SEDE-PRINCIPAL, 2026-09-18, 08:00-17:00, Carlos Ruta Demo + Laura Ruta Demo): "Horario asignado correctamente", 17 registros en consulta
- [PASSED] browser - Modo oscuro: sin fondos blancos residuales en el formulario de mallas
- [PASSED] browser - Consola: sin errores CSP ni de runtime tras recarga (solo warning de StrictMode en dev, esperado)
- [PASSED] browser - Colaboracion en tiempo real: WebSocket abierto, panel "Equipo" con 1 sesion activa
- [PASSED] concurrencia - Certificacion masiva de marcacion (niveles 20/50/100): 850 peticiones, 0 errores, 0 duplicados, 0 perdidos, replays idempotentes correctos, visibilidad de rutas restringida al dia operativo
- [PASSED] unit - hr-marking-concurrency.test.js + hr-route-assignment-lock.test.js: 9/9
- [PASSED] unit - offline-csp.test.mjs (incluye configuredWebSocketOrigin): 11/11
- [PASSED] typecheck - apps/web tsc --noEmit sin errores
- [PASSED] lint - ESLint sin errores en ModalFrame.tsx, rutas/page.tsx, csp.ts, next.config.ts
- [PASSED] ecosistema - API (:3000), Web (:3001) y PostgreSQL (Docker) simultaneamente; logs del API sin errores durante la certificacion de 100 usuarios

## Monitoreo durante la prueba

- Log API (.tmp/api-local.log): 0 lineas con error/fail durante la certificacion masiva
- Log web (.tmp/web-local.log): 0 lineas con error/fail
- Consola del navegador (browser-use): sin errores de aplicacion tras la correccion del CSP
