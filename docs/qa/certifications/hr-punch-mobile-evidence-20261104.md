# Fotos moviles en la trazabilidad de Talento Humano

Fecha local: 2026-11-04. Rama: desarrollo. Alcance: fotos de la seccion Trazabilidad cronologica del equipo del monitor de horarios/rutas.

## Fuente y contrato

Las fotos de las marcaciones se leen del mismo registro TimePunch que crea la app movil. Se reconoce metadata.identity_photo.base64_data o base64, con soporte de data URI y base64 crudo. Se conservan extra_evidence, metadata.extra_evidence y metadata.photo para compatibilidad. Un lector puro compartido por API y adaptador web aplica la misma normalizacion y elimina duplicados por contenido/URL.

El resumen, los contadores, la carga individual y el lote usan ese lector. Cuando una marca tiene foto de identidad y soporte adicional se devuelven ambos; las miniaturas y la ampliacion muestran la coleccion completa. El resumen no contiene los bytes de las fotos, tampoco dentro de metadata; la imagen se obtiene por los endpoints de evidencia existentes.

El monitor consulta la API operativa. Las lecturas de monitor-evidence, operations-map, routes y routes/event-summaries no caen al respaldo de tablas antiguas de Supabase cuando la API falla. Un error se presenta como error en vez de consultar otro registro con el mismo identificador en una tabla distinta.

Las fotos de actividades conservan WorkActivity/ActivityEvidence y se integran en la misma trazabilidad por la API. No se trasladan actividades a TimePunch, no se duplican fotos ni se cambian los datos de la app movil. Esta intervencion unifica la lectura de la vista, no convierte eventos diferentes en una unica tabla fisica.

La consulta individual y el lote mantienen el tenant autenticado y hr:read. Se rechazan origen/ID invalidos. Las fotos de identidad admiten MIME de imagen; los soportes heredados conservan documentos/videos admitidos por la politica existente.

## Verificacion

52 pruebas aprobadas, 0 fallidas:

```powershell
node --test apps/api/test/hr-punch-mobile-evidence.test.js apps/api/test/hr-monitor-evidence-demand.test.js apps/api/test/hr-route-event-summaries.test.js apps/api/test/hr-monitor-silent-failures.test.js apps/web/test/hr-punch-mobile-evidence.test.mjs apps/web/test/hr-schedule-monitor.test.mjs apps/web/test/hr-monitor-refresh.test.mjs apps/web/test/hr-monitor-modal-per-user.test.mjs
```

TypeScript: npx tsc --noEmit --project apps/web/tsconfig.json --incremental false aprobado. Sintaxis Node y git diff --check aprobados. npm run performance:guard: targets=17 failures=0.

Certificacion de extremo a extremo reproducible:

```powershell
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js
```

Resultado final: passed, exit_code=0, unexpected_5xx=[]. Inicio 2026-11-05T02:55:58Z; fin 2026-11-05T02:57:25Z (noche del 4 de noviembre en Bogota).

Se creo una base PostgreSQL local aislada con copia de esquema sin datos. Para completar el entorno se aplicaron solo las secciones 1-2 de la migracion existente de Sedes y la migracion aditiva existente 20260919110000_time_route_kind_descanso. La base local compartida y los entornos remotos permanecieron intactos. La primera preparacion mostro la ausencia de TimeRoute.kind en el esquema local; se corrigio exclusivamente en la base de certificacion antes de la ejecucion aprobada.

Tres grupos comprobados con datos sinteticos reales:

1. El resumen operativo y los contadores reconocen cuatro fotos moviles, un soporte adicional y una foto de actividad. El resumen no filtra bytes de imagen.
2. Carga individual y por lote leen las fotos de TimePunch; se conserva ActivityEvidence. Los controles sin sesion, sin permiso y de otra empresa responden 401, 403 y 404 respectivamente.
3. Chrome real abre la seccion solicitada, renderiza seis imagenes decodificadas (cuatro marcaciones, soporte y actividad) y abre la ampliacion. No se interceptaron respuestas para simular resultados.

Artefactos locales generados: .local/hr-punch-mobile-evidence/certification.json, isolated-certification.json, certification.log, next.log, timeline.png y lightbox.png. Los colores planos son imagenes sinteticas JPEG/PNG de prueba; no se usaron rostros de personas. La captura puede incluir un aviso 403 del catalogo opcional de vehiculos porque el tenant sintetico habilita solo HR/Administracion; no impide el flujo certificado de fotos. No hubo respuestas 500.

## Entrega

Cambio funcional y evidencia guardados juntos en desarrollo. Quedan fuera del commit los logs, capturas, caches, secretos y cambios ajenos del workspace. No se hizo push, promocion, despliegue ni migracion remota. QA funcional desplegada pendiente; no se propone promocion de ramas en esta intervencion.


## Reconstruccion puntual para QA (destino actual)

El destino avanzo a 1590f8413cdb45b6445d3429019c8f89400e4210 mediante el PR #76 antes de esta promocion. Se reconstruyen exclusivamente los hunks de fotos del commit 303fdbb9 de desarrollo sobre ese destino, en la rama auxiliar previamente autorizada codex/qa-hr-employee-user-link-20261104. No se transportan la interfaz de asociacion de empleados ni el hub de Talento Humano, que son cambios separados.

Se conservan el alta, firma y restablecimiento biometrico y la insignia Identidad verificada. La API mantiene la fuente identity para selfies y punch para soportes, ambas sobre TimePunch; identityEvidenceOf delega al lector compartido. El lote conserva identity_evidence para compatibilidad. La web combina las colecciones, aplana los soportes multiples y deduplica por contenido/URL. No se cambia la verificacion criptografica ni la autorizacion de restablecimiento.

85/85 pruebas seleccionadas aprobadas sobre el destino integrado, incluidas las 26 pruebas de identidad movil, las pruebas del restablecimiento biometrico en empleados y el monitor de selfies. La certificacion integrada del navegador, los controles de la identidad por HTTP y sus resultados finales se registran en el manifiesto pre-QA de esta promocion despues de ejecutarlos. El arbol funcional se congela en el commit reconstruido antes de crear los manifiestos. La evidencia anterior conserva el contexto de la certificacion original; no sustituye la recertificacion del candidato integrado.
