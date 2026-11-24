#!/usr/bin/env node
/**
 * Verifica que una migración específica esté aplicada correctamente en un ambiente
 * 
 * USO: node scripts/verify-migration-applied.js --env qa|prod --migration {nombre}
 */

const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      result.env = args[i + 1];
      i++;
    } else if (args[i] === '--migration' && args[i + 1]) {
      result.migration = args[i + 1];
      i++;
    }
  }
  
  if (!result.env || !result.migration) {
    console.error('❌ Uso: node scripts/verify-migration-applied.js --env qa|prod --migration {nombre}');
    process.exit(1);
  }
  
  return result;
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`No se encontró ${envPath}`);
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  content.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  return env;
}

function calculateChecksum(migrationName) {
  const filePath = `apps/api/prisma/migrations/${migrationName}/migration.sql`;
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el archivo: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function queryData(supabaseUrl, serviceRoleKey, table, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
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
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const { env, migration } = parseArgs();
  
  console.log(`🔍 Verificando migración: ${migration}`);
  console.log(`   Ambiente: ${env.toUpperCase()}`);
  console.log('');
  
  try {
    // Cargar variables de entorno
    const envPath = env === 'qa' ? 'config/qa.env' : 'config/production.env';
    const envVars = loadEnv(envPath);
    
    // Verificar project ref
    const expectedRef = env === 'qa' ? 'jbirkghkekuifgfsgquq' : 'jzbwzmkidfthknsohhnr';
    if (!envVars.SUPABASE_URL.includes(expectedRef)) {
      throw new Error(`❌ ${envPath} no apunta al proyecto ${env} correcto`);
    }
    
    // Calcular checksum esperado
    const expectedChecksum = calculateChecksum(migration);
    console.log(`🔐 Checksum esperado: ${expectedChecksum}`);
    console.log('');
    
    // Consultar migración en el ledger
    console.log('📊 Consultando ledger de migraciones...');
    const result = await queryData(
      envVars.SUPABASE_URL,
      envVars.SUPABASE_SERVICE_ROLE_KEY,
      '_prisma_migrations',
      {
        select: 'id,migration_name,checksum,finished_at,applied_steps_count,logs',
        migration_name: `eq.${migration}`
      }
    );
    
    if (result.length === 0) {
      console.log('❌ MIGRACIÓN NO ENCONTRADA');
      console.log(`   La migración ${migration} no está registrada en ${env.toUpperCase()}`);
      console.log('');
      console.log('📋 Acción requerida:');
      console.log('   1. Aplicar la migración en el SQL Editor de Supabase');
      console.log('   2. Registrar en _prisma_migrations con el checksum correcto');
      console.log('   3. Volver a ejecutar este script para verificar');
      process.exit(1);
    }
    
    const migrationRecord = result[0];
    console.log('✅ Migración encontrada en el ledger');
    console.log(`   ID: ${migrationRecord.id}`);
    console.log(`   Fecha: ${migrationRecord.finished_at}`);
    console.log(`   Applied steps: ${migrationRecord.applied_steps_count}`);
    console.log('');
    
    // Verificar checksum
    if (migrationRecord.checksum !== expectedChecksum) {
      console.log('❌ CHECKSUM INCORRECTO');
      console.log(`   Esperado: ${expectedChecksum}`);
      console.log(`   Encontrado: ${migrationRecord.checksum}`);
      console.log('');
      console.log('📋 Acción requerida:');
      console.log('   El checksum registrado no coincide con el archivo SQL.');
      console.log('   Esto puede indicar que:');
      console.log('   - El archivo SQL fue modificado después de aplicar la migración');
      console.log('   - La migración se registró con un checksum incorrecto');
      console.log('   - Hay una corrupción en el ledger');
      console.log('');
      console.log('   Para corregir:');
      console.log('   1. Verificar el archivo SQL en el repositorio');
      console.log('   2. Actualizar el checksum en _prisma_migrations si es necesario');
      process.exit(1);
    }
    
    console.log('✅ Checksum correcto');
    console.log('');
    
    // Verificar applied_steps_count
    if (migrationRecord.applied_steps_count !== 1) {
      console.log('⚠️  ALERTA: applied_steps_count != 1');
      console.log(`   Valor: ${migrationRecord.applied_steps_count}`);
      console.log('');
      console.log('   Esto puede indicar que la migración no se completó correctamente.');
      console.log('   Revisar los logs de la migración si existen.');
      console.log('');
    } else {
      console.log('✅ Applied steps count correcto (1)');
      console.log('');
    }
    
    // Verificar logs
    if (migrationRecord.logs && migrationRecord.logs.trim() !== '') {
      console.log('⚠️  ALERTA: La migración tiene logs');
      console.log(`   Logs: ${migrationRecord.logs}`);
      console.log('');
      console.log('   Revisar los logs para verificar si hay errores o advertencias.');
      console.log('');
    }
    
    // Resumen
    console.log('='.repeat(80));
    console.log('✅ VERIFICACIÓN EXITOSA');
    console.log('='.repeat(80));
    console.log('');
    console.log(`La migración ${migration} está correctamente aplicada en ${env.toUpperCase()}`);
    console.log('');
    console.log('📊 Resumen:');
    console.log(`   - Registrada en ledger: ✅`);
    console.log(`   - Checksum válido: ✅`);
    console.log(`   - Applied steps: ✅`);
    console.log(`   - Logs: ${migrationRecord.logs ? '⚠️  (revisar)' : '✅ (sin errores)'}`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
