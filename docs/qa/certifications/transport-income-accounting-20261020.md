# Vehiculos como centros de costo e ingresos de liquidaciones

Fecha: 2026-10-20. Implementacion en `desarrollo`. Destino permitido: `develop` (QA). Produccion fuera del alcance.

## Comportamiento implementado

- Crear un vehiculo crea su centro de costo dentro de una sucursal contable activa de su empresa, en la misma transaccion. La sede operativa se conserva por separado. El codigo inicial es la placa; el vinculo y el codigo se conservan para trazabilidad.
- La ficha permite elegir la sucursal contable. La sincronizacion de vehiculos existentes exige permisos de escritura tanto de Transporte como de Contabilidad. Los centros vehiculares no se eliminan ni sobrescriben desde el maestro contable.
- Contabilizar una liquidacion aprobada exige una cuenta de ingreso y una cuenta deudora activas y transaccionales. Los clientes proceden de los documentos del servicio; no se atribuye el paquete completo a un cliente arbitrario.
- Se genera un documento interno `LT` y una cuenta por cobrar por cliente, con consecutivo propio por empresa. Se debita el deudor y se acredita el ingreso. Comprobante, detalles, mayor, cartera, saldo del cliente, auditoria y estado del paquete comparten transaccion.
- La fecha pertenece al periodo asignado y los periodos cerrados bloquean el registro. Los reintentos, incluso concurrentes, devuelven los documentos ya emitidos sin duplicar movimientos.
- Liquidar conserva los documentos y no vuelve a contabilizar. La reversion permitida desde el estado contabilizado genera notas credito y revierte cartera e ingreso; una cartera aplicada bloquea la reversion. El cierre liquidado conserva su estado terminal.
- El PYG vehicular conserva su fuente operacional y no suma nuevamente los comprobantes. Los estados financieros reciben el ingreso mediante el mayor real.

`LT` es un documento contable interno; no es una factura electronica DIAN. El cobro posterior se registra en Tesoreria. Esta entrega no automatiza recaudos, impuestos ni conversion de monedas; admite COP. Un paquete historico sin cliente/vehiculo o con ajustes globales sin asignacion a documentos requiere corregir esos datos antes de contabilizar. Las referencias contables externas historicas conservan su trazabilidad; no se reconstruyen asientos automaticamente.

## Correccion de datos ejecutada en QA

Proyecto Supabase QA: `jbirkghkekuifgfsgquq`. Sociedad SCJ: `cbbf3627-4336-4f23-95c6-1077414bcd17`.

El usuario selecciono expresamente **SUCURSAL PRINCIPAL (200720) para todos**. Se ejecuto el DML versionado `scripts/data-migrations/20261020-scj-vehicle-cost-centers.sql`, despues de su ensayo local y de respaldar la estructura y los campos vehiculares afectados fuera de Git.

Resultado verificado: 17 vehiculos vinculados a 17 centros de costo en 200720, 3 centros manuales preservados y 17 registros de auditoria. Las sedes operativas y la identidad de los vehiculos permanecieron iguales. Los hashes del conjunto completo de 65.209 cuentas y 113 movimientos del mayor permanecieron iguales antes y despues. SCJ no tenia paquetes ni contabilizaciones previas. No hubo cambios de esquema, permisos de base de datos ni secretos.

El DML es transaccional, restringe sociedad, sucursal e inventario esperado, y se ensayo dos veces para comprobar idempotencia. Cualquier conflicto de codigo aborta el conjunto completo.

## Validacion y limites

- Certificacion versionada: `node scripts/certifications/transport-income-accounting-local.js <salida-ignorada>`: **46 verificaciones aprobadas**. Crea una base PostgreSQL local aislada y ejecuta registro, estructura, vehiculo, tarifas, documentos por cliente, validacion, precalculo, aprobacion, contabilizacion, cierre, informes y reversion mediante la API real, verificando tambien las tablas persistidas.
- Cubre rollback del vehiculo y del primer documento cuando falla el segundo cliente, saldos, idempotencia concurrente, periodo cerrado, clasificacion de cuentas, RBAC, aislamiento de empresas y ensayo del DML de SCJ. La salida contiene commit y hashes de fuentes; las bases y salidas generadas quedan fuera de Git.
- Regresion de contabilidad, cartera, vehiculos y liquidaciones: **92 pruebas aprobadas**.
- Compilacion web, lint y TypeScript aprobados.
- La comprobacion funcional de interfaz se completo en una compilacion de produccion local del commit certificado, con API y PostgreSQL locales. Se seleccionaron 4175 (ingresos por servicios) y 1305 (clientes), se contabilizo LIQ-000003 y se liquido desde la interfaz. La trazabilidad mostro LT-000005 y LT-000006. Siete comprobaciones posteriores de persistencia confirmaron dos documentos balanceados de 100, una cuenta por cobrar de 100 por cliente, sucursal 200720, centro INC123 y una sola operacion de contabilizacion.
- Se comprobo mediante el DOM de la interfaz el centro vehicular dentro de la estructura SOC-01/200720, y la ficha con sede operativa CEDI CALDAS, sucursal contable 200720 y centro INC123 protegido. Se conservaron instantaneas DOM fuera de Git. La captura PNG del conector fallo; no se afirma haber validado el aspecto grafico por imagen ni responsive. Las interrupciones de la primera sesion se conservan como antecedente; la sesion funcional posterior completo las acciones.

## Estado de promocion: BLOQUEADA

Fuente puntual certificada: `91a676ece56412ed92256111edf3a962fedae072`, reconstruida encima de `develop` remoto `b9b977716bc4d442e1bc0cde59b5ae78ffb2d531` y conservada en la historia local de `desarrollo`. Las 46 verificaciones se repitieron en un checkout separado de ese commit y los hashes de fuentes coincidieron. El gate `qa:promotion:scope` aprobo el inventario exacto de 16 rutas. El primer cierre de pre-QA quedo bloqueado por aprobacion pendiente e interfaz incompleta; la comprobacion funcional de interfaz ya se completo y el bloqueo restante es la autorizacion de publicacion puntual. No se publico el candidato.

El codigo no se ha publicado ni fusionado a `develop`. Se conserva la instruccion del usuario de **no crear ramas**. El remoto `desarrollo` contiene cambios fuera de este alcance y no puede promoverse completo. El candidato debe reconstruirse puntualmente encima del `develop` remoto actual, conservando sus cambios mas recientes, sin crear una rama no autorizada.

Los manifiestos inventarian cada archivo y mantienen la aprobacion de publicacion pendiente. La pausa general de Railway fue un bloqueo del cierre anterior; en la revision posterior el proveedor ya reporta operacion normal: <https://status.railway.com>. No hay certificacion funcional del candidato desplegado en QA.

En esta revision el usuario reitero expresamente: **No crear ramas; conservar la promocion preparada**. No se creo ni publico la rama propuesta `codex/qa-ingresos-liquidaciones-20261020`; no se abrio PR ni se promovio el candidato. La revision de despliegues QA encontro API en `2f674b3b4bebfbe815fae8289bb9f5cd60ca2d08` y web en `b9b977716bc4d442e1bc0cde59b5ae78ffb2d531`; al autorizar una futura promocion se deben alinear ambos servicios al mismo commit revisado.

Security Gate del alcance revisado: APTO CON OBSERVACIONES. No se identificaron vulnerabilidades explotables en las superficies evaluadas: autenticacion, permisos de contabilizacion y sincronizacion, aislamiento de empresa, allowlist de cuentas, transaccion, numeracion e idempotencia. Se ejecutaron las pruebas negativas de la certificacion versionada; no se cambiaron secretos, RLS ni dependencias. Limites: sin prueba de carga maxima ni auditoria completa de modulos ajenos. Este dictamen no autoriza publicar.

Para completar: disponer de una via de promocion puntual expresamente autorizada, actualizar el target exacto, aprobar los gates de alcance y pre-QA, integrar mediante PR y desplegar ambos servicios QA. Validar el commit real desplegado y el flujo completo en QA. No promover a `main`.

Recuperacion: el respaldo conserva los campos previos y los centros manuales. No retirar centros que ya tengan imputaciones; en ese caso efectuar correccion contable trazable. Los comprobantes publicados se revierten mediante documentos, sin borrar el mayor ni restablecer una instantanea antigua del repositorio.
