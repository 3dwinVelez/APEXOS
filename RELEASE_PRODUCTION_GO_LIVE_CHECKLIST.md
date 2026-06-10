# Checklist de go-live produccion APEXOS / NYVORA

Estado: checklist previo a cutover  
No ejecutar cutover hasta que todos los puntos criticos esten en OK.

## Decision actual

**SUPABASE PROD ESTRUCTURAL VACIO ANTES DE CARGUE INICIAL**

## Supabase produccion

- [ ] Proyecto Supabase PROD creado y separado de QA.
- [ ] Plan pago activo.
- [ ] Region validada.
- [ ] Backups diarios visibles.
- [ ] PITR habilitado o decision formal documentada.
- [ ] Backup manual tomado antes de migraciones.
- [ ] Migraciones aplicadas en orden.
- [ ] Schema Prisma aplicado con `prisma db push --skip-generate`.
- [ ] Limpieza productiva ejecutada con `supabase/production/cleanup_prod_seed_data.sql`.
- [ ] Validacion de tablas completada.
- [ ] Validacion de foreign keys completada.
- [ ] Validacion de indices completada.
- [ ] RLS activo en tablas sensibles.
- [ ] Policies publicas validadas.
- [ ] Buckets privados creados.
- [ ] Policies de Storage validadas.
- [ ] Auth configurado.
- [ ] Datos demo excluidos.
- [ ] `auth.users` vacio antes de seed.
- [ ] Tablas transaccionales vacias antes de seed.
- [ ] `storage.objects` vacio antes de seed.
- [ ] `npm run validate:production:structure` OK.

## Seed productivo posterior

- [ ] No ejecutar seed en la fase de replica estructural vacia.
- [ ] JSON productivo preparado fuera del repo para fase posterior.
- [ ] Aprobacion explicita de negocio para cargue inicial.
- [ ] En fase posterior: `TARGET_ENV=production`.
- [ ] En fase posterior: `CONFIRM_PROD_SEED=true`.
- [ ] En fase posterior: `SUPABASE_SERVICE_ROLE_KEY` productiva configurada solo en runtime seguro.

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
- [ ] Backend conectado a Supabase PROD vacio.

## Railway frontend

- [ ] Servicio Railway PROD separado de QA.
- [ ] Variables publicas productivas configuradas.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` apunta a Supabase PROD.
- [ ] `NEXT_PUBLIC_API_URL` apunta a API PROD.
- [ ] Build OK.
- [ ] Deploy OK.
- [ ] Login OK.
- [ ] Layout OK.
- [ ] Frontend apunta a API PROD y Supabase PROD.

## Seguridad

- [ ] No hay service role en frontend cliente.
- [ ] No hay secretos versionados.
- [ ] RLS/policies presentes antes de usuarios reales.
- [ ] Pruebas por rol quedan pendientes para fase posterior al seed inicial.
- [ ] Storage policies presentes y buckets privados.
- [ ] Errores no exponen tokens ni claves.
- [ ] CORS sin comodines.

## Smoke test funcional

- [ ] Login page carga.
- [ ] Login real pendiente hasta seed inicial.
- [ ] Dashboard.
- [ ] Administracion APEX.
- [ ] Modulos no muestran datos demo.
- [ ] Endpoints protegidos responden 401/403 sin token.
- [ ] `/health` responde OK.
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

**SUPABASE PROD CREADO COMO REPLICA ESTRUCTURAL VACIA Y LISTO PARA CARGUE INICIAL CONTROLADO**
