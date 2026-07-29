# Fase 5 - Informe de ejecucion

Fecha: 2026-07-29. Rama: `feature/offline-manual-sync`.

## Alcance ejecutado

Se implemento sincronizacion manual e idempotente exclusivamente para
`TEST_OPERATION`, protegida por flags, ambiente, empresa, identidad, rol
tecnico, permiso de lectura de Servicios y rate limit.

- Migracion aditiva y modelo `OfflineSyncReceipt`.
- Contrato estricto `POST /api/v1/offline/sync/push`.
- Procesador transaccional con un unico handler sintetico.
- Cliente manual que respeta dependencias de la cola y clasifica errores HTTP.
- Adaptacion de resultados a la maquina de estados local.
- Boton manual visible solo con `syncEnabled=true`.

## Remediacion 5.1

Las 9 fallas heredadas de almacenamiento se reprodujeron antes de modificar
fixtures. Todas dependian de fechas absolutas del 27 y 28 de julio de 2026 al
ejecutarse el 29 de julio. La politica de retencion descarto correctamente esos
snapshots; no existia una regresion funcional.

Se incorporo un reloj inyectable y fixtures relativos para cubrir snapshot
vigente, proximo a vencer, vencido y una fecha distante (2042). La suite
aislada paso de 15/24 a 24/24 sin ampliar TTL ni relajar validaciones.

Manifestaciones originales:

1. Hidratacion y consultas: orden ausente.
2. Checklist compartido: cero elementos.
3. Persistencia tras reapertura: version ausente.
4. Snapshot de mayor revision: lectura ausente.
5. Rechazo de contexto o esquema: lectura nula.
6. Migracion v1 a v3: retencion `EXPIRED_RETAINED`.
7. Transaccion abortada: snapshot anterior ausente.
8. Bootstrap valido: snapshot marcado no vigente.
9. Downgrade de bootstrap: revision local ausente.

## Validacion automatizada

- Web offline completa: 74/74.
- Almacenamiento offline aislado: 24/24.
- API completa: 56/56.
- Matriz backend focalizada: 29/29.
- Typecheck web: aprobado.
- ESLint 9.39.4 con configuracion del workspace: aprobado.
- Build Next.js 15.5.22: aprobado, 64 paginas estaticas.
- Prisma validate: aprobado.
- Guard de rendimiento: aprobado.

Una ejecucion paralela produjo un fallo transitorio del microbenchmark
(254.87 ms frente a 250 ms) y timeout del build por contencion. La API aislada
paso 56/56 con 228.574 ms y el build aislado termino en 149.1 segundos.

## PostgreSQL local

Destino exclusivo:

```text
contenedor: infra-offline-cert-postgres-1
host: 127.0.0.1
puerto: 54320
base: apexos_offline_cert_local
```

Resultado:

```json
{
  "certified": true,
  "primary": ["APPLIED", "ALREADY_APPLIED"],
  "alteredReplay": "REJECTED",
  "reusedKey": "REJECTED",
  "otherInstallation": "REJECTED",
  "concurrent": ["ALREADY_APPLIED", "APPLIED"],
  "receiptCounts": { "primary": 1, "concurrent": 1 }
}
```

No se ejecutaron migraciones contra bases remotas.

## Chrome real

Chrome se ejecuto headless con perfil temporal aislado. Se certificaron:

- Operacion pendiente conservada tras reiniciar el navegador.
- Primera sincronizacion `APPLIED` y estado local `CONFIRMED`.
- Replay `ALREADY_APPLIED`.
- Recuperacion de una operacion interrumpida.
- Un recibo por operacion.
- Eliminacion de la base IndexedDB al cerrar sesion.

El primer intento alcanzo la tercera captura y agoto tiempo al abrir un segundo
cliente Prisma. Se reemplazo esa lectura por `psql` local y la repeticion
completa aprobo. Evidencia sanitizada en `docs/offline/evidence/phase5`.

## Seguridad, alcance y rollback

Los flags siguen apagados por defecto. El rollback inmediato consiste en
desactivar `OFFLINE_SYNC_ENABLED`; la cola permanece local y el flujo conectado
no cambia.

No existen handlers offline para escrituras funcionales de Servicios, sync
automatico, Background Sync ni Service Worker. No se realizaron push, merge,
despliegues, migraciones remotas o cambios en empresas cliente.
