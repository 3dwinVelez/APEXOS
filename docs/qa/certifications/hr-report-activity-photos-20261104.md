# Fotos de actividades en Reportes

La ventana Reportes > Trazabilidad de jornada conservaba ActivityEvidence en los datos, pero solo renderizaba el contador. Se conecta cada evento a HrTimelineEvidence para mostrar y ampliar las fotos. Se conservan las selfies y las insignias existentes en develop. Los soportes de TimePunch admiten base64 y base64_data; las actividades siguen usando ActivityEvidence, sin mover ni duplicar registros.

Implementado primero en desarrollo: 26e1aac2 y 5400bee7. Reconstruccion puntual sobre develop df4e70e8c56e42607573c79be51e6af44a0e5d2f; no incluye otras funciones locales.

## Certificacion ejecutada

Comando: CERT_BROWSER_PORT=3321 node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js

Resultado passed, exit_code 0; 2026-11-05T03:44:42.166Z a 2026-11-05T03:46:41.433Z. Base PostgreSQL local aislada apexos_cert_hr_assoc_1793850258454, API HTTP real y Chrome real. Sin respuestas simuladas, sin cambios remotos ni en la base compartida. Imagenes sinteticas JPEG/PNG, sin datos personales. unexpected_5xx=[]

Cuatro grupos pasaron: resumen sin bytes y contadores; lectura individual/lote de TimePunch y ActivityEvidence mas 401/403/404; fotos y ampliacion en Rutas; foto decodificada de Inicio de ruta y ampliacion en la ventana exacta de Reportes. Las capturas report-activity-photo.png y report-activity-expanded.png se inspeccionaron localmente. Los artefactos y logs quedan en .local/hr-punch-mobile-evidence/ y no se versionan.

Regresion: node --test apps/web/test/hr-report-punch-alerts.test.mjs apps/web/test/hr-report-punch-selfie.test.mjs apps/web/test/hr-punch-mobile-evidence.test.mjs: 10/10. TypeScript: npx tsc --noEmit --project apps/web/tsconfig.json --incremental false, exit_code 0. La certificacion de navegador conserva ademas el flujo completo de Rutas. No hay cambios de backend, esquema, biometria, permisos o infraestructura.

QA funcional del usuario pendiente tras el despliegue. Esta evidencia local no constituye aprobacion de produccion.
