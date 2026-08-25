# Certificación funcional — inicio de solicitud externa

Ambiente QA, empresa modelo NYVORA, 2026-08-21.

- Web y API certificadas sobre el commit exacto de `develop`: `042f88684b94a6a9fa4358458d6325d11b812839`.
- Se creó desde el formulario externo la orden `OS-00002` (`404d5467-e07d-45d4-bd81-83c0783bcbf4`) con dos solicitudes.
- Un técnico autorizado inició la primera solicitud externa: la orden pasó a `Ejecucion`, la solicitud 1 a `En curso` y la solicitud 2 permaneció `Pendiente`.
- El estado persistió después de recargar.
- Bloquear y reanudar restauró correctamente el paso de inspección.
- Una recarga posterior al despliegue exacto de `develop` volvió a mostrar `Ejecucion`, solicitud 1 `En curso`, solicitud 2 `Pendiente` y el paso de inspección.
- La creación API Nyvora produjo la orden interna `59` y completó corrección, autorización y persistencia de evidencia.

Resultado: aprobado.
