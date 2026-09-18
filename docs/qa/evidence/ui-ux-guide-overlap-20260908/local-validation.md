# Corrección local — superposición de ayuda APEX AI

Fecha: 2026-09-08

Rama: `desarrollo`

Estado: aprobado localmente; revalidación QA pendiente.

## Novedad reproducida

En QA, el botón flotante **Abrir ayuda contextual de APEX AI** quedaba sobre **Continuar** cuando el navegador desplazaba el formulario de creación de producto. El clic destinado a avanzar abría nuevamente la guía y bloqueaba el paso 2.

## Corrección

- Se elevó el lanzador flotante de APEX AI en escritorio para no cubrir las acciones inferiores de formularios.
- La certificación navegador ahora usa un clic físico real sobre **Continuar** y falla si aparece **Cerrar guía** después del clic.
- No se guardaron ni modificaron datos empresariales durante la prueba.

## Evidencia

- `local-browser-certification.json`: 13/13 comprobaciones aprobadas.
- `node --test apps/web/test/login-phase-zero-ux.test.mjs apps/web/test/phase-one-design-system.test.mjs`: 23/23.
- `npm --workspace apps/web run typecheck`: aprobado.
- `npm --workspace apps/web run lint`: 0 errores; 9 advertencias preexistentes.
- `npm --workspace apps/web run build`: aprobado; 100 rutas.

La fase no se declara cerrada en QA hasta promover esta corrección mediante `desarrollo -> develop` y repetir el flujo autenticado en el ambiente publicado.
