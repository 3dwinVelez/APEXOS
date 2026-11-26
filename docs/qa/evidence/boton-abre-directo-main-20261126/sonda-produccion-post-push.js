// Sonda de solo lectura: que corre hoy en Produccion, medido por artefacto.
// Cero escrituras: tres GET al API, un GET al portal y los chunks que /login referencia.
const fs = require('fs');
const path = require('path');

const API = 'https://apexos-api-prod-production.up.railway.app';
const WEB = process.env.SONDA_WEB || 'https://apexos-web-prod-production.up.railway.app';
const PROYECTO_PROD = 'jzbwzmkidfthknsohhnr';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';

const ETIQUETA = WEB.includes('railway.app') ? 'railway' : 'dominio';
const SALIDA = path.resolve(__dirname, 'post-push-produccion-' + ETIQUETA + '.json');
if (fs.existsSync(SALIDA) && !process.argv.includes('--force')) {
  console.error('ABORTA: la evidencia ya existe, no se pisa sin --force declarado ->', SALIDA);
  process.exit(2);
}
if (process.env.SONDA_ALLOW_HOST && !API.includes('prod-production')) {
  console.error('ABORTA: el host del API no es el de Produccion');
  process.exit(2);
}

async function json(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  const t = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(t); } catch (e) { cuerpo = { crudo: t.slice(0, 200) }; }
  return { estado: r.status, cuerpo };
}

async function chunksDeLogin() {
  const r = await fetch(WEB + '/login', { headers: { 'user-agent': UA, 'accept-language': 'es-CO,es;q=0.9' } });
  const h = await r.text();
  const set = new Set();
  for (const m of h.matchAll(/["(](\/_next\/static\/chunks\/[A-Za-z0-9._\-\/%]+\.js)/g)) set.add(m[1]);
  const total = { 'abrir_la_app': 0, 'copiar_enlace': 0, 'navigator_clipboard': 0,  };
  const conTexto = [];
  for (const p of set) {
    const rr = await fetch(WEB + p, { headers: { 'user-agent': UA } });
    if (!rr.ok) continue;
    const t = await rr.text();
    const c = {
      'abrir_la_app': (t.match(/Abrir la app/g) || []).length,
      'copiar_enlace': (t.match(/Copiar enlace/g) || []).length,
      'navigator_clipboard': (t.match(/navigator\.clipboard/g) || []).length,
      'banda': (t.match(/APEXOS Web Móvil/g) || []).length,
    };
    total.abrir_la_app += c.abrir_la_app;
    total.copiar_enlace += c.copiar_enlace;
    total.navigator_clipboard += c.navigator_clipboard;
    
    if (c.abrir_la_app || c.copiar_enlace || c.navigator_clipboard || c.banda) conTexto.push({ ruta: p, bytes: t.length, ...c });
  }
  return {
    estado: r.status,
    html_bytes: h.length,
    chunks_referenciados: set.size,
    total,
    chunks_con_texto: conTexto,
    banda_en_html: (h.match(/APEXOS Web Móvil|Descarga nuestra app/g) || []).length,
  };
}

(async () => {
  const health = await json(API + '/health');
  const publica = await json(API + '/api/v1/public/platform/mobile-app');
  const login = await chunksDeLogin();
  const sirviendo = String((health.cuerpo && health.cuerpo.commit) || '');
  const veredicto = /0ec1cff0/.test(sirviendo)
    ? 'PRODUCCION SIRVE EL CANDIDATO: salud ' + sirviendo + ', ruta publica ' + publica.estado
    : 'PRODUCCION TODAVIA NO SIRVE EL CANDIDATO: la salud responde ' + (sirviendo || 'sin commit') + ' y la ruta publica ' +
      publica.estado + '; el boton del acceso aparece en ' + login.total.abrir_la_app + ' de ' + login.chunks_referenciados + ' chunks';
  const out = {
    medido_en: new Date().toISOString(),
    proyecto_ref: PROYECTO_PROD,
    api: { base: API, health: health, ruta_publica: { estado: publica.estado, cuerpo: publica.cuerpo } },
    web: { base: WEB, login },
    candidato_empujado: '0ec1cff0',
    punto_de_partida: 'e3c2ad17',
    veredicto,
  };
  fs.writeFileSync(SALIDA, JSON.stringify(out, null, 2) + '\n');
  console.log(veredicto);
  console.log('evidencia ->', SALIDA);
})().catch((e) => { console.error('ABORTA:', e && e.message); process.exit(1); });
