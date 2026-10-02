# Functional Evidence — hr-report-modal-scroll-lock-20261001

TEST: Detalle de trazabilidad del reporte de horas de Talento Humano.
RESULTADO: passed.
ESPERADO: Al abrir "Ver", la ventana emergente aparece en primer plano, conserva la visual del monitor, bloquea el scroll del reporte de fondo y permite desplazar solo su contenido interno.
OBTENIDO: `reportes/page.tsx` bloquea `document.body.style.overflow`, enfoca el dialogo con `detailDialogRef`, mantiene overlay `fixed inset-0`, usa `overscroll-contain` y conserva la estructura visual tipo monitor.
EVIDENCIA: `node --experimental-strip-types --test test/hr-report-punch-alerts.test.mjs test/hr-reports-xlsx.test.mjs` en `apps/web`: 6 passed.

