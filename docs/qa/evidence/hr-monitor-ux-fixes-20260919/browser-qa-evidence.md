# Evidencia de navegador QA — correcciones UX del monitor de mallas horarias

- change_id: hr-monitor-ux-fixes-20260919
- Ambiente: QA (Railway)
- API: https://apexos-api-qa-production.up.railway.app (commit desplegado a45aa6cfe733; apps/api sin cambios en este alcance, c92969e es ancestro)
- Web: https://apexos-web-qa-production.up.railway.app (CSS servido contiene `@keyframes apexPageEnter{...to{opacity:1;transform:none}}`)
- Tenant SCJ QA: cbbf3627-4336-4f23-95c6-1077414bcd17
- Login de navegacion: qa.browser.202609191425@scj.test (APEX_ADMIN, deshabilitado al terminar)
- Rutas fixture: 273 (hoy, 4 marcaciones + 1 actividad + 3 evidencias) y 274 (2026-09-16, 2 marcaciones). Reactivadas para la navegacion y desactivadas al cerrar.
- Fecha de ejecucion: 2026-09-19
- Errores de consola: 0

## Certificacion funcional QA (script versionado)

`scripts/certifications/hr-monitor-ux-fixes-qa.js` ejecutado contra API+Web QA: **16/16 controles OK**
(ver `qa-certification.json`). Incluye `web_css_page_enter_transform_none` sobre el CSS realmente servido por QA.

## Defectos verificados en el despliegue QA

### 1. Lightbox amplia la evidencia (antes no permitia verla)
- Capa `position:fixed` z-index **110** cubriendo el viewport completo (537x574).
- Imagen de evidencia ampliada a **542x376** px dentro del lightbox.
- Evidencia: `qa-03-lightbox-evidencia-ampliada.png`.

### 2. Horario antiguo abre en la parte superior (antes obligaba a devolver el scroll)
- Con la pagina desplazada a `scrollY=898`, el drawer del horario 274 (2026-09-16) abre como
  `position:fixed` z-index **70**, `top=0`, `height=537` (= alto del viewport, no el alto del documento).
- Contenedor interno de scroll con `scrollTop=0` (scrollHeight 568 > clientHeight 380): las marcaciones
  son visibles desde el inicio sin devolver el scroll.
- Evidencia: `qa-05-monitor-historico-scrolltop.png`.

### 3. Monitor de mallas moderno, compacto e intuitivo (antes ajigantado y mal distribuido)
- KPIs en tarjetas (HORARIOS 90, ACTIVOS 68, PERSONAS 427, ADM/OP 39/51, SEGUIMIENTO 62%, SIN PERSONAS 0).
- Drawer compacto ajustado al viewport con badges (4 marcaciones / 1 actividad / 3 evidencias / 1-2 en vivo),
  equipo asignado con chips Entrada-Almuerzo-Retorno-Cierre y timeline cronologico con GPS, tolerancia y evidencia.
- Evidencia: `qa-01-mallas-lista-kpi.png`, `qa-02-monitor-drawer-viewport.png`.

### 4. Linea entre puntos de marcacion en el mapa (antes no se dibujaba)
- Polyline `stroke=#16a34a` (TRAIL_PALETTE[0]) `stroke-dasharray="10 8"` conectando **4 puntos**
  (las 4 marcaciones de la ruta 273) en orden cronologico, mas el trail de pings GPS `#0ea5e9`.
- Leyenda "Ruta entre marcaciones" presente.
- Evidencia: `qa-04-mapa-ruta-entre-marcaciones.png`.

## Controles de no regresion observados en QA
- Aislamiento de tenant y permiso hr:read validados por el script (marking_only_role_denied_batch 403,
  cross_tenant_batch_isolated, invalid_route_id_controlled 400).
- Resumen de ruta cuenta todas las evidencias (route_summary_counts_all_evidence >= 3).
- Sin errores de consola durante todo el recorrido.

## Limpieza
- Rutas 273/274 desactivadas; usuario de navegacion deshabilitado; usuarios y rutas del script de
  certificacion desactivados por el bloque `finally` del propio script.
