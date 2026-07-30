# Certificado tecnico - Fase 5

Fecha: 2026-07-29.

## Dictamen

`FASE 5: APROBADA`

La sincronizacion manual offline queda certificada exclusivamente para
`TEST_OPERATION`. Este dictamen no autoriza Fase 6 ni escrituras funcionales de
Servicios.

## Evidencia

- Reloj y fixtures deterministas: aprobado.
- Web offline: 74/74.
- Almacenamiento aislado: 24/24.
- API: 56/56.
- Backend focalizado: 29/29.
- Typecheck, lint, build, Prisma y rendimiento: aprobados.
- PostgreSQL 16 local: idempotencia secuencial y concurrente aprobada.
- Google Chrome real: persistencia, replay, recuperacion y logout aprobados.
- Un recibo PostgreSQL por operacion: aprobado.
- Arbol Git limpio al cierre: verificado antes del dictamen.

Las capturas y el resultado estructurado de navegador se conservan en
`docs/offline/evidence/phase5`.

## Controles

- Flags offline apagados por defecto.
- Contexto de ambiente, empresa, usuario, rol y permisos derivado del servidor.
- Solicitud limitada por esquema, tamano, lote, tiempo y rate limit.
- Errores sanitizados y clasificados en cliente.
- Procesamiento y recibo dentro de una transaccion.
- Dependencias de cola respetadas.

## Exclusiones verificadas

- Sin handlers offline de inicio o cierre de servicio.
- Sin escrituras offline de actividades, checklist, observaciones, ubicacion o
  evidencias.
- Sin sincronizacion automatica, Background Sync o Service Worker.
- Sin push, merge, despliegue o migracion remota.

## Rollback

Desactivar `OFFLINE_SYNC_ENABLED`. La interfaz deja de ofrecer sincronizacion,
la cola permanece local y el flujo conectado existente no se modifica.
