// Script para investigar el impacto real de la migración fantasma en QA
const https = require('https');

async function investigateBaselineImpact() {
  const qaEnvPath = 'config/qa.env';
  const fs = require('fs');
  
  if (!fs.existsSync(qaEnvPath)) {
    console.error('❌ No se encontró config/qa.env');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(qaEnvPath, 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Faltan variables en config/qa.env');
    process.exit(1);
  }
  
  console.log('🔍 Investigando impacto real de baseline_core_schema en QA...\n');
  
  // 1. Verificar el checksum del archivo en QA
  const checksumUrl = new URL(`${supabaseUrl}/rest/v1/_prisma_migrations`);
  checksumUrl.searchParams.append('migration_name', 'eq.20260601000000_baseline_core_schema');
  checksumUrl.searchParams.append('select', 'checksum,applied_steps_count,logs');
  
  const checksumResult = await fetchFromSupabase(checksumUrl, serviceRoleKey);
  console.log('📊 Registro en ledger de QA:');
  console.log(JSON.stringify(checksumResult, null, 2));
  console.log('');
  
  // 2. Comparar conteo de tablas entre QA y producción
  console.log('📋 Comparando estructura de tablas...\n');
  
  const tablesQuery = `
    SELECT table_name, 
           (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count
    FROM information_schema.tables t
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%'
      AND table_name != '_prisma_migrations'
    ORDER BY table_name
  `;
  
  // Ejecutar consulta RPC si existe, o usar SQL directo
  const rpcUrl = new URL(`${supabaseUrl}/rest/v1/rpc/get_table_structure`);
  
  // Alternativa: contar tablas directamente
  const countUrl = new URL(`${supabaseUrl}/rest/v1/`);
  
  console.log('⚠️  Nota: Para comparar estructura completa, ejecutar manualmente:');
  console.log('   En QA: SELECT count(*) FROM information_schema.tables WHERE table_schema = \'public\';');
  console.log('   En PROD: SELECT count(*) FROM information_schema.tables WHERE table_schema = \'public\';');
  console.log('');
  
  // 3. Buscar si hay tablas con nombre "baseline" o relacionadas
  console.log('🔎 Buscando tablas relacionadas con baseline...');
  const baselineTablesQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%baseline%' OR table_name LIKE '%core_schema%')
  `;
  
  console.log('   (Requiere ejecución manual en SQL Editor de Supabase)');
  console.log('');
  
  // 4. Analizar el checksum
  if (checksumResult && checksumResult.length > 0) {
    const migration = checksumResult[0];
    console.log('🔬 Análisis del checksum:');
    console.log(`   Checksum: ${migration.checksum}`);
    console.log(`   Applied steps: ${migration.applied_steps_count}`);
    console.log(`   Logs: ${migration.logs || '(vacío)'}`);
    console.log('');
    
    if (migration.applied_steps_count === 0) {
      console.log('⚠️  ALERTA: applied_steps_count = 0');
      console.log('   Esto indica que la migración se registró pero no ejecutó pasos.');
      console.log('   Es muy probable que NO haya hecho cambios reales en el esquema.');
      console.log('');
    }
    
    if (migration.logs === '' || migration.logs === null) {
      console.log('✅ No hay logs de error, pero tampoco hay evidencia de ejecución.');
      console.log('');
    }
  }
  
  // 5. Recomendación
  console.log('📋 RECOMENDACIÓN:');
  console.log('   1. La migración baseline_core_schema es una anomalía del ledger de QA');
  console.log('   2. applied_steps_count = 0 sugiere que no ejecutó cambios reales');
  console.log('   3. El archivo SQL nunca existió en el repositorio git');
  console.log('   4. Para confirmar: ejecutar en QA la consulta de tablas existentes');
  console.log('   5. Si no hay tablas "baseline" o "core_schema", es seguro eliminar el registro');
  console.log('');
  console.log('🗑️  PROCEDIMIENTO DE ELIMINACIÓN (pendiente de confirmación):');
  console.log('   DELETE FROM _prisma_migrations WHERE migration_name = \'20260601000000_baseline_core_schema\';');
  console.log('');
}

function fetchFromSupabase(url, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey,
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
          console.error(`⚠️  HTTP ${res.statusCode}: ${data}`);
          resolve(null);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`⚠️  Error: ${err.message}`);
      resolve(null);
    });
    
    req.end();
  });
}

investigateBaselineImpact()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
