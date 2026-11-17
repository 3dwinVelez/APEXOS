#!/usr/bin/env node

/**
 * Auditoría de alineación de migraciones usando el API REST de Supabase
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    // Remove BOM if present
    line = line.replace(/^\uFEFF/, '');
    if (!line || line.startsWith('#')) return;
    
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      env[key] = value;
    }
  });
  
  return env;
}

function fetchMigrations(supabaseUrl, serviceRoleKey, environment) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== Consultando ${environment} ===`);
    console.log(`URL: ${supabaseUrl}`);
    
    const url = new URL(`${supabaseUrl}/rest/v1/_prisma_migrations`);
    url.searchParams.append('select', 'migration_name,finished_at,checksum');
    url.searchParams.append('order', 'finished_at.asc');
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error(`✗ Error HTTP ${res.statusCode}:`);
          console.error(data);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        try {
          const migrations = JSON.parse(data);
          console.log(`✓ Migraciones encontradas: ${migrations.length}`);
          
          if (migrations.length > 0) {
            console.log('\nÚltimas 5 migraciones:');
            migrations.slice(-5).forEach(m => {
              const date = m.finished_at ? new Date(m.finished_at).toISOString().split('T')[0] : 'pending';
              console.log(`  - ${m.migration_name} (${date})`);
            });
          }
          
          resolve({
            environment,
            migrations: migrations.map(m => m.migration_name),
            count: migrations.length,
            data: migrations
          });
        } catch (error) {
          console.error('✗ Error parseando respuesta JSON:');
          console.error(data);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`✗ Error de conexión: ${error.message}`);
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout de conexión (30 segundos)'));
    });
    
    req.end();
  });
}

function compareEnvironments(qaResult, prodResult) {
  console.log('\n\n=== COMPARACIÓN ===');
  
  const qaMigrations = new Set(qaResult.migrations);
  const prodMigrations = new Set(prodResult.migrations);
  
  const missingInProd = qaResult.migrations.filter(m => !prodMigrations.has(m));
  const extraInProd = prodResult.migrations.filter(m => !qaMigrations.has(m));
  
  console.log(`\nQA: ${qaResult.count} migraciones`);
  console.log(`Producción: ${prodResult.count} migraciones`);
  
  if (missingInProd.length === 0 && extraInProd.length === 0) {
    console.log('\n✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS');
    return { aligned: true };
  }
  
  console.log('\n⚠ DESALINEACIÓN DETECTADA');
  
  if (missingInProd.length > 0) {
    console.log(`\nMigraciones en QA pero FALTANTES en producción (${missingInProd.length}):`);
    missingInProd.forEach(m => console.log(`  - ${m}`));
  }
  
  if (extraInProd.length > 0) {
    console.log(`\nMigraciones en producción pero NO en QA (${extraInProd.length}):`);
    extraInProd.forEach(m => console.log(`  - ${m}`));
  }
  
  return {
    aligned: false,
    missingInProd,
    extraInProd
  };
}

async function main() {
  const projectDir = path.join(__dirname, '..');
  const configDir = path.join(projectDir, 'config');
  
  console.log('=== Auditoría de Alineación de Bases de Datos (API REST) ===\n');
  
  try {
    // Cargar QA
    const qaEnv = loadEnvFile(path.join(configDir, 'qa.env'));
    if (!qaEnv.SUPABASE_URL || !qaEnv.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Credenciales de Supabase no encontradas en config/qa.env');
    }
    if (!qaEnv.SUPABASE_URL.includes('jbirkghkekuifgfsgquq')) {
      throw new Error('SUPABASE_URL de QA no apunta al proyecto esperado');
    }
    console.log('✓ QA: proyecto jbirkghkekuifgfsgquq');
    
    // Cargar Producción
    const prodEnv = loadEnvFile(path.join(configDir, 'production.env'));
    if (!prodEnv.SUPABASE_URL || !prodEnv.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Credenciales de Supabase no encontradas en config/production.env');
    }
    if (!prodEnv.SUPABASE_URL.includes('jzbwzmkidfthknsohhnr')) {
      throw new Error('SUPABASE_URL de Producción no apunta al proyecto esperado');
    }
    console.log('✓ Producción: proyecto jzbwzmkidfthknsohhnr');
    
    // Consultar ambas bases de datos
    const qaResult = await fetchMigrations(qaEnv.SUPABASE_URL, qaEnv.SUPABASE_SERVICE_ROLE_KEY, 'QA (develop)');
    const prodResult = await fetchMigrations(prodEnv.SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY, 'Producción (main)');
    
    // Comparar
    const comparison = compareEnvironments(qaResult, prodResult);
    
    // Guardar resultado
    const outputDir = path.join(projectDir, 'docs', 'qa', 'evidence');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, `db-alignment-audit-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);
    const output = {
      timestamp: new Date().toISOString(),
      qa: qaResult,
      production: prodResult,
      comparison
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n✓ Resultado guardado en ${outputFile}`);
    
    process.exit(comparison.aligned ? 0 : 1);
    
  } catch (error) {
    console.error('\n✗ Error durante la auditoría:', error.message);
    process.exit(1);
  }
}

main();
