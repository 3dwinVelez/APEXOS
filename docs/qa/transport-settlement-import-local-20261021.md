# Carga masiva de liquidaciones — certificación local

Fecha: 2026-10-21. Rama: desarrollo. Base: 85fdbe81ee293e866ac8a6d06c5ff22d264c8874. Sin promoción, despliegue, migraciones ni acceso a servicios remotos.

## Operación

En Transporte → Liquidaciones → Carga masiva, descargar la plantilla y las referencias de la empresa. Completar la hoja Liquidaciones: una fila por criterio tarifario, repitiendo paquete y documento para agrupar. La hoja Guia explica cada campo. Máximo 200 filas, 30 paquetes, 2 MB; COP y periodo contable actual. No se reciben precios ni estados desde Excel: el servidor aplica la tarifa y versión indicadas.

Validar muestra errores por fila, totales y sociedad/sucursal/centro del vehículo. Importar crea todos los paquetes en una transacción y los envía a revisión. Una validación documental bloqueante revierte la carga completa. La aprobación requiere los permisos existentes y conserva segregación de funciones; cargar no aprueba. Después de aprobar, seleccionar cuentas de ingreso/cartera y fechas para contabilizar. Aprobación y contabilización masivas procesan cada paquete en su propia transacción y muestran resultados parciales explícitos.

El centro debe coincidir con el centro administrado del vehículo; queda registrado al importar y se vuelve a comprobar al contabilizar, incluso desde el flujo individual. Un cambio de centro bloquea el asiento hasta revisión. Los reintentos exactos recuperan los paquetes existentes, incluso si su tarifa ya fue retirada; una referencia reutilizada con datos diferentes se rechaza. Los permisos y ámbitos de vehículo/centro y el aislamiento de empresa se aplican en servidor.

El panel masivo consulta los últimos 300 paquetes de la torre y permite seleccionar hasta 30. Las liquidaciones anteriores siguen disponibles en el flujo normal.

## Evidencia reproducible

- `node scripts/certifications/transport-settlement-import-local.js`: 39 comprobaciones funcionales aprobadas con PostgreSQL local y API real; incluye navegador real mediante transport-settlement-import-browser.cjs.
- Evidencia local: `C:/Users/mq1/AppData/Local/Temp/apex-settlement-import-VWwKO4/evidence.json`. Incluye SHA256 de fuentes/plantilla, resultados y referencias de fixtures. Capturas en esa misma carpeta.
- Comprueba carga/preview, rollback de carga bloqueada, concurrencia sin duplicados, permisos separados, autoaprobación denegada, aprobación independiente, versiones obsoletas, periodos cerrados, cuentas inválidas, cambio de centro, aislamiento multiempresa y reintentos.
- Contabilización real: tres documentos LT balanceados, tres cuentas por cobrar y seis líneas contables; cada cabecera/línea corresponde a la sociedad, sucursal y centro de su paquete. Saldos de clientes: 5000 y 1000 COP.
- Capacidad: 200 filas/30 paquetes; preview aproximadamente 2.3 s e importación atómica 14.3 s en esta máquina, dentro del tiempo transaccional. No constituye garantía de rendimiento para otros equipos.
- API: 62 pruebas de liquidación aprobadas, incluidas seis nuevas de archivo, seguridad y composición transaccional.
- Web Transporte: 97/99 aprobadas. Persisten dos fallos anteriores: transport-settlement-tower.test.mjs (literal idempotente) y transport-vehicle-master-catalogs.test.mjs (expectativa textual de consulta de árbol).
- Certificación del buscador: 33 comprobaciones aprobadas; corregida la escritura directa sobre una opción ya seleccionada. Revisadas capturas claro/oscuro y móvil.

Los fixtures pertenecen a empresas sintéticas locales y se conservan para trazabilidad. El alta pública de empresas del entorno presenta una función SQL ausente (`apexos_accounting_private.ensure_standard_chart`); por ello se prepararon empresas/roles/cuentas sintéticos localmente, sin cambiar esquema. Login, importación, decisiones y contabilización se ejecutaron por API real.

## Límites de entrega

La funcionalidad solicitada pasó la certificación local completa. Los dos fallos de regresión existentes bloquean publicación/promoción; esta entrega no certifica una liberación general. No se ejecutaron gates de promoción ni se solicitó autorización para publicar.
