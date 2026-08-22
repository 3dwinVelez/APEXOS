# Validación local previa a QA

- API Servicios, correcciones, evidencia, permisos y consecutivos: 30/30 aprobadas.
- Web: corrección, inicio de órdenes, solicitud externa, permisos y agrupación de soportes: 26/26 aprobadas.
- Compuerta de alcance: 2/2 pruebas aprobadas.
- ESLint: aprobado.
- TypeScript: aprobado.
- Build Next.js: 64 rutas, aprobado.
- `git diff --check`: aprobado.

Esta evidencia habilita solamente la integración QA. La promoción a `main` permanece bloqueada hasta ejecutar el certificado maestro y el flujo navegador con el commit exacto de `develop`.
