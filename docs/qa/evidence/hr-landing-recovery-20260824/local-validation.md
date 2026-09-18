# Validación local previa a QA

- `npm --workspace apps/web run test:hr-landing`: 4/4 aprobadas.
- `npm run test:promotion-scope`: 4/4 aprobadas.
- `npm --workspace apps/web run typecheck`: aprobado.
- `npm --workspace apps/web run lint`: aprobado.
- `npm --workspace apps/web run build`: aprobado, 64 rutas generadas.
- Los blobs recuperados de la portada y la prueba coinciden exactamente con `88d2ca2`.
- La compilación no dejó artefactos generados dentro del candidato.
