# Certificación funcional — Servicios Nyvora

Fecha: 2026-08-21. Ambiente: QA.

- Web desplegada: `03b66a10e2a687e244352c6a351419ff04412c7d` (`develop`).
- API desplegada: `e707147759e550b148f02c8896c82ed1e780dcb2`; el cambio evaluado no modifica la API.
- Orden real creada desde el enlace externo Nyvora: `OS-00001`, UUID `e159bdf6-0685-441e-aff1-44a906476eac`.
- Se ejecutaron dos solicitudes con referencias diferentes. Cada una recorrió inicio, inspección, ejecución, evidencias y finalización.
- La primera solicitud recorrió además bloqueo y reanudación sin quedar inmovilizada.
- Los mismos tipos de evidencia se cargaron en ambas solicitudes y quedaron agrupados en su solicitud correspondiente.
- El cierre persistió después de recargar: estado `Cerrada`, 2/2 solicitudes completas, encuesta 5.0/5 e historial íntegro.
- El botón PDF confirmó la generación con evidencias fotográficas.

Resultado: aprobado técnicamente en QA; pendiente aprobación funcional independiente identificada.
