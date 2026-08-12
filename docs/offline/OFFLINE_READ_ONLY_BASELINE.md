# Offline Read-Only v1.0

Fecha de certificacion: 2026-07-27.

## Punto certificado

- Rama: `feature/offline-first-technicians`.
- Commit: `2fb0a867e73d243ef33d2a195b59627b9fedc14c`.
- Certificado: `docs/offline/OFFLINE_READ_ONLY_CERTIFICATE.md`.
- Resultado en Chrome real: `docs/offline/OFFLINE_PHASE_3_4_MANUAL_BROWSER_RESULT.md`.
- Referencia interna: `Offline Read-Only v1.0`.

Esta referencia es documental. No existe una etiqueta Git local o remota.

## Validacion

- API: 46/46.
- Web offline: 31/31.
- Prisma validate, TypeScript, ESLint, build y performance guard: correctos.
- Certificadores estructural, HTTP, seed idempotente y cleanup: correctos.
- Bundle compartido: 103 kB.
- Servicios: 155 kB.
- Detalle: 163 kB.
- Chunk offline de lectura: 16.487 bytes.

## Incluido

- Capabilities autoritativas de solo lectura.
- Bootstrap minimizado por ambiente, empresa, usuario y tecnico.
- Snapshot transaccional en IndexedDB.
- Lectura local de ordenes, detalle, actividades y checklist.
- Persistencia tras cierre completo del navegador.
- TTL, actualizacion manual y proteccion contra downgrade.
- Limpieza fisica en logout sin cambios pendientes.
- Aislamiento de usuarios no autorizados.

## Excluido

- Operaciones y escrituras offline.
- Push, pull incremental y sincronizacion automatica.
- Conflictos funcionales.
- Evidencias, fotografias, GPS y uploads.
- Service Worker y Background Sync.
- Migraciones o tablas backend.

## Retorno al punto certificado

No reescribir ni hacer squash de los commits certificados. Para inspeccionar o
reproducir el baseline sin alterar esta rama:

```bash
git worktree add ../APEXOS-offline-read-only 2fb0a867e73d243ef33d2a195b59627b9fedc14c
```

Para retirar Fase 4 de una futura integracion, revertir sus commits en orden
inverso. No usar `reset --hard` sobre trabajo compartido. El rollback operativo
continua siendo apagar las capacidades posteriores y conservar la proyeccion
Read-Only v1.0.
