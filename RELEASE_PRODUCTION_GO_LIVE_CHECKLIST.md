# Checklist de go-live produccion APEXOS / NYVORA

Estado: checklist previo a cutover  
No ejecutar cutover hasta que todos los puntos criticos esten en OK.

## Decision actual

**PRODUCCION PREPARABLE SIN CUTOVER**

## Supabase produccion

- [ ] Proyecto Supabase PROD creado y separado de QA.
- [ ] Plan pago activo.
- [ ] Region validada.
- [ ] Backups diarios visibles.
- [ ] PITR habilitado o decision formal documentada.
- [ ] Backup manual tomado antes de migraciones.
- [ ] Migraciones aplicadas en orden.
- [ ] Validacion de tablas completada.
- [ ] Validacion de foreign keys completada.
- [ ] Validacion de indices completada.
- [ ] RLS activo en tablas sensibles.
- [ ] Policies publicas validadas.
- [ ] Buckets privados creados.
- [ ] Policies de Storage validadas.
- [ ] Auth configurado.
- [ ] Datos demo excluidos.

## Seed productivo

- [ ] JSON productivo preparado fuera del repo.
- [ ] `TARGET_ENV=production`.
- [ ] `CONFIRM_PROD_SEED=true`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` productiva configurada solo en runtime seguro.
- [ ] Seed ejecutado sin errores.
- [ ] Logs de insertados/actualizados/omitidos guardados.
- [ ] Empresa inicial creada/actualizada.
- [ ] Usuarios iniciales creados.
- [ ] Roles/catalogos base creados.
- [ ] Modulos activos habilitados.
- [ ] Vehiculos/conductores base creados.
- [ ] Login admin inicial OK.
- [ ] Cambio de contrasena temporal realizado.

## Railway backend/API

- [ ] Servicio Railway PROD separado de QA.
- [ ] Variables productivas configuradas.
- [ ] `NODE_ENV=production`.
- [ ] `APP_ENV=production`.
- [ ] `DATABASE_URL` apunta a Supabase PROD.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo backend/scripts.
- [ ] `JWT_SECRET` productivo rotado.
- [ ] `ALLOWED_ORIGINS` contiene solo frontend PROD.
- [ ] Redis productivo configurado o workers deshabilitados de forma consciente.
- [ ] Deploy OK.
- [ ] `/health` OK.
- [ ] Logs sin errores de bootstrap.

## Railway frontend

- [ ] Servicio Railway PROD separado de QA.
- [ ] Variables publicas productivas configuradas.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` apunta a Supabase PROD.
- [ ] `NEXT_PUBLIC_API_URL` apunta a API PROD.
- [ ] Build OK.
- [ ] Deploy OK.
- [ ] Login OK.
- [ ] Layout OK.

## Seguridad

- [ ] No hay service role en frontend cliente.
- [ ] No hay secretos versionados.
- [ ] RLS probado con admin empresa.
- [ ] RLS probado con supervisor.
- [ ] RLS probado con conductor/operativo.
- [ ] Empresa A no ve empresa B.
- [ ] Storage bloquea acceso cruzado.
- [ ] Errores no exponen tokens ni claves.
- [ ] CORS sin comodines.

## Smoke test funcional

- [ ] Login/logout.
- [ ] Dashboard.
- [ ] Administracion APEX.
- [ ] Usuarios.
- [ ] Roles/catalogos base.
- [ ] Talento humano.
- [ ] Marcaciones.
- [ ] Transporte.
- [ ] Vehiculos.
- [ ] Servicios.
- [ ] Proyectos.
- [ ] Storage/evidencias.
- [ ] Mobile 360px.
- [ ] Mobile 390px.
- [ ] Mobile 414px.
- [ ] Tablet 768px.

## Observabilidad y rollback

- [ ] Logs Railway backend revisados.
- [ ] Logs Railway frontend revisados.
- [ ] Logs Supabase Auth revisados.
- [ ] Errores Storage revisados.
- [ ] Consumo Supabase base revisado.
- [ ] Ultimo commit estable identificado.
- [ ] Tag pre-release creado.
- [ ] Backup pre-cutover confirmado.
- [ ] Plan de rollback frontend documentado.
- [ ] Plan de rollback DB/migracion documentado.
- [ ] Responsable de monitoreo definido.

## Criterio de salida

Go-live solo si:

- Todos los puntos criticos de Supabase, Railway, seguridad y smoke test estan OK.
- No hay fallos de login, RLS, storage o creacion de usuarios.
- Existe backup previo.
- Existe responsable de monitoreo en la ventana de salida.

## Resultado final esperado

Cuando este checklist este completo:

**PRODUCCION LISTA PARA CUTOVER CONTROLADO**
