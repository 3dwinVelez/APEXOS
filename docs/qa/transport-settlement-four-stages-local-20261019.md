# Liquidación de transporte — certificación local, 2026-10-19

Rama: `desarrollo`. Base: `35691fb783c560bb60251b9f5ca010105781d53e`. Candidato: working tree, sin commit ni publicación.

## Alcance implementado

- Creación y detalle usan `ModalFrame` con portal a body, foco, Escape, bloqueo de scroll de fondo, márgenes respecto al viewport y scroll interno. Aprobación y contabilización usan ventanas anidadas con mayor z-index. Estilos locales claros con contraste independiente del tema del dashboard.
- El transportador del formulario es un vehículo del maestro de la empresa. Se consultan sus páginas completas; se excluyen retirados, inactivos y bloqueados. El servidor fija placa, tipo y centro de costos a partir del vehículo real; los valores manipulados del cliente no prevalecen.
- Etapas principales, filtros, indicadores y vista semanal: **Creado → Aprobado → Contabilizado → Liquidado**. Los estados técnicos existentes de validación y preparación permanecen dentro de Creado por compatibilidad. Enviar a aprobación ejecuta esos controles con las versiones devueltas por el servidor.
- Antes de crear se gestionan varios documentos, varios criterios por documento, cantidades, precios unitarios, recorrido, fecha, servicio y referencias de soporte. Se pueden agregar y quitar documentos y criterios del borrador. Los totales usan centavos y se recalculan en servidor.
- Creación de cabecera y detalles en una sola transacción. Un segundo documento inválido o una guía duplicada revierte toda la creación; nunca queda un paquete vacío por esa operación.
- Cada criterio tiene soporte textual obligatorio sobre el documento afectado. Es una referencia o justificación documental; no es una carga de archivos.
- Los soportes se conservan al aprobar, contabilizar, liquidar y reabrir. Después de aprobar, los detalles quedan inmutables. Se conservan ajustes, novedades, aprobación reforzada, auditoría, RBAC y contabilización idempotente.
- Las novedades bloqueantes impiden liquidar. Una clave contable de otro paquete no se acepta como reintento propio. Las mutaciones de la pantalla se protegen contra doble clic y muestran sus errores dentro de la ventana.

## Datos y compatibilidad

Migración Prisma generada mediante `prisma migrate diff`: `20261019134505_transport_settlement_vehicle/migration.sql`. Único cambio estructural: `TransportSettlementPackage.carrier_id` admite NULL para vehículos propios sin transportador empresarial. Los vínculos de vehículo y el snapshot de centro de costos se conservan en metadata existente; los criterios, en metadata del detalle y su traza de cálculo.

Se verificó que la columna local era NOT NULL antes de aplicar la migración. Se ejecutó exclusivamente contra hostname localhost/127.0.0.1 y se regeneró Prisma Client. No se modificaron datos anteriores, RLS, secretos, infraestructura ni ambientes remotos. Los paquetes anteriores por transportador conservan el motor tarifario y sus contratos API.

Recuperación: conservar la columna nullable si se revierte código. No volver a imponer NOT NULL mientras existan paquetes de vehículo sin transportador; eso requiere una decisión funcional y un plan de compatibilidad, no borrar paquetes.

## Pruebas y evidencia

- **52 pruebas aprobadas, 0 fallos**: motor, criterios monetarios, soportes inválidos, campos privilegiados descartados, permisos write/approve, consolidación por placa y regresión de UI.
- TypeScript, ESLint de los dos componentes modificados y `prisma validate`: aprobados. `git diff --check`: aprobado.
- `scripts/certifications/transport-settlement-four-stages-local.js`: **27 comprobaciones reales aprobadas**. Autenticación, vehículo maestro, rollback atómico, duplicados, acceso cruzado a vehículo de otra empresa, versión obsoleta, prohibición de saltar preparación, cuatro etapas, inmutabilidad, soporte persistido, referencia contable, reintento idempotente, colisión de clave entre paquetes, bloqueo del cierre por novedad y resolución previa.
- `scripts/certifications/transport-settlement-packages-local.js`: **41 comprobaciones reales aprobadas** del flujo anterior, incluidas tarifas, novedades, ajustes, aprobación reforzada y auditoría.
- `scripts/certifications/transport-settlement-four-stages-browser.mjs`: flujo real de navegador por fases sobre la sesión local. Dos documentos, tres criterios, total 124.000 COP, preparación, aprobación, contabilización, liquidación y reapertura. En móvil se probaron agregar/quitar documentos y criterios y el bloqueo del formulario vacío.
- Revisión visual: escritorio 1536×1024; móvil 390×844, cabecera, tabla desplazable y parte inferior de creación con soportes y acciones. El viewport temporal se restaura al terminar.

Evidencia fuera de Git, en `C:/Users/mq1/AppData/Local/Temp/`:

- `apexos-liquidacion-four-stages-20261019.json`: certificación HTTP nueva.
- `apexos-liquidacion-legacy-20261019.json`: regresión HTTP anterior.
- `apexos-liquidacion-tests-20261019.log` y `apexos-liquidacion-typecheck-20261019.log`.
- `apexos-liquidacion-browser-20261019/browser.json`, `desktop.jpg`, `mobile.jpg`, `creation-mobile.jpg` y `creation-mobile-bottom.jpg`.
- `apexos-liquidacion-certified-worktree-20261019.json`: inventario y hashes del candidato certificado.

Intentos iniciales conservados: la regresión histórica suponía que Cali no tenía tarifa aplicable, pero ya había tarifas globales en la base. Se cambió únicamente la fecha de esa fixture a 1900 para ejercitar ausencia de vigencia sin alterar maestros ni debilitar el control. La repetición completa pasó. El controlador de navegador se ajustó al nombre AX de campos vacíos/con valor y excluye la línea de foco al localizar controles; las verificaciones finales se basan en acciones efectivamente realizadas. Las correcciones de contraste detectadas visualmente se limitaron a estas ventanas.

## Seguridad y límites

REVIEW enfocado con las skills de backend, datos, frontend, QA y ciberseguridad. Tenant-scoping y advisory lock/transacción existentes conservados. Pruebas positivas y negativas de aislamiento, permisos, estados, concurrencia optimista, duplicidad y clave contable. No se identificaron vulnerabilidades explotables dentro de la superficie evaluada; no es una auditoría integral del sistema.

Contabilizar conserva el contrato del módulo: registrar referencia e importe contable de liquidación de manera idempotente. Liquidar cierra el paquete; no ejecuta un pago bancario. Las fixtures QA permanecen identificadas por prefijos `QA-LIQ` en la base local. No hay nuevas dependencias ni cambios en otros módulos.

DICTAMEN: **APTO CON OBSERVACIONES para desarrollo local**. ESTADO DE PROMOCIÓN: **NO SOLICITADA**. Sin commit, push, merge, despliegue ni migración remota. Una promoción futura requiere los manifiestos y gates del repositorio y autorización expresa.
