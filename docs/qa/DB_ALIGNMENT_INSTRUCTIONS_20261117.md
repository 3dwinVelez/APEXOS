# Instrucciones para Alineación de Bases de Datos QA → Producción

**Fecha:** 2026-11-17  
**Estado:** Herramientas y documentación completas. Pendiente: ejecución manual en Supabase.

## Resumen Ejecutivo

Se completó la investigación y preparación para alinear las bases de datos de QA y Producción:

- **Migración fantasma identificada:** `20260601000000_baseline_core_schema` en QA (sin efecto real, `applied_steps_count = 0`)
- **Migraciones legales faltantes en Producción:** 3 migraciones críticas para nómina Colombia 2026
- **Herramientas creadas:** 5 scripts de auditoría y verificación
- **Documentación creada:** `docs/DATABASE_MIGRATION_RULES.md` con 8 reglas estrictas
- **Agente actualizado:** `apexos-db-nube` 2.4.0 → 2.6.0 (regla 17: sincronización multi-ambiente)

## Procedimiento de Ejecución

### Paso 1: Eliminar Migración Fantasma de QA

1. Abrir el SQL Editor de Supabase QA:
   - URL: https://supabase.com/dashboard/project/jbirkghkekuifgfsgquq/sql
   
2. Ejecutar el siguiente comando:
   ```sql
   -- Verificar antes de eliminar
   SELECT id, migration_name, applied_steps_count, checksum
   FROM _prisma_migrations
   WHERE migration_name = '20260601000000_baseline_core_schema';
   
   -- Eliminar si applied_steps_count = 0
   DELETE FROM _prisma_migrations
   WHERE migration_name = '20260601000000_baseline_core_schema'
     AND applied_steps_count = 0;
   
   -- Verificar eliminación
   SELECT count(*) as remaining
   FROM _prisma_migrations
   WHERE migration_name = '20260601000000_baseline_core_schema';
   -- Debe retornar 0
   ```

3. Documentar resultado en `docs/qa/evidence/db-alignment-20261117/qa-baseline-removed.txt`

### Paso 2: Aplicar Migraciones Legales en Producción

1. Abrir el SQL Editor de Supabase Producción:
   - URL: https://supabase.com/dashboard/project/jzbwzmkidfthknsohhnr/sql

2. Ejecutar las migraciones **en orden cronológico**:

   **Migración 1: Tarifas de recargos Ley 2466/2025**
   ```sql
   -- Archivo: apps/api/prisma/migrations/20261030120000_hr_labor_rates_vigencia_2026/migration.sql
   -- Checksum esperado: fa95b6d4ba29ef0da5bc277a4388772fe8de218bb2a885be1ee91c9b5659187b
   
   -- Verificar si ya está aplicada
   SELECT migration_name FROM _prisma_migrations
   WHERE migration_name = '20261030120000_hr_labor_rates_vigencia_2026';
   
   -- Si NO existe, ejecutar el contenido del archivo migration.sql
   -- (copiar y pegar desde el archivo)
   
   -- Registrar en ledger
   INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
   VALUES (
     gen_random_uuid()::text,
     'fa95b6d4ba29ef0da5bc277a4388772fe8de218bb2a885be1ee91c9b5659187b',
     '20261030120000_hr_labor_rates_vigencia_2026',
     now(),
     1,
     NULL
   );
   ```

   **Migración 2: Topes y pisos IBC Ley 100/1993**
   ```sql
   -- Archivo: apps/api/prisma/migrations/20261030130000_hr_ibc_caps_floors_2026/migration.sql
   -- Checksum esperado: 351ef4002b108c6aadaf8b45c3f33222cdc01bce89160211bd9b6130f5d941c4
   
   -- Verificar si ya está aplicada
   SELECT migration_name FROM _prisma_migrations
   WHERE migration_name = '20261030130000_hr_ibc_caps_floors_2026';
   
   -- Si NO existe, ejecutar el contenido del archivo migration.sql
   
   -- Registrar en ledger
   INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
   VALUES (
     gen_random_uuid()::text,
     '351ef4002b108c6aadaf8b45c3f33222cdc01bce89160211bd9b6130f5d941c4',
     '20261030130000_hr_ibc_caps_floors_2026',
     now(),
     1,
     NULL
   );
   ```

   **Migración 3: Ajustes legales nómina 2026**
   ```sql
   -- Archivo: apps/api/prisma/migrations/20261113120000_hr_nomina_legal_2026/migration.sql
   -- Checksum esperado: 85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0
   
   -- Verificar si ya está aplicada
   SELECT migration_name FROM _prisma_migrations
   WHERE migration_name = '20261113120000_hr_nomina_legal_2026';
   
   -- Si NO existe, ejecutar el contenido del archivo migration.sql
   
   -- Registrar en ledger
   INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
   VALUES (
     gen_random_uuid()::text,
     '85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0',
     '20261113120000_hr_nomina_legal_2026',
     now(),
     1,
     NULL
   );
   ```

3. Documentar cada aplicación en `docs/qa/evidence/db-alignment-20261117/prod-migration-applied.txt`

### Paso 3: Verificar Alineación Final

1. Ejecutar auditoría automatizada:
   ```bash
   node scripts/audit-db-alignment-api.js
   ```
   
   Debe mostrar: "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"

2. Verificar cada migración individualmente:
   ```bash
   # En QA
   node scripts/list-migrations.js --env qa --detect-phantom
   
   # En Producción
   node scripts/list-migrations.js --env prod --detect-phantom
   ```

3. Verificar checksums:
   ```bash
   node scripts/verify-migration-applied.js --env qa --migration 20261030120000_hr_labor_rates_vigencia_2026
   node scripts/verify-migration-applied.js --env prod --migration 20261030120000_hr_labor_rates_vigencia_2026
   
   # Repetir para las otras 2 migraciones
   ```

4. Guardar evidencia en `docs/qa/evidence/db-alignment-20261117/alignment-verified.txt`

### Paso 4: Certificar Funcionalidad

1. Ejecutar suites de pruebas contra Producción:
   ```bash
   # Suite completa de API
   npm run test:api -- --grep "hr-"
   
   # Certificación de nómina legal
   node scripts/certifications/nomina-legal-2026-prod.js
   ```

2. Verificar que los cálculos de nómina usen las tarifas correctas:
   - Recargo nocturno: 35%
   - Recargo dominical: 80% (H1 2026) / 90% (H2 2026)
   - Topes IBC: mínimo 1 SMMLV, máximo 25 SMMLV
   - Auxilio de transporte: NO integra base de prestaciones

3. Documentar resultados en `docs/qa/evidence/db-alignment-20261117/functional-certification.txt`

## Comandos SQL Completos

Los comandos SQL completos están disponibles en:
- **Archivo:** `docs/qa/evidence/alignment-sql-commands-20261117.sql`
- **Generador:** `node scripts/generate-alignment-sql.js`

## Herramientas Disponibles

1. **`scripts/audit-db-alignment-api.js`**
   - Compara migraciones entre QA y Producción vía API REST
   - Uso: `node scripts/audit-db-alignment-api.js`

2. **`scripts/verify-migration-applied.js`**
   - Verifica checksum y `applied_steps_count` de migración específica
   - Uso: `node scripts/verify-migration-applied.js --env qa|prod --migration {nombre}`

3. **`scripts/list-migrations.js`**
   - Lista migraciones en ambiente y detecta fantasma
   - Uso: `node scripts/list-migrations.js --env qa|prod|local [--names-only] [--detect-phantom]`

4. **`scripts/investigate-baseline-impact.js`**
   - Investiga impacto de migraciones fantasma
   - Uso: `node scripts/investigate-baseline-impact.js`

5. **`scripts/generate-alignment-sql.js`**
   - Genera comandos SQL para ejecutar en SQL Editor de Supabase
   - Uso: `node scripts/generate-alignment-sql.js`

## Documentación de Reglas

**Archivo:** `docs/DATABASE_MIGRATION_RULES.md`

Contiene 8 reglas estrictas para prevenir futuras desalineaciones:
1. Migraciones versionadas y atómicas
2. Sincronización multi-ambiente (desarrollo → QA → Producción)
3. Checksum y ledger (SHA-256 normalizado a LF)
4. Migraciones legales y dictamen jurídico
5. Migraciones fantasma y anomalías del ledger
6. Auditoría continua (scripts obligatorios)
7. Promoción de ramas y migraciones
8. Documentación y trazabilidad

## Checklist de Cierre

- [ ] Migración fantasma eliminada de QA
- [ ] 3 migraciones legales aplicadas en Producción
- [ ] Auditoría de alineación ejecutada (ambos ambientes con mismo número de migraciones)
- [ ] Checksums verificados para cada migración
- [ ] Suites de pruebas ejecutadas contra Producción
- [ ] Evidencia documentada en `docs/qa/evidence/db-alignment-20261117/`
- [ ] Entrada en `agents/CHANGELOG.md` (ya creada)
- [ ] Skill `apexos-db-nube` actualizado a 2.6.0 (ya actualizado)

## Contacto

**Responsable de la intervención:** Edwin (dueño de APEXOS)  
**Responsable técnico:** apexos-db-nube  
**Responsable de auditoría:** apexos-qa

---

**Próximo paso:** Ejecutar los comandos SQL en el SQL Editor de Supabase siguiendo el procedimiento anterior.
