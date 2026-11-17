# Plan de Alineación de Bases de Datos QA → Producción

**Fecha:** 2026-11-17  
**Auditoría:** 73 migraciones en QA vs 69 en producción  
**Desalineación:** 4 migraciones faltantes en producción

## Migraciones a Aplicar

### ⚠️ Migración 1: `20260601000000_baseline_core_schema`
**Estado:** EXISTE en ledger de QA pero NO en el repositorio  
**Riesgo:** ALTO - Anomalía del ledger  
**Investigación completada:**
- Existe en QA con `applied_steps_count: 0` (anormal)
- Aplicada el 2026-07-22 (hace 4 meses)
- El archivo SQL nunca estuvo en git (búsqueda en todos los commits)
- Posible migración manual o de ambiente anterior

**Decisión:** ❌ **NO APLICAR en producción**
- Es una anomalía aislada de QA
- No tiene archivo fuente para replicar
- `applied_steps_count: 0` sugiere que no hizo cambios reales
- Las 3 migraciones legales posteriores son independientes de esta

### ✅ Migración 2: `20261030120000_hr_labor_rates_vigencia_2026`
**Tipo:** Legal - Tarifas de recargos  
**Contexto legal:**
- Ley 2466/2025 art. 10: jornada nocturna 19:00-06:00 con recargo 35%
- Ley 2466/2025 art. 14: recargo dominical/festivo 80% hasta 30-jun-2026 y 90% desde 01-jul-2026
- CST art. 168: hora extra diurna 25% y nocturna 75%

**Cambios:**
- Actualiza HEDD (Hora Extra Diurna Dominical) de 105% a 115% para 2026-H2
- Actualiza HEND (Hora Extra Nocturna Dominical) de 155% a 165% para 2026-H2
- Agrega vigencia completa desde 2026-01-01

**Idempotencia:** ✅ Sí (usa WHERE con valores específicos)  
**Riesgo:** MEDIO - Afecta liquidación de nómina  
**Requiere dictamen jurídico:** ⚠️ SÍ - Cambia factores legales de liquidación

### ✅ Migración 3: `20261030130000_hr_ibc_caps_floors_2026`
**Tipo:** Legal - Topes y pisos de IBC  
**Contexto legal:**
- Ley 100 de 1993 y Decreto 780 de 1996
- IBC no puede ser inferior a 1 SMMLV ni superior a 25 SMMLV

**Cambios:**
- Inserta parámetro `IBC_TOPE_SMMLV` = 25 SMMLV
- Inserta parámetro `IBC_CAPS_FLOORS` para configuración por subsistema
- Aplica a todos los tenants existentes

**Idempotencia:** ✅ Sí (usa WHERE NOT EXISTS)  
**Riesgo:** MEDIO - Afecta cotizaciones de salud, pensión y ARL  
**Requiere dictamen jurídico:** ⚠️ SÍ - Establece límites legales

### ✅ Migración 4: `20261113120000_hr_nomina_legal_2026`
**Tipo:** Legal - Ajustes nómina 2026  
**Contexto legal:**
- CST art. 128 y Ley 1/1963: auxilio de transporte NO es salario
- Ley 2466/2025 art. 13: máximo 2h diarias y 12h semanales de trabajo suplementario

**Cambios:**
- Actualiza `AUX_TRANSPORTE` para NO integrar base de prestaciones ni vacaciones
- Inserta parámetro `MAX_HE_DIARIO` = 2 horas
- Inserta parámetro `MAX_HE_SEMANAL` = 12 horas
- Aplica a todos los tenants existentes

**Idempotencia:** ✅ Sí (UPDATE con WHERE específico + INSERT con WHERE NOT EXISTS)  
**Riesgo:** ALTO - Afecta cálculo de prima, cesantías e intereses de todos los empleados  
**Requiere dictamen jurídico:** ⚠️ SÍ - Corrige tratamiento legal del auxilio de transporte

## Procedimiento de Aplicación

### Paso 1: Respaldo de Producción
```bash
# Crear respaldo completo antes de cualquier cambio
pg_dump "$PROD_DATABASE_URL" > backup-prod-antes-alineacion-$(date +%Y%m%d).sql
```

### Paso 2: Aplicar Migraciones en Orden
Las migraciones deben aplicarse en orden cronológico:

```bash
# Conectar a producción
source config/production.env

# Migración 2 (saltando la 1 por ser fantasma)
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261030120000_hr_labor_rates_vigencia_2026/migration.sql

# Verificar aplicación
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations WHERE migration_name = '20261030120000_hr_labor_rates_vigencia_2026';"

# Migración 3
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261030130000_hr_ibc_caps_floors_2026/migration.sql

# Verificar aplicación
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations WHERE migration_name = '20261030130000_hr_ibc_caps_floors_2026';"

# Migración 4
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261113120000_hr_nomina_legal_2026/migration.sql

# Verificar aplicación
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations WHERE migration_name = '20261113120000_hr_nomina_legal_2026';"
```

### Paso 3: Registrar Migraciones en el Ledger
Después de aplicar cada migración, registrarla en `_prisma_migrations`:

```sql
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  '<checksum-sha256>',
  '20261030120000_hr_labor_rates_vigencia_2026',
  now(),
  1
);
```

**Nota:** El checksum es el SHA-256 del archivo `migration.sql` normalizado a LF.

### Paso 4: Verificar Alineación
```bash
node scripts/audit-db-alignment-api.js
```

Debe mostrar: "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"

### Paso 5: Certificar Funcionalidad
Ejecutar suites de pruebas contra producción para verificar que las migraciones no rompieron nada:

```bash
npm run qa:approval:evidence -- docs/qa/manifests/<manifest-file>.json
```

## Consideraciones Legales

⚠️ **ADVERTENCIA CRÍTICA:** Las migraciones 2, 3 y 4 tienen impacto legal directo en la liquidación de nómina de Colombia.

**Antes de aplicar:**
1. ✅ Contar con dictamen jurídico/contable que avale los cambios
2. ✅ Verificar que los parámetros legales sean correctos para 2026
3. ✅ Confirmar que la empresa opera bajo legislación colombiana
4. ✅ Notificar al contador/asesor legal de los cambios

**Según la memoria del proyecto:**
- "Una migración que renombra una tabla conserva el nombre viejo como vista"
- "Una modificación de semilla con efecto legal es forward-only y requiere dictamen jurídico/contable"
- "La migración histórica `20261113120000_hr_nomina_legal_2026` se conserva sin editar"

## Rollback Plan

Si alguna migración causa problemas:

1. **NO borrar la migración del ledger**
2. Crear una migración nueva que revierta los cambios
3. Aplicar la migración de reversa en producción
4. Documentar el incidente en `agents/CHANGELOG.md`

## Autorización Requerida

Para proceder con la aplicación de migraciones en producción, necesito:

- [ ] Autorización explícita del dueño de APEXOS
- [ ] Confirmación de dictamen jurídico/contable para migraciones legales
- [ ] Respaldo completo de producción antes de aplicar
- [ ] Plan de rollback documentado y probado

## Migración Fantasma: `20260601000000_baseline_core_schema`

**Investigación requerida:**
1. Verificar en QA si esta migración tiene contenido real o es un registro vacío
2. Consultar el historial de Git para ver si fue eliminada
3. Determinar si es seguro ignorarla o si necesita recrearse

**Comando para investigar en QA:**
```bash
source config/qa.env
psql "$DATABASE_URL" -c "SELECT * FROM _prisma_migrations WHERE migration_name = '20260601000000_baseline_core_schema';"
```

## Próximos Pasos

1. **Decisión sobre migración fantasma:** Investigar y decidir si aplicar o ignorar
2. **Autorización legal:** Confirmar dictamen jurídico para migraciones 2, 3 y 4
3. **Respaldo:** Crear respaldo completo de producción
4. **Aplicación:** Ejecutar migraciones en orden con verificación paso a paso
5. **Certificación:** Ejecutar suites de pruebas contra producción
6. **Documentación:** Actualizar `agents/CHANGELOG.md` con la intervención
