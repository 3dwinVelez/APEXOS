#!/usr/bin/env node
/**
 * Lista migraciones en un ambiente y detecta migraciones fantasma
 * 
 * USO: node scripts/list-migrations.js --env qa|prod|local [--names-only] [--detect-phantom]
 */

const https = require('https');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { namesOnly: false, detectPhantom: false };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      result.env = args[i + 1];
      i++;
    } else if (args[i] === '--names-only') {
      result.namesOnly = true;
    } else if (args[i] === '--detect-phantom') {
      result.detectPhantom = true;
    }
  }
  
  if (!result.env) {
    console.error('❌ Uso: node scripts/list-migrations.js --env qa|prod|local [--names-only] [--detect-phantom]');
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
    
    const req2 = https.request(options, (res) => {
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
    
    req2.on('error', reject);
    req2.end();
  });
}

function getLocalMigrations() {
  const migrationsDir = 'apps/api/prisma/migrations';
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  
  return fs.readdirSync(migrationsDir)
    .filter(f => fs.statSync(`${migrationsDir}/${f}`).isDirectory())
    .filter(f => /^\d{14}_/.test(f))
    .sort();
}

async function main() {
  const { env, namesOnly, detectPhantom } = parseArgs();
  
  try {
    let migrations;
    
    if (env === 'local') {
      // Listar migraciones locales
      migrations = getLocalMigrations();
      
      if (namesOnly) {
        migrations.forEach(m => console.log(m));
      } else {
        console.log(`📦 Migraciones locales: ${migrations.length}`);
        console.log('');
        migrations.forEach((m, i) => {
          console.log(`${i + 1}. ${m}`);
        });
      }
      
      if (detectPhantom) {
        console.log('');
        console.log('ℹ️  Nota: Las migraciones locales son la fuente de verdad.');
        console.log('   Comparar con QA/Producción para detectar fantasma en esos ambientes.');
      }
      
      return;
    }
    
    // Listar migraciones en QA o Producción
    const envPath = env === 'qa' ? 'config/qa.env' : 'config/production.env';
    const envVars = loadEnv(envPath);
    
    const expectedRef = env === 'qa' ? 'jbirkghkekuifgfsgquq' : 'jzbwzmkidfthknsohhnr';
    if (!envVars.SUPABASE_URL.includes(expectedRef)) {
      throw new Error(`❌ ${envPath} no apunta al proyecto ${env} correcto`);
    }
    
    const result = await queryData(
      envVars.SUPABASE_URL,
      envVars.SUPABASE_SERVICE_ROLE_KEY,
      '_prisma_migrations',
      {
        select: 'migration_name,checksum,finished_at,applied_steps_count',
        order: 'finished_at.asc'
      }
    );
    
    if (namesOnly) {
      result.forEach(m => console.log(m.migration_name));
    } else {
      console.log(`📦 Migraciones en ${env.toUpperCase()}: ${result.length}`);
      console.log('')
      result.forEach((m, i) => {
        console.log(`${i + 1}. ${m.migration_name}`);
        console.log(`   Checksum: ${m.checksum}`);
        console.log(`   Fecha: ${m.finished_at}`);
        console.log(`   Applied steps: ${m.applied_steps_count}`);
        console.log('');
      });
    }
    
    if (detectPhantom) {
      console.log('🔍 Detectando migraciones fantasma...');
      console.log('');
      
      const localMigrations = new Set(getLocalMigrations());
      const envMigrations = result.map(m => m.migration_name);
      
      const phantoms = envMigrations.filter(m => !localMigrations.has(m));
      
      if (phantoms.length === 0) {
        console.log('✅ No se detectaron migraciones fantasma');
      } else {
        console.log(`⚠️  Se detectaron ${phantoms.length} migraciones fantasma:`);
        console.log('');
        phantoms.forEach(p => {
          const record = result.find(r => r.migration_name === p);
          console.log(`   - ${p}`);
          console.log(`     Applied steps: ${record.applied_steps_count}`);
          console.log(`     Checksum: ${record.checksum}`);
          console.log('');
        });
        
        console.log('📋 Acción recomendada:');
        console.log('   1. Verificar si las migraciones fantasma tuvieron efecto real');
        console.log('   2. Si applied_steps_count = 0, es seguro eliminarlas del ledger');
        console.log('   3. Ejecutar: node scripts/investigate-baseline-impact.js');
        console.log('');
      }
      
      // También detectar migraciones en local que no están en el ambiente
      const missingInEnv = [...localMigrations].filter(m => !envMigrations.includes(m));
      if (missingInEnv.length > 0) {
        console.log(`⚠️  Hay ${missingInEnv.length} migraciones en local que no están en ${env.toUpperCase()}:`);
        console.log('');
        missingInEnv.forEach(m => {
          console.log(`   - ${m}`);
        });
        console.log('');
        console.log('📋 Acción requerida:');
        console.log(`   Aplicar las migraciones faltantes en ${env.toUpperCase()}`);
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
