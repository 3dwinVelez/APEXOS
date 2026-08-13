# Idempotencia local

`operationId` es UUID y representa la identidad inmutable del intento logico.
`idempotencyKey` representa la accion logica y tiene indice unico Dexie.

`enqueue` consulta ambas identidades dentro del contexto. Si encuentra una,
devuelve la operacion existente. La restriccion unica resuelve carreras entre
pestanas; un `ConstraintError` vuelve a leer el registro ganador.

La secuencia se asigna dentro de la misma transaccion que inserta la operacion y
actualiza metadata. Un aborto no consume secuencia. Recargas, doble clic,
concurrencia y reintentos conservan una sola operacion.

La futura idempotencia servidor no forma parte de Fase 4. El backend continuara
siendo autoridad cuando se autorice el transporte.
