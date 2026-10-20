# Liquidación: código incremental automático — 2026-10-19

Rama: desarrollo. Base: `35691fb783c560bb60251b9f5ca010105781d53e`. Candidato: working tree, conservando los ajustes anteriores de liquidación y tarifarios.

## Cambio

El código del paquete se genera exclusivamente en servidor con formato `LIQ-000001`, `LIQ-000002`, etc., independientemente por empresa. La solicitud de creación ya no exige código; si un cliente anterior lo envía, ese valor no sustituye el consecutivo. El formulario explica que se asignará al guardar y no tiene un campo de captura manual. El mensaje de confirmación y el detalle muestran el código definitivo.

La lectura del mayor consecutivo y la inserción se ejecutan en la misma transacción, después de obtener el advisory lock de transporte del tenant. La restricción única existente `[tenant_id, code]` se conserva. Se incluyen los códigos de todos los estados, incluidos cancelados; no se reutiliza un número por cancelar una liquidación. Los dígitos pueden crecer después de seis posiciones, usando BigInt para no perder precisión.

Los códigos históricos y personalizados permanecen intactos. Solo el patrón `LIQ-<dígitos>` participa en la secuencia nueva; códigos como `LIQ-2026-005` no se renumeran ni se interpretan como un consecutivo nuevo. No hay reinicio anual. Una creación que revierte su transacción no consume el siguiente código. No se añadió contador, tabla ni migración estructural en esta continuación.

## Evidencia

- **79 pruebas aprobadas, 0 fallos**: cuatro casos nuevos de consecutivo (inicio/históricos, máximo, crecimiento/precisión y límite), más motor, costos, criterios, permisos, consolidación, UI y respuestas asíncronas del selector de tarifas.
- **55 comprobaciones reales de API aprobadas** mediante `scripts/certifications/transport-settlement-four-stages-local.js`. Incluyen creación sin código, rollback sin consumirlo, dos solicitudes concurrentes con códigos distintos y consecutivos, código manual ignorado y empresa sintética independiente con `LIQ-000001` y `LIQ-000002`; además de tarifas, soportes, aislamiento, cuatro etapas, inmutabilidad y contabilización idempotente.
- **41 comprobaciones de regresión aprobadas** mediante `scripts/certifications/transport-settlement-packages-local.js`. Los clientes que todavía envían código conservan el flujo, recibiendo el generado por el servidor.
- **18 comprobaciones de navegador aprobadas** mediante `scripts/certifications/transport-settlement-four-stages-browser.mjs`. Creación real sin captura de código, asignación de fletes, total 124.000 COP, aprobación, contabilización, liquidación y reapertura. Código recibido y conservado: **LIQ-000013**.
- Revisión visual en escritorio 1536×1024 y móvil 390×844. Se utilizó una pestaña de pruebas separada para conservar el borrador del usuario; esa pestaña se cerró y se restauró el viewport.
- TypeScript, ESLint de la página/editor y `git diff --check`: aprobados.

Evidencia fuera de Git, bajo `C:/Users/mq1/AppData/Local/Temp/`:

- `apexos-settlement-code-local-20261019.json` y `apexos-settlement-code-legacy-20261019.json`.
- `apexos-settlement-code-tests-20261019.log`.
- `apexos-settlement-code-browser-20261019/browser.json`, `creation-desktop.jpg`, `generated-code-desktop.jpg`, `generated-code-mobile.jpg` y `creation-mobile.jpg`.
- `apexos-settlement-code-certified-worktree-20261019.json`, inventario y hashes del candidato.

La primera preparación de la fixture de otra empresa detectó que su creación directa requería `tenant_id` explícito y ejecución asíncrona dentro del contexto; se corrigió la fixture y se repitió toda la certificación con éxito. No se cambiaron permisos ni mecanismos de aislamiento para hacerla pasar. Las fixtures y la empresa sintética quedan identificadas en la evidencia local, sin borrados ni modificaciones de datos previos.

## Dictamen

**APTO para el alcance local solicitado.** Conserva autorización, tenant-scoping, transacciones, auditoría y unicidad existentes. Sin nuevas dependencias, migración adicional, modificación de secretos o acceso a ambientes remotos. No se realizó commit, push, merge, promoción ni despliegue. Una promoción futura exige los manifiestos, gates y autorización del repositorio.
