# Migraciones locales IndexedDB

## Politica

Las migraciones Dexie son locales y no modifican Prisma, PostgreSQL, Supabase ni
el API. Cada version declara todas sus tablas. No se abren bases
automaticamente al importar modulos.

## V1 a V2

1. Abrir la base existente.
2. Dexie inicia una transaccion de upgrade.
3. Recorrer `offlineMetadata`.
4. Agregar `retentionState: ACTIVE` cuando no exista.
5. Actualizar `offlineSchemaState` con version 2 y fecha de migracion.
6. Confirmar la transaccion completa.

Si falla, IndexedDB aborta el upgrade y conserva la version anterior. El
adaptador cierra la instancia, registra un error tecnico minimizado y no repite
la apertura en bucle.

## Datos compatibles e incompatibles

Los registros validos se conservan. Un registro corrupto detectado despues de
abrir bloquea la lectura afectada y permite limpiar el contexto. Si una futura
migracion es irrecuperable:

1. cerrar la base;
2. intentar eliminar exclusivamente la base del contexto;
3. registrar codigo, version y resultado sin PII;
4. degradar al flujo conectado;
5. permitir una apertura nueva posterior.

En Fase 2 no hay operaciones pendientes, por lo que la eliminacion controlada no
puede descartar trabajo tecnico offline.

## Casos probados

- Base nueva en version actual.
- Base v1 existente y migracion v2.
- Conservacion de datos.
- Fallo inyectado de migracion.
- Eliminacion y reapertura.
- Apertura bloqueada/fallida sin bucle.

