# Permisos por etapa de liquidacion — certificacion local

Fecha: 2026-10-19. Rama: `desarrollo`. Base: `35691fb783c560bb60251b9f5ca010105781d53e`.

En Administracion → Roles y permisos → Transporte se agregan tres capacidades independientes, visibles en las vistas compacta y completa:

| Capacidad | Permiso RBAC | Operacion |
| --- | --- | --- |
| Aprobar liquidaciones | `transport:approve_settlements` | Aprobar/rechazar paquete |
| Contabilizar liquidaciones | `transport:account_settlements` | Registrar contabilizacion |
| Liquidar liquidaciones | `transport:liquidate_settlements` | Cerrar paquete |

Cada ruta y boton exige la capacidad correspondiente. `transport:approve` conserva sus otros usos, pero no habilita estas operaciones. Los roles personalizados existentes requieren asignacion explicita de las nuevas capacidades. No se modificaron permisos de usuarios existentes ni plantillas para concederlas automaticamente. Se conserva el acceso administrativo previo y la comprobacion de segregacion en el servicio: incluso el administrador creador no puede aprobar su propio paquete cuando el tipo exige aprobacion reforzada.

## Evidencia ejecutada

- `node scripts/certifications/transport-settlement-packages-local.js --output <TEMP>/apexos-settlement-roles-20261019.json`: **69/69 controles**. Ejecuta HTTP real, login, creacion y actualizacion de cuatro roles sinteticos mediante API administrativa, persistencia de sus capacidades exactas, login de usuarios sinteticos, matriz de denegaciones y flujo completo con aprobador, contabilizador y liquidador diferentes. Tambien verifica rechazo del creador, inmutabilidad, concurrencia, auditoria e idempotencia. El script auxiliar versionado es `scripts/certifications/transport-settlement-role-stages-local.js`; no puede ejecutarse contra una base remota.
- Suite conjunta de motor, consecutivos, criterios tarifarios, RBAC de liquidacion y tarifas, capacidades administrativas e interfaz: **95 pruebas aprobadas**. Registro: `<TEMP>/apexos-settlement-roles-tests-20261019.log`.
- `npm --workspace apps/web run typecheck`: aprobado.
- ESLint sobre Administracion, Liquidaciones y editor de documentos: aprobado.
- Navegador local: apertura de Roles y permisos, seleccion del rol sintetico aprobador guardado y filtro Transporte. Se observaron las tres capacidades y solamente Aprobar liquidaciones marcado, junto con Entrar/Ver. Captura: `<TEMP>/apexos-settlement-roles-20261019.png`.
- `git diff --check`: aprobado.

La certificacion conserva roles, paquetes y auditoria sinteticos locales; desactiva los cuatro usuarios sinteticos al finalizar correctamente. No altera la sesion del navegador del usuario. Los artefactos generados permanecen fuera del repositorio.

Sin commit, push, promocion, despliegue ni migracion remota. Esta evidencia corresponde al desarrollo local y no constituye autorizacion de promocion a `develop` o `main`.
