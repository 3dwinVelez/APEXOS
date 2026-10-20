# Liquidación: asignación de fletes parametrizados — 2026-10-19

Rama: desarrollo. Base Git: `35691fb783c560bb60251b9f5ca010105781d53e`. Candidato: working tree que conserva los ajustes de liquidación anteriores, sin commit ni push.

## Comportamiento

El criterio libre de cobro se reemplazó por un selector de tarifarios activos del módulo Costos y tarifas. La lista considera empresa, vehículo, moneda y fecha del servicio. Las tarifas específicas de otra placa no se aplican; las tarifas por transportador exigen que ese transportador esté habilitado. Los borradores e inactivos no se ofrecen como fletes asignables.

Al asignar se consulta el motor del servidor: base, distancia, peso, volumen, entregas, peajes, espera, cargue/descargue, otros costos, combustible y mínimo configurado. El precio por servicio es de solo lectura. La cantidad de servicios multiplica el servicio calculado; kilómetros, kilogramos, metros cúbicos, entregas y minutos son cantidades operativas, no precios manuales. Se aprovechan el recorrido y las paradas guardadas en el tarifario; cuando una tarifa necesita distancia sin recorrido configurado, debe indicarse esa cantidad antes de guardar.

El cliente envía identidad y versión del tarifario, métricas, cantidad y soporte. El servidor consulta el maestro de la empresa, valida disponibilidad, vigencia, vehículo, moneda, versión y precio calculado. Un valor manipulado o diferente del esperado se rechaza. Crear el paquete conserva la transacción de cabecera y documentos.

Cada criterio guarda ID, código, versión, métricas, componentes e importe de la tarifa aplicada. El snapshot se genera en servidor; no se acepta un snapshot del navegador. Preparar, aprobar, contabilizar y liquidar conserva ese importe aunque se publique una nueva versión del tarifario. Los paquetes ya existentes con criterios manuales conservan sus datos históricos; los criterios nuevos requieren asignación de tarifa.

La UI bloquea el guardado mientras calcula o cuando falla la cotización. Descarta respuestas atrasadas al cambiar selección, vehículo, fecha o métricas, y no aplica respuestas a documentos eliminados. Preserva soporte y cantidad editados durante la consulta. La fecha o el vehículo nuevos obligan a reasignar.

## Contratos y superficies

- GET `/api/v1/transport/settlement-rate-options`: catálogo del tenant con importes y métricas iniciales.
- POST `/api/v1/transport/settlement-criterion-quote`: cotización explícita de tarifa, con permiso transport:read y autenticación.
- Crear paquete y agregar documentos: revalidación y cálculo autoritativos con transport:write; las acciones approve existentes se conservan.
- Frontend: `SettlementDocumentsEditor.tsx` y página de liquidaciones. Sin nuevas dependencias ni cambios estructurales de base de datos en esta continuación. Se conserva la migración local nullable del ajuste anterior.

## Validación ejecutada

- **75 pruebas aprobadas, 0 fallos**: motor de liquidación y costos, criterios, RBAC, consolidación, regresión UI y callbacks reales del editor transpílado.
- Cuatro pruebas de interacción del editor: precio de solo lectura, selección más reciente prevalece, editar métricas invalida una cotización pendiente, eliminar documento no mueve su respuesta a otro documento, y serialización sin estado interno conservando soporte/cantidad.
- **TypeScript y ESLint aprobados** en la página y el editor. Sintaxis JS y `git diff --check` aprobados.
- **50 comprobaciones reales de API aprobadas**, mediante `scripts/certifications/transport-settlement-four-stages-local.js`: catálogo/cotización autenticados, precios configurados y adicionales, kg/km/m³, precio manipulado y flete libre rechazados, vigencia, moneda, placa, versión y tenant, snapshot ante nueva versión, creación atómica, duplicados, cuatro etapas, inmutabilidad, novedades e idempotencia contable.
- **41 comprobaciones de regresión anteriores aprobadas**, mediante `scripts/certifications/transport-settlement-packages-local.js`.
- **16 comprobaciones de navegador aprobadas**, mediante `scripts/certifications/transport-settlement-four-stages-browser.mjs`: asignar tarifa con adicionales trae 109.000 COP; otro flete de 5.000 por tres servicios suma 15.000; el paquete queda en 124.000 sin escribir precios. Guardado, aprobación, contabilización, liquidación y reapertura conservan los valores y soportes. Revisión visual en 1536×1024 y 390×844, incluido final del formulario móvil.

Para repetir el navegador, ejecutar primero la certificación HTTP y pasar a `settlementBrowserCertification(tab, outputDir, { compositeId, extraId })` el `composite_rate_id` y `rate_ids.Espera` de su evidencia. Ejecutar las fases de creación, guardado, aprobación, contabilización, cierre/reapertura, controles de borrador y revisión visual antes de `finish`. El cierre rechaza comprobaciones pendientes o fallidas.

Evidencia externa a Git en `C:/Users/mq1/AppData/Local/Temp/`: `apexos-linked-rates-local-20261019.json`, `apexos-linked-rates-legacy-20261019.json`, `apexos-linked-rates-tests-20261019.log`, `apexos-linked-rates-browser-20261019/browser.json`, capturas `assignment-desktop.jpg`, `assignment-mobile.jpg`, `assignment-mobile-bottom.jpg`, `reopened-desktop.jpg`, `reopened-mobile.jpg`, y `apexos-linked-rates-certified-worktree-20261019.json` con hashes del candidato.

Durante la preparación, se corrigieron dos supuestos de la fixture: una tarifa publicada se modifica mediante nueva versión, no PUT; publicar la versión desactiva la anterior, por lo que la prueba de desactivación debe operar sobre la nueva versión activa. No se relajaron las protecciones del producto. Las ejecuciones completas finales pasaron.

## Dictamen

REVIEW enfocado de seguridad: autenticación, tenant, permisos, pertenencia de vehículo y tarifa, vigencia, precio calculado, snapshots y estados. No se identificaron vulnerabilidades explotables dentro de esta superficie revisada; no representa una auditoría integral.

**APTO CON OBSERVACIONES para desarrollo local.** Los soportes siguen siendo referencias textuales. Contabilizar y liquidar mantienen el contrato del módulo; no ejecutan un pago bancario. Las fixtures QA identificadas permanecen únicamente en la base local. No se modificaron secretos ni ambientes remotos. Sin commit, push, promoción, despliegue ni migración adicional. La publicación sigue sujeta al flujo y gates del repositorio.
