# Auditoría de Alineación de Bases de Datos QA vs Producción

## Contexto

Según la memoria del proyecto, la última alineación verificada fue el 2026-09-18 (esquema 38/38). Desde entonces se han agregado 35 migraciones nuevas hasta el 2026-11-13.

**Comportamiento conocido:**
- **QA (develop):** Auto-aplica migraciones al hacer push
- **Producción (main):** NO auto-aplica migraciones

Esto significa que es muy probable que QA tenga migraciones aplicadas que producción no tiene.

## Ejecutar la Auditoría

### Opción 1: Script Bash (recomendado)

```bash
cd C:\Users\mq1\Documents\Proyectos\APEXOS
bash scripts/audit-db-alignment.sh
```

El script:
1. Carga las credenciales de `config/qa.env` y `config/production.env`
2. Se conecta a ambas bases de datos vía pooler transaccional de Supabase
3. Consulta `_prisma_migrations` en cada ambiente
4. Compara las migraciones aplicadas
5. Genera un reporte en `docs/qa/evidence/db-alignment-audit-YYYYMMDD.txt`

### Opción 2: Consultas Manuales con psql

Si el script falla, puedes ejecutar las consultas manualmente:

**QA:**
```bash
source config/qa.env
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;" > qa-migrations.txt
```

**Producción:**
```bash
source config/production.env
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;" > prod-migrations.txt
```

**Comparar:**
```bash
diff qa-migrations.txt prod-migrations.txt
```

### Opción 3: Dashboard de Supabase

Puedes verificar visualmente en los dashboards de Supabase:
- **QA:** https://supabase.com/dashboard/project/jbirkghkekuifgfsgquq
- **Producción:** https://supabase.com/dashboard/project/jzbwzmkidfthknsohhnr

Navega a: SQL Editor → ejecutar `SELECT * FROM _prisma_migrations ORDER BY finished_at;`

## Alinear las Bases de Datos

Si la auditoría muestra desalineación, necesitas aplicar las migraciones faltantes en producción.

### Procedimiento Controlado

1. **Identificar migraciones faltantes:**
   ```bash
   # Del reporte de auditoría, extraer la lista de migraciones en QA pero no en producción
   ```

2. **Verificar idempotencia:**
   Cada migración debe ser idempotente (puede ejecutarse dos veces sin error). Revisar el SQL de cada migración en `apps/api/prisma/migrations/*/migration.sql`.

3. **Aplicar en producción:**
   
   **Opción A: Auto-aplicación vía Railway**
   - Hacer push a la rama `main`
   - Railway aplicará las migraciones pendientes al desplegar
   - Monitorear los logs de despliegue
   
   **Opción B: Aplicación manual controlada**
   ```bash
   # Conectar a producción
   source config/production.env
   
   # Aplicar migraciones una por una
   psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261001120000_transport_settlement_packages/migration.sql
   psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261007120000_transport_plans/migration.sql
   # ... continuar con cada migración faltante
   ```

4. **Verificar alineación:**
   ```bash
   bash scripts/audit-db-alignment.sh
   ```
   El reporte debe mostrar "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"

5. **Certificar funcionalidad:**
   Ejecutar suites de pruebas contra producción para verificar que las migraciones no rompieron nada:
   ```bash
   npm run qa:approval:evidence -- docs/qa/manifests/<manifest-file>.json
   ```

## Migraciones Recientes (desde 2026-09-18)

Estas son las migraciones que probablemente están solo en QA:

- 20261001120000_transport_settlement_packages
- 20261007120000_transport_plans
- 20261009120000_transport_rate_geography
- 20261013120000_transport_pyg
- 20261016123000_sedes_replace_origins
- 20261026120000_comercio_foundation
- 20261026140000_comercio_payment_allocations
- 20261027120000_comercio_public_catalog
- 20261027150000_comercio_social_links
- 20261028120000_comercio_discounts
- 20261028160000_received_invoices
- 20261028190000_comercio_promotions
- 20261030120000_hr_labor_rates_vigencia_2026
- 20261030130000_hr_ibc_caps_floors_2026
- 20261102120000_apex_control_foundation
- 20261113120000_hr_nomina_legal_2026

Y 19 migraciones más.

## Notas Importantes

- **Nunca apliques migraciones de producción a QA** (QA debe tener todo lo de producción y más)
- **Siempre verifica idempotencia** antes de aplicar migraciones manualmente
- **Documenta cada migración aplicada** en el reporte de auditoría
- **Las migraciones con efectos legales** (como `20261113120000_hr_nomina_legal_2026`) requieren dictamen jurídico/contable antes de aplicarse

## Rollback

Si una migración causa problemas en producción:
1. **NO borres la migración del ledger** (`_prisma_migrations`)
2. Crea una migración nueva que revierta los cambios
3. Aplica la migración de reversa en producción
4. Documenta el incidente en `agents/CHANGELOG.md`

## Contacto

Si encuentras problemas de conexión o necesitas las credenciales actualizadas, contacta a Edwin (dueño de APEXOS).
