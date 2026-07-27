# Datos del piloto QA offline

Estado: no creados.

## Empresa

- Ambiente validado: `development/local`.
- Nombre requerido: `Nyvora`, coincidencia exacta.
- Dominio reservado para fixture local: `nyvora.offline.local`.
- Coincidencias encontradas: 0.
- `companyId`/`tenantId`: no asignado.
- Fuente: consulta de solo lectura a `public."Tenant"` en PostgreSQL local.

No se uso `Demo APEX`, SCJ, Puebla ni ningún tenant `QA Full Validation`.
Tampoco se consultaron bases QA o produccion para crear el piloto.

## Usuario y ordenes

- Tecnico QA utilizado: ninguno.
- Rol/permisos efectivos: no evaluados con usuario real.
- Ordenes creadas: 0.
- Credenciales creadas: ninguna.
- Allowlist activada: ninguna.

El certificador preparado define un tecnico primario, otro de exclusion, una
referencia sintetica y cuatro ordenes marcadas
`offline_phase_3_1_local`. Solo se materializan tras pasar las guardas de host,
ambiente, unicidad de Nyvora y compatibilidad de schema.

