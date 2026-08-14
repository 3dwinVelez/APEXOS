# NYVORA Internal Functional Stress Test

- Fecha: 2026-08-14T00:15:58.565Z
- Empresa usada: NYVORA
- Ambiente: PROD
- QA: no tocado
- Cliente real IMPORTADORA SCJ SAS: no usado para datos ficticios

## Resultado

NYVORA INTERNAL VALIDADA FUNCIONALMENTE Y PLATAFORMA LISTA PARA OPERACION CONTROLADA

## Datos creados/validados

- Usuarios Prisma internos: 102
- Roles: 68
- Empleados: 99
- Vehiculos: 19
- Referencias de servicio: 21
- Ordenes de servicio: 42
- Marcaciones: 144
- GPS/logs operativos: 512

## Modulos probados

- Inicio/Dashboard: validado por tenant activo y modulos configurados.
- Administracion APEX, Usuarios, Roles y Maestros: roles, usuarios y datos maestros internos creados por servicio.
- Servicios: referencias, ordenes, asignacion a tecnicos y permisos.
- Talento Humano: empleados y marcaciones.
- Transporte/Vehiculos: vehiculos, conductor autorizado y ficha documental basica.
- Logs tecnicos: AuditLog de validacion generado.
- Modulos bloqueados/visibles: validado por permisos de rol tecnico y usuario lectura.

## Usuarios creados

- 1 admin funcional interno.
- 10 tecnicos internos.
- 9 usuarios internos de consulta/operacion.
- Credenciales temporales guardadas solo en config/nyvora-test-credentials.env; no se incluyen contrasenas en este documento.

## Permisos validados

- OK: admin_can_list_services
- OK: technician_only_assigned_services ({"visible":1,"expected":1})
- OK: technician_cannot_create_service ("TECHNICIAN_OPERATION_FORBIDDEN")
- OK: technician_cannot_list_technicians_master ("TECHNICIAN_OPERATION_FORBIDDEN")
- OK: duplicate_service_number_rejected ("SERVICE_ORDER_NUMBER_EXISTS")
- OK: invalid_customer_document_rejected ("INVALID_CUSTOMER_DOCUMENT")
- OK: invalid_technician_rejected ("INVALID_SERVICE_TECHNICIAN")
- OK: no_orphan_prisma_users
- OK: nyvora_seed_did_not_cross_tenants ([{"table_name":"service_orders","count":0},{"table_name":"employees","count":0},{"table_name":"vehicles","count":0}])
- OK: scj_control_company_present ({"company_id":"6199e855-ed91-4db1-bf1f-6eb549868e1d","tenant_id":"67a5dcb8-100b-4a44-b5db-d024f2e57450"})

## Bugs encontrados y corregidos

- `scripts/validate-production-structure.js` asumía una produccion vacia; se corrigio para cargar `--env-file` y permitir validar produccion activa sin fallar por datos existentes, manteniendo `--expect-empty` para certificaciones de limpieza.
- `scripts/nyvora-internal-functional-validation.js` podia elegir un usuario tecnico como actor administrativo tras una siembra parcial; se corrigio la seleccion explicita del admin NYVORA.
- La validacion de usuarios huerfanos usaba un filtro Prisma incompatible con `tenant_id` obligatorio; se corrigio a SQL read-only para contar `tenant_id is null` o vacio.

## Problemas visuales corregidos

- No se aplicaron redisenos. Las validaciones estaticas de frontend pasaron; no se detecto bloqueo visual automatizable en esta corrida.

## Hallazgos pendientes

- Sin hallazgos funcionales bloqueantes en la corrida automatizada.

## Riesgos

- La validacion automatizada no sustituye una pasada manual completa en navegador por cada breakpoint mobile/desktop.
- Las cuentas son internas y temporales; deben rotarse o desactivarse cuando termine el ciclo de pruebas productivas controladas.

## Validaciones tecnicas

- env:doctor:prod: OK.
- prisma validate: OK.
- typecheck web: OK.
- lint web: OK.
- build web: OK.
