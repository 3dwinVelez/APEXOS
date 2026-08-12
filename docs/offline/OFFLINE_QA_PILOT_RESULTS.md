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

Fase 3.2 recupero posteriormente una base local compatible y vacia. No cambia
el resultado de esta corrida: debe reintentarse Fase 3.1 con autorizacion
expresa para ejecutar el seed y las pruebas funcionales.

## Resultado Fase 3.3

Backend y UI productiva certificados: 2 ordenes, 6 actividades, 4 checklists,
4.229 bytes, 2 consultas y TTL de 86.400 segundos. Resultado:
`APROBADA CON OBSERVACIONES`.

## Resultado Fase 3.4

Resultado: **APROBADO** en Google Chrome 150.0.7871.182 real.

- IndexedDB: creada con nombre derivado y almacenes autorizados.
- Contenido: 2 ordenes, 6 actividades, 4 checklists y 2 catalogos.
- Persistencia: aprobada tras cierre total y reapertura con API inaccesible.
- Detalle, actividades y checklist: aprobados en lectura local.
- TTL y actualizacion manual: aprobados.
- Logout: eliminacion fisica confirmada y persistente tras reapertura.
- Aislamiento: tecnico excluido y usuario no autorizado sin panel, bootstrap,
  chunk offline o IndexedDB.
- Escrituras offline: ausentes.

Regresion final: API 46/46 y web offline 31/31; Prisma, TypeScript, ESLint,
build productivo, performance guard y certificadores locales correctos.
