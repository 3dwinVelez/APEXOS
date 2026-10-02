# Error Handling Evidence — hr-report-modal-scroll-lock-20261001

TEST: Cierre/restauracion del modal.
RESULTADO: passed.
ESPERADO: Al cerrar el detalle se restaura el overflow previo del documento sin dejar bloqueada la pantalla.
OBTENIDO: El efecto React conserva `previousOverflow` y lo restaura en cleanup cuando `selected` vuelve a `null` o el componente desmonta.
EVIDENCIA: Revision de diff en `apps/web/app/dashboard/talento-humano/reportes/page.tsx` y certificacion local passed.

