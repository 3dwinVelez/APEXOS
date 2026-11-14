# Aplicación de la migración 20261113120000_hr_nomina_legal_2026 en QA

- Fecha: 2026-11-13
- Ambiente: APEXOS QA (project ref `jbirkghkekuifgfsgquq`), pooler de sesión `aws-1-us-east-2.pooler.supabase.com:5432` con `pgbouncer=true`
- Autorización: el dueño pidió «aplicar la migración en la nube» y eligió **solo QA**.
- Método: aplicación quirúrgica de los 3 statements + registro en `_prisma_migrations`. **No** se usó `migrate deploy` porque el ledger de QA arrastra 4 migraciones pendientes de otros módulos.
- Credencial: tomada de las variables del servicio `apexos-api-qa` en Railway; no se transcribe ni se imprime.
- Checksum: `85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0` (SHA-256 del `migration.sql` normalizado a LF).
- Verificación del método: el checksum local de `20261028120000_comercio_discounts` coincide con el registrado en QA.

## Antes

```
aux_concepts={"total":1,"included":true,"vac_included":false,"excluded":null}
he_params_total=36   (18 tenants × MAX_HE_DIARIO/MAX_HE_SEMANAL, valid_from 2026-09-01)
our_ledger_rows=0
```

## Después

```
aux_concepts={"total":1,"included":0,"vac_included":0,"excluded":1}
new_params={"n":48,"tenants":24}   (valid_from 2026-01-01)
ledger={"migration_name":"20261113120000_hr_nomina_legal_2026","checksum":"85114b7f…","applied_steps_count":1,"finished":true}
```

## Idempotencia

Segunda ejecución de los dos `INSERT ... WHERE NOT EXISTS`:

```
second_run_inserted=0 before=84 after=84
```

## Estado del ledger después de la aplicación

`prisma migrate status` deja de listar nuestra migración como pendiente y conserva, **sin tocarlas**, las pendientes ajenas:

```
20261028160000_received_invoices
20261030120000_hr_labor_rates_vigencia_2026
20261030130000_hr_ibc_caps_floors_2026
20261102120000_apex_control_foundation
```

También persiste la divergencia histórica `20260601000000_baseline_core_schema` (existe en la base, no en el repo), previa a esta intervención.

## Pendiente

- Producción no se tocó. Aplicar allí exige autorización independiente y coordinación con el despliegue del código nuevo, porque la semilla corregida cambia la base de prestaciones que usa el motor actual.
