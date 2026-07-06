# Auditoria de creacion agil de usuarios

Fecha: 2026-07-06
Rama revisada: `codex-user-creation-agile-audit`
Commit base: `8d3237d`

## Problema detectado

La pantalla de Administracion solicitaba una ficha extensa para crear usuarios. El alta mezclaba identidad, acceso, datos laborales, operacion, documentos y auditoria, lo que aumentaba friccion y podia bloquear la creacion por campos que no son indispensables para que un usuario opere.

## Diagnostico funcional

- La creacion rapida debia pedir solo nombre completo, correo, documento, empresa, sede si aplica, rol, estado, accesos operativos y clave temporal.
- El rol se estaba enviando por `role_id`, pero la ruta Supabase normalizaba casi todos los roles no tecnicos como `Empleado`; esto podia degradar permisos de administradores o coordinadores.
- Los campos laborales avanzados son importantes para Talento Humano, Transporte, Servicios y Administracion, pero no deben ser obligatorios en el alta rapida.

## Diagnostico tecnico

- `apps/web/app/dashboard/administracion/page.tsx` concentraba el formulario completo en un asistente de seis pasos.
- `apps/web/app/api/admin/users/route.ts` exigia nombres/apellidos separados, cargo y area para crear un usuario Supabase.
- `apps/api/src/modules/admin/service.js` exigia los mismos campos avanzados para la API Node/Prisma.
- No se requirio migracion ni cambio de esquema. Se conservaron metadata, documentos, empleo, operacion y auditoria.

## Diagnostico UX/UI

- El flujo anterior se sentia pesado para un administrador.
- No habia dos caminos claros entre alta rapida y ficha completa futura.
- El nuevo flujo de alta muestra primero "Crear usuario rapido" y deja "Creacion completa - proximamente" visible, bloqueada e inaccesible.

## Cambios aplicados

- Se agrego un formulario de creacion rapida para usuarios nuevos en Administracion.
- Se preservo el editor completo para usuarios existentes y para futura evolucion funcional.
- Se agrego validacion de correo con formato valido y duplicado en la lista cargada.
- Se agrego empresa obligatoria en frontend, Next API y API Node.
- Se relajaron validaciones de cargo, area, nombres/apellidos separados para creacion rapida.
- Se envia `role_name` junto con `role_id` para mantener permisos correctos.
- Se corrigio la normalizacion de rol en la ruta Supabase para no convertir roles empresariales no tecnicos en `Empleado`.

## Campos en creacion rapida

- Nombre completo.
- Correo.
- Documento.
- Empresa.
- Sede opcional.
- Rol.
- Estado.
- Clave temporal.
- Exigir cambio de clave.
- Acceso a servicios.
- Marcaciones.
- Asignacion a rutas.

## Campos reservados para creacion completa futura

- Centro de costos.
- Cargo.
- Area.
- Tipo de contrato.
- Supervisor.
- Datos laborales.
- Datos de nomina.
- Adjuntos y documentos.
- Licencias.
- Informacion avanzada de Talento Humano.
- Configuraciones especiales.
- Auditoria extendida.

## Riesgos evitados

- No se eliminaron campos del modelo.
- No se tocaron migraciones.
- No se cambio autenticacion base.
- No se rompieron relaciones con empleado, perfil, membresia de empresa ni metadata.
- No se ejecutaron cambios destructivos ni se tocaron datos productivos sensibles.

## Pruebas ejecutadas

- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run build`: OK. La ruta `/dashboard/administracion` compilo correctamente.
- `npm.cmd run prisma:validate`: OK.
- `npm.cmd run qa:users:functional`: bloqueada inicialmente por API local no disponible.
- API local levantada en job temporal: arranco, pero `/health` fallo porque Postgres local `localhost:54320` no estaba disponible.
- `npm.cmd run infra:up`: bloqueada porque Docker no esta corriendo y el daemon `docker_engine` no existe en la sesion.

## Resultado de pruebas

Las validaciones estaticas, tipado, build y esquema pasaron. La prueba funcional E2E que crea usuarios reales no pudo completarse por entorno local: no hay base Postgres local activa y Docker no esta disponible para levantarla.

## Evidencia con empresa Nyvora

- El flujo rapido inicializa la empresa desde `apexos_company_name` o `company_name`; si no existe, usa `Nyvora`.
- No se creo un usuario real en Nyvora durante esta auditoria porque la base local de QA no estuvo disponible.
- Pendiente operativo: ejecutar `npm.cmd run qa:users:functional` o una variante Nyvora cuando Postgres/Docker QA esten disponibles.

## Errores encontrados

- PowerShell bloqueo `npm.ps1`; se uso `npm.cmd`.
- API local arrancaba, pero la salud fallo por `Can't reach database server at localhost:54320`.
- Docker no estaba disponible para levantar `infra/docker-compose.yml`.

## Correcciones aplicadas

- Validacion agil en frontend.
- Validacion minima compatible en Next API y API Node.
- Preservacion de rol real para permisos.
- UI con dos caminos claros: rapido activo y completo bloqueado.

## Estado final

Implementacion lista a nivel codigo, build y esquema. La validacion E2E de creacion real queda pendiente por infraestructura local de QA, no por error de compilacion.

## Recomendacion para produccion

No promover a produccion hasta ejecutar E2E en un entorno QA con base activa, creando un usuario Nyvora real, validando login, rol, activo/inactivo, correo duplicado, empresa/sede y acceso a modulos. No requiere migracion.
