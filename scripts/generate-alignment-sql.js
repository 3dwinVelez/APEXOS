#!/usr/bin/env node
/**
 * Generador de comandos SQL para alineación de bases de datos
 * 
 * Genera los comandos SQL exactos para ejecutar en el SQL Editor de Supabase:
 * 1. Eliminar migración fantasma de QA
 * 2. Aplicar 3 migraciones legales en producción
 * 3. Verificar alineación final
 * 
 * USO: node scripts/generate-alignment-sql.js
 */

const fs = require('fs');
const crypto = require('crypto');

function calculateChecksum(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

console.log('🔧 Generando comandos SQL para alineación de bases de datos...\n');

// Migraciones legales
const migrations = [
  {
    name: '20261030120000_hr_labor_rates_vigencia_2026',
    file: 'apps/api/prisma/migrations/20261030120000_hr_labor_rates_vigencia_2026/migration.sql',
    description: 'Tarifas de recargos Ley 2466/2025'
  },
  {
    name: '20261030130000_hr_ibc_caps_floors_2026',
    file: 'apps/api/prisma/migrations/20261030130000_hr_ibc_caps_floors_2026/migration.sql',
    description: 'Topes y pisos IBC Ley 100/1993'
  },
  {
    name: '20261113120000_hr_nomina_legal_2026',
    file: 'apps/api/prisma/migrations/20261113120000_hr_nomina_legal_2026/migration.sql',
    description: 'Ajustes legales nómina 2026'
  }
];

let output = '';

// ============================================================================
// PASO 1: Eliminar migración fantasma de QA
// ============================================================================
output += `-- ============================================================================
-- PASO 1: Eliminar migración fantasma de QA
-- ============================================================================
-- Ejecutar en: SQL Editor de Supabase QA (jbirkghkekuifgfsgquq)
-- Proyecto: https://supabase.com/dashboard/project/jbirkghkekuifgfsgquq/sql

-- Verificar antes de ejecutar:
SELECT id, migration_name, applied_steps_count, checksum
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Si existe y applied_steps_count = 0, eliminar:
DELETE FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema'
  AND applied_steps_count = 0;

-- Verificar eliminación:
SELECT count(*) as remaining_baseline
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Debe retornar 0

`;

// ============================================================================
// PASO 2: Aplicar migraciones legales en producción
// ============================================================================
output += `-- ============================================================================
-- PASO 2: Aplicar migraciones legales en producción
-- ============================================================================
-- Ejecutar en: SQL Editor de Supabase Producción (jzbwzmkidfthknsohhnr)
-- Proyecto: https://supabase.com/dashboard/project/jzbwzmkidfthknsohhnr/sql

-- IMPORTANTE: Ejecutar cada migración en orden y verificar antes de continuar

`;

migrations.forEach((migration, index) => {
  const checksum = calculateChecksum(migration.file);
  const sql = fs.readFileSync(migration.file, 'utf-8');
  
  output += `-- ------------------------------------------------------------------------
-- Migración ${index + 1}: ${migration.name}
-- Descripción: ${migration.description}
-- Checksum: ${checksum}
-- ------------------------------------------------------------------------

-- Verificar si ya está aplicada:
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '${migration.name}';

-- Si NO existe (0 filas), ejecutar:
${sql}

-- Registrar en ledger:
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
VALUES (
  gen_random_uuid()::text,
  '${checksum}',
  '${migration.name}',
  now(),
  1,
  NULL
);

-- Verificar registro:
SELECT migration_name, checksum, finished_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '${migration.name}';

-- Debe retornar 1 fila con checksum = ${checksum}

`;
});

// ============================================================================
// PASO 3: Verificar alineación final
// ============================================================================
output += `-- ============================================================================
-- PASO 3: Verificar alineación final
-- ============================================================================

-- Ejecutar en QA:
SELECT migration_name, finished_at, checksum
FROM _prisma_migrations
ORDER BY finished_at ASC;

-- Ejecutar en Producción:
SELECT migration_name, finished_at, checksum
FROM _prisma_migrations
ORDER BY finished_at ASC;

-- Comparar: ambas consultas deben retornar las mismas migraciones
-- (excepto timestamps que pueden diferir)

-- Contar migraciones en QA:
SELECT count(*) as qa_migration_count
FROM _prisma_migrations;

-- Contar migraciones en Producción:
SELECT count(*) as prod_migration_count
FROM _prisma_migrations;

-- Ambos conteos deben ser iguales

`;

// ============================================================================
// Resumen
// ============================================================================
output += `-- ============================================================================
-- RESUMEN
-- ============================================================================
-- 
-- 1. Ejecutar PASO 1 en QA (eliminar migración fantasma)
-- 2. Ejecutar PASO 2 en Producción (aplicar 3 migraciones legales en orden)
-- 3. Ejecutar PASO 3 en ambos ambientes (verificar alineación)
-- 
-- Después de ejecutar:
-- - QA debe tener N migraciones
-- - Producción debe tener N migraciones (mismas que QA)
-- - Las 3 migraciones legales deben estar en ambos ambientes
-- - La migración fantasma baseline_core_schema no debe existir en QA
-- 
-- Si todo está correcto, ejecutar:
-- node scripts/audit-db-alignment-api.js
-- 
-- Debe mostrar: "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"
-- ============================================================================
`;

// Guardar en archivo
const outputFile = 'docs/qa/evidence/alignment-sql-commands-20261117.sql';
fs.writeFileSync(outputFile, output, 'utf-8');

console.log(`✅ Comandos SQL generados en: ${outputFile}`);
console.log('');
console.log('📋 Instrucciones:');
console.log('   1. Abrir el archivo generado en un editor de texto');
console.log('   2. Ejecutar PASO 1 en SQL Editor de Supabase QA');
console.log('   3. Ejecutar PASO 2 en SQL Editor de Supabase Producción (en orden)');
console.log('   4. Ejecutar PASO 3 en ambos ambientes para verificar');
console.log('   5. Ejecutar: node scripts/audit-db-alignment-api.js');
console.log('');
console.log('🔐 Checksums de migraciones:');
migrations.forEach(m => {
  const checksum = calculateChecksum(m.file);
  console.log(`   ${m.name}`);
  console.log(`   → ${checksum}`);
});
