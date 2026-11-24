# Reglas Estrictas de Migración de Bases de Datos

**Fecha de creación:** 2026-11-17  
**Contexto:** Alineación de bases de datos QA → Producción tras detectar desalineación de 4 migraciones  
**Autor:** Equipo APEXOS (apexos-db-nube + apexos-qa)

## Principio Fundamental

**Toda migración de esquema debe existir en los 3 ambientes simultáneamente:** desarrollo (local), QA y Producción.

Una migración que solo existe en un ambiente es una deuda técnica que bloquea promociones y causa fallos en cascada.

## Reglas Obligatorias

### 1. Migraciones Versionadas y Atómicas

**Toda migración debe:**
- Tener nombre con timestamp único: `YYYYMMDDHHMMSS_descripcion_snake_case`
- Residir en `apps/api/prisma/migrations/{nombre}/migration.sql`
- Ser idempotente (ejecutable múltiples veces sin error)
- Incluir `IF NOT EXISTS` / `WHERE NOT EXISTS` donde aplique
- Registrar su checksum SHA-256 en `_prisma_migrations`

**Prohibido:**
- Crear migraciones sin archivo SQL en el repositorio
- Aplicar migraciones manualmente sin registrar en el ledger
- Editar migraciones ya promovidas a `develop` o `main`
- Usar `db push` en lugar de `migrate deploy` para cambios de esquema

### 2. Sincronización Multi-Ambiente

**Toda migración nueva debe aplicarse en este orden:**

1. **Desarrollo (local):**
   ```bash
   npx prisma migrate deploy
   ```
   - Verificar que el ledger local registre la migración
   - Ejecutar pruebas funcionales contra la base local

2. **QA (Supabase jbirkghkekuifgfsgquq):**
   - Aplicar migración vía SQL Editor o script automatizado
   - Registrar en `_prisma_migrations` con checksum correcto
   - Ejecutar suite de certificación QA
   - Verificar que el ledger de QA coincida con el local

3. **Producción (Supabase jzbwzmkidfthknsohhnr):**
   - **Requiere autorización explícita del dueño**
   - Aplicar migración vía SQL Editor o script automatizado
   - Registrar en `_prisma_migrations` con checksum correcto
   - Ejecutar suite de certificación Producción
   - Verificar alineación con QA

**Checklist de sincronización:**
```bash
# Antes de promover a develop
node scripts/audit-db-alignment-api.js
# Debe mostrar: "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"

# Después de aplicar migración en QA
node scripts/verify-migration-applied.js --env qa --migration {nombre}

# Después de aplicar migración en Producción
node scripts/verify-migration-applied.js --env prod --migration {nombre}
```

### 3. Checksum y Ledger

**El checksum de `_prisma_migrations` es el SHA-256 del archivo `migration.sql` normalizado a LF:**

```javascript
const crypto = require('crypto');
const fs = require('fs');

function calculateChecksum(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const normalized = content.replace(/\r\n/g, '\n'); // Windows → Unix
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

**Registro en ledger:**
```sql
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
VALUES (
  gen_random_uuid()::text,
  '{checksum-sha256}',
  '{migration_name}',
  now(),
  1,
  NULL
);
```

**Verificación post-registro:**
```sql
SELECT migration_name, checksum, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '{migration_name}';
```

Debe retornar exactamente 1 fila con el checksum correcto.

### 4. Migraciones Legales y Dictamen Jurídico

**Toda migración que modifique parámetros legales (tarifas, topes, porcentajes, bases de liquidación) requiere:**

1. **Dictamen jurídico/contable previo** que avale los cambios
2. **Documentación del contexto legal** en el archivo SQL (comentarios)
3. **Idempotencia estricta** con `WHERE NOT EXISTS` o `WHERE` específico
4. **No sobrescribir configuración de tenant** sin justificación explícita
5. **Certificación funcional** que verifique el cálculo legal correcto

**Ejemplo de migración legal:**
```sql
-- Contexto legal: Ley 2466/2025 art. 14
-- Recargo dominical/festivo: 80% hasta 30-jun-2026, 90% desde 01-jul-2026
-- No sobrescribe configuración de tenant existente

UPDATE th_labor_rates
SET percent = 115
WHERE code = 'HEDD'
  AND validity_period = '2026-H2'
  AND percent != 115;  -- Idempotente
```

### 5. Migraciones Fantasma y Anomalías del Ledger

**Una migración fantasma es un registro en `_prisma_migrations` sin archivo SQL correspondiente en el repositorio.**

**Detección:**
```bash
# Listar migraciones en ledger
node scripts/list-migrations.js --env qa

# Comparar con archivos en repositorio
diff <(ls apps/api/prisma/migrations/) <(node scripts/list-migrations.js --env qa --names-only)
```

**Procedimiento de eliminación:**
1. Verificar que `applied_steps_count = 0` (no ejecutó cambios reales)
2. Verificar que no haya tablas/columnas creadas por la migración
3. Consultar con el equipo si la migración tuvo efecto real
4. Si es seguro eliminar:
   ```sql
   DELETE FROM _prisma_migrations
   WHERE migration_name = '{nombre}'
     AND applied_steps_count = 0;
   ```
5. Documentar la eliminación en `agents/CHANGELOG.md`

**Prohibido:**
- Eliminar migraciones con `applied_steps_count > 0` sin análisis de impacto
- Eliminar migraciones que crearon tablas/columnas en uso
- Ignorar anomalías del ledger "porque no causan problemas"

### 6. Auditoría Continua

**Scripts de auditoría obligatorios:**

1. **`scripts/audit-db-alignment-api.js`**
   - Compara migraciones entre QA y Producción
   - Reporta diferencias con detalle
   - Ejecutar antes de cada promoción

2. **`scripts/verify-migration-applied.js`**
   - Verifica que una migración específica esté aplicada
   - Valida checksum y `applied_steps_count`
   - Ejecutar después de aplicar cada migración

3. **`scripts/list-migrations.js`**
   - Lista todas las migraciones en un ambiente
   - Compara con archivos en repositorio
   - Detecta migraciones fantasma

**Frecuencia de auditoría:**
- Antes de cada promoción a `develop`: obligatorio
- Antes de cada promoción a `main`: obligatorio
- Después de aplicar migración en QA/Producción: obligatorio
- Semanalmente en desarrollo activo: recomendado

### 7. Promoción de Ramas y Migraciones

**`desarrollo → develop`:**
- Todas las migraciones en `desarrollo` deben estar en QA
- `npm run qa:preqa:evidence -- <manifest>` verifica alineación
- Si hay migraciones faltantes en QA, la promoción se bloquea

**`develop → main`:**
- Todas las migraciones en `develop` deben estar en Producción
- `npm run qa:approval:evidence -- <manifest>` verifica alineación
- Si hay migraciones faltantes en Producción, la promoción se bloquea
- **Requiere autorización explícita del dueño para aplicar migraciones**

**Excepción:** Migraciones legales con dictamen jurídico pendiente pueden promoverse con estado degradado declarado en el manifiesto, pero deben aplicarse antes de certificar funcionalidad completa.

### 8. Documentación y Trazabilidad

**Toda migración debe documentar:**

1. **En el archivo SQL:**
   - Contexto legal/negocio (comentarios al inicio)
   - Impacto esperado (filas afectadas, tablas modificadas)
   - Idempotencia (cómo se comporta en segunda ejecución)

2. **En `agents/CHANGELOG.md`:**
   - Fecha de aplicación en cada ambiente
   - Checksum registrado
   - Responsable de la aplicación
   - Evidencia de verificación

3. **En `docs/qa/evidence/`:**
   - Salida de `audit-db-alignment-api.js` antes y después
   - Salida de `verify-migration-applied.js` para cada ambiente
   - Capturas de pantalla del SQL Editor si se aplicó manualmente

**Ejemplo de entrada en CHANGELOG:**
```markdown
## 2026-11-17 - Alineación de bases de datos QA → Producción

**Migraciones aplicadas en Producción:**
- `20261030120000_hr_labor_rates_vigencia_2026` (checksum: fa95b6d4...)
- `20261030130000_hr_ibc_caps_floors_2026` (checksum: 351ef400...)
- `20261113120000_hr_nomina_legal_2026` (checksum: 85114b7f...)

**Migración fantasma eliminada de QA:**
- `20260601000000_baseline_core_schema` (applied_steps_count = 0, sin efecto real)

**Verificación:**
- `node scripts/audit-db-alignment-api.js`: ✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS
- QA: 72 migraciones
- Producción: 72 migraciones

**Responsable:** Edwin (dueño de APEXOS)
**Evidencia:** `docs/qa/evidence/db-alignment-20261117/`
```

## Herramientas y Scripts

### Scripts Disponibles

1. **`scripts/audit-db-alignment-api.js`**
   - Auditoría de alineación entre QA y Producción
   - Uso: `node scripts/audit-db-alignment-api.js`

2. **`scripts/generate-alignment-sql.js`**
   - Genera comandos SQL para alinear bases de datos
   - Uso: `node scripts/generate-alignment-sql.js`
   - Salida: `docs/qa/evidence/alignment-sql-commands-{fecha}.sql`

3. **`scripts/verify-migration-applied.js`**
   - Verifica que una migración esté aplicada correctamente
   - Uso: `node scripts/verify-migration-applied.js --env qa|prod --migration {nombre}`

4. **`scripts/list-migrations.js`**
   - Lista migraciones en un ambiente
   - Uso: `node scripts/list-migrations.js --env qa|prod|local`

5. **`scripts/investigate-baseline-impact.js`**
   - Investiga impacto de migraciones fantasma
   - Uso: `node scripts/investigate-baseline-impact.js`

### Comandos de Auditoría

```bash
# Auditoría completa antes de promoción
npm run audit:qa:schema
npm run audit:production:schema

# Verificar alineación QA ↔ Producción
node scripts/audit-db-alignment-api.js

# Verificar migración específica
node scripts/verify-migration-applied.js --env qa --migration 20261030120000_hr_labor_rates_vigencia_2026

# Listar migraciones en ambiente
node scripts/list-migrations.js --env qa --names-only

# Investigar migración fantasma
node scripts/investigate-baseline-impact.js
```

## Casos de Estudio

### Caso 1: Desalineación QA → Producción (2026-11-17)

**Problema:** QA tenía 73 migraciones, Producción tenía 69. Diferencia: 4 migraciones.

**Análisis:**
- 1 migración fantasma en QA (`20260601000000_baseline_core_schema`)
- 3 migraciones legales faltantes en Producción

**Resolución:**
1. Eliminada migración fantasma de QA (`applied_steps_count = 0`)
2. Aplicadas 3 migraciones legales en Producción
3. Verificada alineación: ambos ambientes con 72 migraciones

**Lecciones aprendidas:**
- Las migraciones fantasma son anomalías que deben eliminarse
- Las migraciones legales requieren dictamen jurídico previo
- La auditoría continua detecta desalineaciones antes de que causen problemas

### Caso 2: Migración con Efecto Legal (2026-11-13)

**Problema:** La migración `20261113120000_hr_nomina_legal_2026` modificaba parámetros legales de nómina.

**Análisis:**
- Impacto: cálculo de prima, cesantías e intereses
- Requería dictamen jurídico/contable
- No era idempotente en su versión original

**Resolución:**
1. Obtenido dictamen jurídico
2. Refactorizada para ser idempotente con `WHERE NOT EXISTS`
3. Aplicada en QA con verificación de efecto
4. Aplicada en Producción con autorización explícita
5. Documentada en `agents/CHANGELOG.md`

**Lecciones aprendidas:**
- Las migraciones legales no se aplican sin dictamen
- La idempotencia es obligatoria para migraciones de catálogo
- El efecto se verifica por fila, no por "se ejecutó el SQL"

## Referencias

- **Skill apexos-db-nube:** `.qoder/skills/apexos-db-nube/SKILL.md`
- **Skill apexos-qa:** `.qoder/skills/apexos-qa/SKILL.md`
- **Política de aprobación QA:** `docs/CHANGE_APPROVAL_QA_POLICY.md`
- **Convenciones de base de datos:** `docs/DATABASE_CONVENTIONS.md`
- **Seguridad de base de datos:** `docs/DATABASE_SECURITY.md`

## Contacto

**Responsable de reglas:** apexos-db-nube  
**Responsable de auditoría:** apexos-qa  
**Autorización de aplicación en Producción:** Dueño de APEXOS (Edwin)

---

**Última actualización:** 2026-11-17  
**Versión:** 1.0  
**Estado:** Activo
