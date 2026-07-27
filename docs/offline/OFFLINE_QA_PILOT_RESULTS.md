# Resultados del piloto QA offline

Resultado final: **rechazado por ambiente incompatible**.

| Paso | Estado | Evidencia |
| --- | --- | --- |
| Guarda development | aprobado | `env:doctor:local` sin fallos |
| Conexion declarada `54320` | bloqueado | servidor no disponible |
| Conexion Docker local `55432` | aprobada para lectura | host localhost |
| Identificacion exacta Nyvora | bloqueado | 0 coincidencias |
| Compatibilidad de schema | bloqueado | falta `Tenant.authorization_version` |
| Tecnico QA | no ejecutado | depende de tenant compatible |
| Datos sinteticos | no ejecutado | 0 escrituras |
| Capabilities/bootstrap | no ejecutado | no hay sesion autoritativa compatible |
| Hidratacion/offline/logout | no ejecutado | no hay snapshot real |
| Rendimiento funcional | no medido | no existe corrida valida |

No se encontraron defectos nuevos en la implementacion de Fase 3. El defecto
es de preparacion del ambiente: `config/local.env` apunta a un puerto inactivo y
el PostgreSQL local disponible tiene un schema anterior.

## Regresion

- Suite API: 46/46 con Redis deshabilitado segun configuracion local.
- Harness offline: 21/21.
- Prisma validate, TypeScript web y ESLint: correctos.
- Build Next: correcto.
- Performance guard: 17 objetivos, 0 fallos.
- JS compartido: 103 kB.
- Servicios: 155 kB.
- Detalle Servicios: 163 kB.

Una primera invocacion agregada de API sin cargar `DISABLE_REDIS=true` fallo
porque no tenia `REDIS_URL`. Se repitio con la configuracion local declarada y
paso 46/46; no requirio cambio de codigo.

No hubo migraciones, despliegue, merge, push durante Fase 3.1, cambios en
`main`, activacion de produccion ni uso de empresas cliente.
