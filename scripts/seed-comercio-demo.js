// Semilla de demostracion del modulo Comercio (M-30).
// Poblado multi-indole: catalogo de 12 rubros con descuentos y destacados, clientes,
// compras a proveedores, ventas de mostrador (contado y credito), abonos de cartera,
// gastos e ingresos, para ver la vitrina publica y el cockpit financiero con volumen
// realista en la base local.
//
// Uso:
//   node scripts/seed-comercio-demo.js                        # tenant demo@apex.local
//   node scripts/seed-comercio-demo.js --email otro@corp.co   # otro tenant
//   node scripts/seed-comercio-demo.js --products-only        # solo maestros
//   node scripts/seed-comercio-demo.js --promo-percent 15     # campana de vitrina
//   node scripts/seed-comercio-demo.js --force-movements      # historial aunque haya ventas
//
// Idempotente: los productos se buscan por (nombre, categoria) y los clientes por
// documento; el historial de documentos (ventas/compras/gastos) solo se genera si el
// tenant anida no tiene ventas, para no duplicar la contabilidad al repetir la semilla.
// Todo pasa por el servicio real de Comercio: el stock, el costo promedio y los
// movimientos quedan trazados igual que en produccion.
require("./load-env")();

const commerce = require("../apps/api/src/modules/comercio/service");
const prisma = require("../apps/api/src/core/prisma");

const DEFAULT_EMAIL = "demo@apex.local";

// Techo del historial: 75 dias de mostrador caben en ~180 tiquetes. Mas que eso solo
// alarga la semilla sin aportar variedad al cockpit.
const MAX_SALES = Number(argSafe("max-sales", 180));

function argSafe(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// [nombre, unidad, precio lista, costo, stock inicial, stock minimo, descuento %, destacado, descripcion]
const CATALOG = [
  ["Abarrotes", [
    ["Arroz grano dorado 500 g", "unidad", 4200, 3100, 120, 20, 0, false, "Arroz en bolsa de 500 g, grano entero."],
    ["Frijol Cargamanto 500 g", "unidad", 7800, 5600, 80, 15, 10, false, "Frijol rojo seleccionado."],
    ["Lenteja 500 g", "unidad", 5600, 3900, 70, 15, 0, false, "Lenteja limpia, listo para cocinar."],
    ["Aceite de girasol 900 ml", "botella", 12900, 9800, 60, 12, 0, true, "Aceite vegetal para cocina."],
    ["Espagueti 500 g", "unidad", 4800, 3200, 90, 15, 0, false, "Pasta tipo espagueti."],
    ["Harina de trigo 1 kg", "unidad", 5900, 4100, 70, 12, 0, false, "Harina multiuso."],
    ["Azucar morena 1 kg", "unidad", 6400, 4600, 80, 15, 0, false, "Azucar sin blanquear."],
    ["Sal yodada 500 g", "unidad", 2600, 1700, 100, 20, 0, false, "Sal de mesa con yodo."],
    ["Huevos grandes x 12", "carton", 11500, 8900, 60, 12, 0, true, "Carton de 12 huevos."],
    ["Atun en aceite 140 g", "lata", 6900, 5100, 90, 20, 15, false, "Lata de atun en aceite vegetal."],
    ["Cafe molido 250 g", "paquete", 11200, 8200, 70, 15, 0, true, "Cafe colombiano molido."],
    ["Panela pico 1 kg", "unidad", 8600, 6200, 50, 10, 0, false, "Panela artesanal rallada."]
  ]],
  ["Bebidas", [
    ["Gaseosa cola 1.5 L", "botella", 6200, 4400, 120, 24, 0, false, "Bebida gaseosa de cola."],
    ["Gaseosa limonada 1.5 L", "botella", 5900, 4200, 100, 24, 0, false, "Bebida gaseosa de limon."],
    ["Jugo de fruta 1 L", "caja", 7400, 5200, 80, 16, 10, false, "Jugo de larga vida, sabor a elegir."],
    ["Agua sin gas 600 ml", "botella", 2500, 1500, 200, 40, 0, false, "Agua embotellada individual."],
    ["Agua con gas 600 ml", "botella", 3000, 1900, 90, 20, 0, false, "Agua mineral con gas."],
    ["Malta 250 ml", "lata", 3400, 2300, 96, 20, 0, false, "Bebida de malta."],
    ["Bebida energetica 250 ml", "lata", 8900, 6400, 48, 12, 0, true, "Bebida energetica con taurina."],
    ["Te frio 500 ml", "botella", 4200, 2800, 72, 16, 0, false, "Te endulzado sabor durazno."],
    ["Chocolate saborizado 980 ml", "botella", 8600, 6300, 40, 10, 0, false, "Bebida de chocolate."],
    ["Limonada natural 1 L", "unidad", 7000, 4000, 30, 8, 20, false, "Limonada preparada del dia, mantener en frio."]
  ]],
  ["Snacks y golosinas", [
    ["Papas fritas 120 g", "bolsa", 5600, 3800, 120, 24, 0, false, "Papas onduladas con sal."],
    ["Galletas de soda x 12", "paquete", 3900, 2500, 100, 20, 0, false, "Galletas saladas individuales."],
    ["Galletas rellenas de choco", "paquete", 5200, 3400, 90, 18, 15, false, "Relleno de cacao."],
    ["Cacahuate salado 100 g", "bolsa", 4500, 3000, 80, 16, 0, false, "Cacahuate tostado con sal."],
    ["Bombon de frutas x 45 g", "bolsa", 2800, 1700, 150, 30, 0, false, "Dulces masticables de frutas."],
    ["Chocolate con leche 50 g", "tableta", 6800, 4700, 80, 16, 0, true, "Tableta de chocolate con leche."],
    ["Maiz pufu 30 g", "bolsa", 2000, 1200, 160, 30, 0, false, "Snack de maiz inflado."],
    ["Chitos de queso 30 g", "bolsa", 2500, 1500, 140, 30, 0, false, "Snack de maiz con queso."],
    ["Palitos salados x 6", "paquete", 3300, 2100, 70, 15, 0, false, "Palitos de pan salados."],
    ["Chicle de menta x 10", "tarro", 4900, 3300, 60, 12, 0, false, "Chicles sin azucar."]
  ]],
  ["Lacteos y congelados", [
    ["Leche entera 1 L", "caja", 6300, 4800, 90, 20, 0, false, "Leche UHT larga vida."],
    ["Leche deslactosada 1 L", "caja", 7200, 5500, 50, 12, 0, false, "Leche sin lactosa."],
    ["Queso doble crema 250 g", "unidad", 12500, 9200, 40, 10, 0, true, "Queso fresco para mesa."],
    ["Queso mozzarella rallado 200 g", "bolsa", 11800, 8600, 35, 8, 10, false, "Para gratinar."],
    ["Yogurt natural 150 g", "unidad", 3200, 2100, 90, 18, 0, false, "Yogurt cremoso sin sabor."],
    ["Yogurt de frutas x 4", "pack", 11200, 8100, 40, 10, 0, false, "Pack de cuatro yogures saborizados."],
    ["Mantequilla 250 g", "unidad", 9600, 7000, 45, 10, 0, false, "Mantequilla sin sal."],
    ["Crema de leche 250 ml", "caja", 6800, 4800, 40, 10, 0, false, "Nata para cocinar."],
    ["Helado de vainilla 1 L", "frasco", 21900, 15800, 20, 5, 0, false, "Helado cremoso, mantener congelado."],
    ["Pollo entero congelado", "libra", 9200, 7100, 60, 15, 0, false, "Pollo limpio empacado al vacio."]
  ]],
  ["Frutas y verduras", [
    ["Tomate rojo", "libra", 4200, 2900, 50, 10, 0, false, "Tomate maduro por libra."],
    ["Cebolla cabezona", "libra", 3800, 2500, 60, 12, 0, false, "Cebolla larga y cabezona segun cosecha."],
    ["Papa criolla", "libra", 3200, 2100, 80, 15, 0, false, "Papa pequena para hornear."],
    ["Platano verde", "libra", 2900, 1900, 70, 15, 0, false, "Plato para patacon o maduro."],
    ["Banano", "docena", 8900, 6200, 30, 8, 0, false, "Banano de la semana."],
    ["Aguacate Hass", "unidad", 6500, 4400, 40, 10, 0, true, "Aguacate crema, punto de maduracion medio."],
    ["Limon Tahiti", "libra", 4800, 3200, 45, 10, 0, false, "Limon verde jugoso."],
    ["Cilantro y cebollin", "atado", 2000, 1200, 50, 12, 0, false, "Atado de hierbas frescas."],
    ["Zanahoria", "libra", 3000, 2000, 50, 10, 0, false, "Zanahoria limpia."],
    ["Mango maduro x 5", "unidad", 8900, 6100, 30, 8, 0, false, "Racion de cinco mangos maduros."]
  ]],
  ["Limpieza del hogar", [
    ["Detergente en polvo 400 g", "bolsa", 8900, 6300, 70, 15, 0, false, "Detergente para ropa a mano y maquina."],
    ["Lejia concentrada 1 L", "botella", 6400, 4400, 60, 12, 0, false, "Desinfectante de cloro."],
    ["Limpiador aromatico 1 L", "botella", 7200, 5000, 65, 12, 10, false, "Limpiador de pisos con aroma."],
    ["Suavizante de telas 750 ml", "botella", 9800, 6900, 45, 10, 0, true, "Suavizante con aroma duradero."],
    ["Esponja doble uso x 3", "pack", 5200, 3300, 50, 10, 0, false, "Esponja abrasiva y suave."],
    ["Lavaplatos 500 ml", "botella", 6900, 4700, 60, 12, 0, false, "Desengrasante para cocina."],
    ["Bolsas de basura 30 L x 10", "pack", 7800, 5200, 45, 10, 0, false, "Bolsas grandes resistentes."],
    ["Ambientador en aerosol 250 ml", "unidad", 11500, 8200, 30, 8, 0, false, "Frescor para ambientes."],
    ["Pasta abrillantadora 200 g", "frasco", 8600, 5900, 25, 6, 0, false, "Para metales y superficies."],
    ["Escoba de cabeza ancha", "unidad", 12900, 9000, 20, 5, 0, false, "Escoba con mango incluido."]
  ]],
  ["Cuidado personal", [
    ["Jabon de tocador 100 g", "unidad", 4600, 3100, 90, 18, 0, false, "Jabon hidratante para piel."],
    ["Shampoo reparador 400 ml", "botella", 16900, 12200, 40, 10, 20, true, "Shampoo para cabello secos."],
    ["Pasta dental 100 ml", "unidad", 8900, 6100, 70, 15, 0, false, "Proteccion con fluor."],
    ["Cepillo dental medio", "unidad", 5400, 3400, 60, 12, 0, false, "Cerdas suaves."],
    ["Desodorante en piedra 75 g", "unidad", 12500, 8800, 35, 8, 0, false, "Desodorante sin alcohol."],
    ["Papel higienico x 4 rollos", "pack", 15800, 11200, 50, 12, 0, false, "Hoja doble absorbente."],
    ["Toallas humedas x 40", "paquete", 8200, 5600, 40, 10, 0, false, "Para uso infantil y adulto."],
    ["Protectores solares FPS 50", "frasco", 27900, 19800, 18, 5, 15, false, "Proteccion solar alta, resistente al agua."],
    ["Pañales de bebé talla 30 x 30", "paquete", 24900, 17800, 25, 6, 0, false, "Desechables, talla según el peso del bebé."],
    ["Crema corporal 250 ml", "frasco", 13900, 9600, 30, 8, 0, false, "Hidratacion para piel seca."]
  ]],
  ["Mascotas", [
    ["Concentrado para perro 1.5 kg", "bolsa", 22900, 16500, 30, 8, 0, true, "Alimento balanceado para adulto."],
    ["Concentrado para gato 500 g", "bolsa", 12800, 9100, 35, 8, 0, false, "Alimento para gato."],
    ["Arena sanitaria 2 kg", "bolsa", 13900, 9600, 28, 6, 10, false, "Arena aglomerante con control de olor."],
    ["Snack dental para perro", "paquete", 7900, 5200, 45, 10, 0, false, "Recompensa que cuida los dientes."],
    ["Shampoo para perro 250 ml", "botella", 11500, 8000, 22, 6, 0, false, "Bano con aroma neutro."],
    ["Correa para perro 1.5 m", "unidad", 14900, 9800, 18, 5, 0, false, "Correa con mosqueton."],
    ["Plato doble para mascota", "unidad", 16900, 11200, 15, 4, 0, false, "Comedero y bebedero en un set."],
    ["Juguete mordedor de goma", "unidad", 9900, 6100, 26, 6, 0, false, "Resistente para cachorros."]
  ]],
  ["Ferreteria", [
    ["Martillo de una 16 oz", "unidad", 24900, 17500, 15, 4, 0, false, "Martillo de acero con mango ergonomico."],
    ["Cinta de enmascarar 1\" x 30 m", "unidad", 6900, 4400, 40, 10, 0, false, "Para pintura y trabajos limpios."],
    ["Cinta de aislar 20 m", "unidad", 4900, 3100, 45, 10, 0, false, "Aislante electrico negro."],
    ["Tornillos y tuercas x 50", "caja", 11900, 8200, 25, 6, 0, false, "Surtido de fijaciones y tuercas."],
    ["Destornillador plano 6\"", "unidad", 8900, 5600, 28, 6, 0, false, "Punta plana con mango antideslizante."],
    ["Llave inglesa 8\"", "unidad", 21900, 15200, 12, 4, 0, true, "Ajustable para tubos y tuercas."],
    ["Candado 40 mm con llave", "unidad", 15900, 10500, 20, 5, 0, false, "Candado de laton para rejas."],
    ["Pintura vinilica 1 L", "lata", 24500, 17000, 18, 5, 15, false, "Blanco mate para interiores."],
    ["Kit de pintura 10 piezas", "set", 38900, 27000, 10, 3, 0, false, "Rodillo, brocha, bandeja y espátula."],
    ["Foco LED 9 W luz calida", "unidad", 7900, 5100, 60, 12, 0, false, "Ahorro de energia, rosca E27."]
  ]],
  ["Papeleria y oficina", [
    ["Cuaderno de 100 hojas", "unidad", 7900, 5200, 60, 12, 0, false, "Cuaderno cuadriculado universitario."],
    ["Esferograficas azules x 10", "caja", 9900, 6600, 40, 10, 0, false, "Tinta azul punta media."],
    ["Block de notas adhesivas", "unidad", 5900, 3700, 45, 10, 0, false, "Post-it de 76 x 76 mm."],
    ["Resaltador de colores x 4", "pack", 8600, 5600, 30, 8, 0, false, "Colores surtidos."],
    ["Cinta pegante 2\" x 30 m", "unidad", 4200, 2600, 55, 12, 0, false, "Cinta celofan transparente."],
    ["Tijeras escolares punta roma", "unidad", 6500, 4100, 30, 8, 0, false, "Seguras para ninos."],
    ["Carpetas de plastico x 10", "paquete", 12900, 8900, 22, 6, 0, false, "Carpetas oficio con broche."],
    ["Sobres kraft x 20", "paquete", 9800, 6700, 20, 5, 0, false, "Sobres manila para archivo."]
  ]],
  ["Ropa y calzado", [
    ["Camiseta basica algodon", "unidad", 24900, 16500, 50, 10, 0, true, "Cuello redondo, tallas S a XL."],
    ["Jean pitillo unisex", "unidad", 69900, 45000, 25, 6, 20, false, "Denim elastico, tallas 26 a 38."],
    ["Sudadera polar con capucha", "unidad", 58900, 38000, 20, 5, 0, false, "Forro polar abrigado."],
    ["Calcetines deportivos x 3", "pack", 15900, 10200, 40, 10, 0, false, "Algodon con refuerzo en talon."],
    ["Gorra camionera", "unidad", 18900, 11800, 30, 8, 0, false, "Visera curva, talla unica."],
    ["Zapatillas deportivas casual", "pares", 89900, 58000, 15, 4, 25, true, "Suela ligera, numero 34 a 43."],
    ["Poncho impermeable", "unidad", 21900, 13900, 22, 6, 0, false, "Reutilizable, para lluvia repentica."],
    ["Pijama de dos piezas", "unidad", 39900, 26500, 18, 5, 0, false, "Conjunto de algodon para dormir."],
    ["Calzado de seguridad", "pares", 119000, 82000, 10, 3, 0, false, "Punta reforzada, uso industrial."],
    ["Mochila escolar reforzada", "unidad", 45900, 30500, 20, 5, 10, false, "Compartimento para computador.."]
  ]],
  ["Tecnologia y accesorios", [
    ["Cable USB-C 1 m", "unidad", 14900, 9200, 40, 10, 0, false, "Carga rapida y datos."],
    ["Audifonos intraauriculares", "unidad", 25900, 16500, 25, 6, 0, true, "Con microfono y control de volumen."],
    ["Bateria portatil 10.000 mAh", "unidad", 69900, 48000, 15, 4, 15, false, "Power bank con dos salidas USB."],
    ["Memoria USB 32 GB", "unidad", 29900, 20500, 20, 5, 0, false, "USB 3.0 de alta velocidad."],
    ["Mouse optico con cable", "unidad", 19900, 12800, 26, 6, 0, false, "Sensibilidad ajustable."],
    ["Teclado USB completo", "unidad", 34900, 24000, 14, 4, 0, false, "Distribucion espanol, teclas resistentes."],
    ["Soporte de celular para auto", "unidad", 18900, 11500, 22, 6, 0, false, "Brazo articulado para rejilla."],
    ["Foco inteligente wifi", "unidad", 49900, 34000, 10, 3, 0, false, "Cambio de color desde el telefono."]
  ]]
];

// Clientes de mostrador: [nombre, documento, telefono, direccion]
const CUSTOMERS = [
  ["Marta Linda Rios", "CC-1020345678", "+57 300 5551201", "Calle 12 # 4-34, Barrio Centro"],
  ["Jorge Elias Cardona", "CC-1010998877", "+57 311 4420918", "Carrera 5 # 18-60, La Esmeralda"],
  ["Ada Yaneth Motato", "CC-52330114", "+57 320 7713344", "Calle 45 # 12-08, El Recreo"],
  ["Luis Fernando Ospina", "CC-79554122", "+57 315 2200991", "Carrera 10 # 25-14, San Antonio"],
  ["Gloria Stella Arroyave", "CC-27441889", "+57 301 9987665", "Calle 8 # 3-21, El Poblado"],
  ["Hernan Darrio Quintero", "CC-83112445", "+57 313 5560123", "Carrera 22 # 50-11, Laureles"],
  ["Nubia Isabel Restrepo", "CC-31225077", "+57 300 1180942", "Calle 30 # 7-45, Belen"],
  ["Alberto Ruiz Salazar", "CC-94117220", "+57 318 4471230", "Carrera 8 # 14-90, Chía"],
  ["Diana Marcela Toro", "CC-67880911", "+57 312 7789002", "Calle 20 # 5-33, Sabaneta"],
  ["Fabio Alonso Nieto", "CC-1200394455", "+57 310 6654120", "Carrera 15 # 40-27, Itagui"],
  ["Sandra Milena Cuartas", "CC-70335119", "+57 314 2299081", "Calle 5 # 11-60, Envigado"],
  ["William Arboleda Gil", "CC-1109345211", "+57 317 5531209", "Carrera 30 # 9-14, Bello"],
  ["Luz Marina Vasquez", "CC-25447119", "+57 302 4478120", "Calle 18 # 2-05, Caldas"],
  ["Yeison Padilla Roldan", "CC-1030778844", "+57 319 8870011", "Carrera 7 # 60-30, Copacabana"]
];

const SUPPLIERS = ["Distribuciones El Roble", "Central Mayorista SA", "Deposito La Ocho", "Reposteria y Granos Andina", "Ferreteria Tornillos JS"];
const CASH_METHODS = ["Efectivo", "Nequi", "Daviplata", "Tarjeta debito"];
const EXPENSES = [
  ["Arriendo del local", "Arriendo", 1800000],
  ["Energia electrica", "Servicios", 385000],
  ["Agua y aseo", "Servicios", 210000],
  ["Internet y datos", "Servicios", 165000],
  ["Transporte de mercancía", "Transporte", 240000],
  ["Bolsas y empaques", "Insumos", 128000],
  ["Mantenimiento de nevera", "Mantenimiento", 190000],
  ["Servicio de contaduría", "Administrativo", 320000],
  ["Reposición de caja menor", "Caja menor", 65000],
  ["Publicidad en redes", "Marketing", 180000],
  ["Repuesto de balanza", "Mantenimiento", 95000],
  ["Aseo y papelería del local", "Insumos", 72000]
];
const INCOMES = [
  ["Recargas telefonicas cobradas", "Servicios", 96000],
  ["Pago de servicios publicos de terceros", "Servicios", 245000],
  ["Alquiler de vitrina temporal", "Otros", 180000],
  ["Consiginacion de producto de terceros", "Otros", 120000],
  ["Cobro de domiciliarios", "Domicilios", 84000]
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

// PRNG determinista: la misma semilla produce el mismo historico, util para comparar
// corridas de certificacion.
function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 10);
}

async function resolveTenant(email) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No hay usuario local con el correo ${email}. Indica --email de un tenant existente.`);
  const tenant = await prisma.tenant.findFirst({ where: { id: user.tenant_id } });
  if (!tenant) throw new Error(`El usuario ${email} no tiene tenant asociado.`);
  return { tenant, user };
}

async function ensureComercioModule(tenant) {
  const modules = Array.isArray(tenant.active_modules) ? tenant.active_modules : [];
  if (modules.includes("M-30")) return;
  await prisma.tenant.update({ where: { id: tenant.id }, data: { active_modules: [...modules, "M-30"] } });
  console.log(`  - Se habilito el modulo M-30 en el tenant ${tenant.name}.`);
}

async function seedCatalog(tenantId, userId) {
  const existing = await prisma.runWithTenant(tenantId, () => prisma.comercioProduct.findMany({}));
  const index = new Set(existing.map((row) => `${row.name}|||${row.category || ""}`.toLowerCase()));
  let created = 0;
  let skipped = 0;
  for (const [category, products] of CATALOG) {
    for (const [name, unit, price, cost, stock, minStock, discountPercent, featured, notes] of products) {
      const key = `${name}|||${category}`.toLowerCase();
      if (index.has(key)) { skipped += 1; continue; }
      await commerce.createProduct(tenantId, userId, {
        name, category, unit, price, cost, stock,
        min_stock: minStock,
        discount_percent: discountPercent,
        catalog_featured: Boolean(featured),
        notes
      });
      index.add(key);
      created += 1;
    }
  }
  console.log(`  - Productos: ${created} nuevos, ${skipped} ya existían (${existing.length} en base al iniciar).`);
}

async function seedCustomers(tenantId) {
  const existing = await prisma.runWithTenant(tenantId, () => prisma.comercioCustomer.findMany({ where: { __includeInactive: true } }));
  const docs = new Set(existing.map((row) => row.document));
  let created = 0;
  for (const [name, document, phone, address] of CUSTOMERS) {
    if (docs.has(document)) continue;
    await commerce.createCustomer(tenantId, { name, document, phone, email: null, address, notes: "Cliente de mostrador de la semilla demo." });
    created += 1;
  }
  const all = await prisma.runWithTenant(tenantId, () => prisma.comercioCustomer.findMany({}));
  console.log(`  - Clientes: ${created} nuevos, ${all.length} activos en total.`);
  return all;
}

async function seedPurchases(tenantId, userId, products, random) {
  const picks = products.filter(() => random() > 0.72).slice(0, 18);
  let count = 0;
  for (const product of picks) {
    const quantity = 12 + Math.floor(random() * 60);
    const unitCost = Math.max(1, Math.round(Number(product.cost) * (0.9 + random() * 0.25)));
    await commerce.createPurchase(tenantId, userId, {
      product_id: product.id,
      quantity,
      unit_cost: unitCost,
      supplier: SUPPLIERS[Math.floor(random() * SUPPLIERS.length)],
      date: dayAgo(1 + Math.floor(random() * 70)),
      note: "Reposicion de mostrador (semilla demo)."
    });
    count += 1;
  }
  console.log(`  - Compras a proveedores: ${count} registradas (costo promedio ponderado actualizado).`);
}

async function seedSales(tenantId, userId, products, customers, random) {
  const sellable = products.filter((row) => row.active && row.stock > 6);
  const credits = [];
  let sales = 0;
  let voided = 0;
  for (let dayOffset = 74; dayOffset >= 0 && sales < MAX_SALES; dayOffset -= 1) {
    // Fin de semana vende mas: 2-6 tiquetes entre semana y 4-9 sabado/domingo.
    const weekday = new Date(`${dayAgo(dayOffset)}T12:00:00Z`).getUTCDay();
    const tickets = weekday === 0 || weekday === 6 ? 3 + Math.floor(random() * 3) : 1 + Math.floor(random() * 3);
    for (let ticket = 0; ticket < tickets; ticket += 1) {
      const lines = 1 + Math.floor(random() * 4);
      const chosen = new Map();
      for (let line = 0; line < lines; line += 1) {
        const product = sellable[Math.floor(random() * sellable.length)];
        if (!product) continue;
        chosen.set(product.id, (chosen.get(product.id) || 0) + 1 + Math.floor(random() * 3));
      }
      if (chosen.size === 0) continue;
      const items = [...chosen.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
      const useCredit = random() > 0.86 && customers.length > 0;
      try {
        const payload = { date: dayAgo(dayOffset), items, note: "Mostrador (semilla demo)." };
        if (useCredit) {
          const customer = customers[Math.floor(random() * customers.length)];
          const count = 2 + Math.floor(random() * 5);
          payload.payment_type = "credit";
          payload.customer_id = customer.id;
          payload.credit = {
            down_payment: 0,
            installment_count: count,
            frequency: ["weekly", "biweekly", "monthly"][Math.floor(random() * 3)],
            first_due_date: dayAgo(Math.max(0, dayOffset - 7 * count))
          };
        } else {
          payload.payment_type = "cash";
          payload.method = CASH_METHODS[Math.floor(random() * CASH_METHODS.length)];
          if (random() > 0.7 && customers.length) {
            payload.customer_id = customers[Math.floor(random() * customers.length)].id;
          }
        }
        const sale = await commerce.createSale(tenantId, userId, payload);
        sales += 1;
        if (useCredit) credits.push(sale);
        // Anulacion ocasional de una venta al contado reciente.
        if (!useCredit && random() > 0.97) {
          await commerce.voidSale(tenantId, userId, sale.id, { reason: "Error de digitacion en el mostrador" });
          voided += 1;
        }
      } catch (error) {
        // Stock insuficiente o producto archivado en el camino: la semilla continua.
        if (error.code !== "STOCK_INSUFFICIENT" && error.code !== "PRODUCT_INACTIVE") throw error;
      }
    }
  }
  console.log(`  - Ventas: ${sales} creadas (${credits.length} a credito), ${voided} anuladas.`);
  return credits;
}

// Abonos: unos creditos quedan pagados, otros parciales y algunos en mora, para que la
// cartera del cockpit muestre los tres estados.
async function seedCreditPayments(tenantId, userId, creditSales, random) {
  let paidFull = 0;
  let partial = 0;
  for (const sale of creditSales) {
    const credit = await prisma.runWithTenant(tenantId, () => prisma.comercioCredit.findFirst({
      where: { sale_id: sale.id },
      include: { installments: { orderBy: { number: "asc" } } }
    }));
    if (!credit) continue;
    const financed = Number(credit.financed_amount);
    const roll = random();
    if (roll > 0.6) {
      await commerce.addCreditPayment(tenantId, userId, credit.id, { amount: financed, method: CASH_METHODS[Math.floor(random() * CASH_METHODS.length)], date: dayAgo(1), note: "Pago total del credito (semilla demo)." });
      paidFull += 1;
    } else if (roll > 0.2) {
      const first = credit.installments[0];
      if (first) {
        await commerce.addCreditPayment(tenantId, userId, credit.id, { amount: Number(first.amount), method: "Efectivo", date: dayAgo(2 + Math.floor(random() * 5)), note: "Abono a la primera cuota (semilla demo)." });
        partial += 1;
      }
    }
  }
  console.log(`  - Cartera: ${paidFull} creditos pagados, ${partial} con abono parcial, ${creditSales.length - paidFull - partial} abiertos.`);
}

async function seedCashflow(tenantId, userId, random) {
  let expenses = 0;
  let incomes = 0;
  for (let month = 2; month >= 0; month -= 1) {
    for (const [concept, category, amount] of EXPENSES) {
      const drift = 0.85 + random() * 0.3;
      await commerce.createExpense(tenantId, userId, {
        concept, category, amount: Math.round(amount * drift),
        method: random() > 0.5 ? "Transferencia" : "Efectivo",
        direction: "expense",
        date: dayAgo(month * 30 + Math.floor(random() * 9)),
        note: "Gasto operativo (semilla demo)."
      });
      expenses += 1;
    }
    for (const [concept, category, amount] of INCOMES) {
      const drift = 0.8 + random() * 0.5;
      await commerce.createExpense(tenantId, userId, {
        concept, category, amount: Math.round(amount * drift),
        method: "Efectivo",
        direction: "income",
        date: dayAgo(month * 30 + Math.floor(random() * 12)),
        note: "Ingreso por fuera del catalogo (semilla demo)."
      });
      incomes += 1;
    }
  }
  console.log(`  - Flujo: ${expenses} egresos y ${incomes} ingresos registrados.`);
}

// Campana de vitrina + eslogan: la pagina debe tener algo que resaltar (banda de
// promocion, badges y precio tachado) desde el primer vistazo.
async function seedSettings(tenantId, promoPercent) {
  const current = await commerce.getSettings(tenantId);
  await commerce.updateSettings(tenantId, {
    catalog_enabled: true,
    catalog_tagline: current.catalog_tagline || "Abarrotes, ferretería, ropa y más: pide por WhatsApp y te apartamos el pedido.",
    catalog_promo_label: "Liquidación de temporada",
    catalog_promo_percent: promoPercent,
    catalog_promo_start: dayAgo(2),
    catalog_promo_end: dayAgo(-14)
  });
  console.log(`  - Vitrina: campana "Liquidación de temporada" al ${promoPercent}% vigente 16 dias, con eslogan.`);
}

// Agotados y stock critico: la vitrina necesita mostrar el badge "Agotado" y el panel
// necesita alertas de minimo. Se pasa por adjustStock para que quede trazado.
async function seedStockSignals(tenantId, userId, random) {
  const products = await prisma.runWithTenant(tenantId, () => prisma.comercioProduct.findMany({ where: { active: true } }));
  const alreadyOut = products.filter((row) => Number(row.stock) === 0).length;
  if (alreadyOut >= 5) {
    console.log(`  - Senales de inventario: ya hay ${alreadyOut} agotados, se omite.`);
    return;
  }
  const candidates = products.filter((row) => Number(row.stock) > 0 && !row.code.includes("SMOKE"));
  const shuffled = candidates.map((row) => ({ row, sort: random() })).sort((a, b) => a.sort - b.sort);
  let agotados = 0;
  let criticos = 0;
  for (const { row } of shuffled) {
    if (agotados < 5) {
      await commerce.adjustStock(tenantId, userId, row.id, { new_stock: 0, reason: "Agotado en mostrador (semilla demo)" });
      agotados += 1;
      continue;
    }
    if (criticos < 4) {
      await commerce.adjustStock(tenantId, userId, row.id, { new_stock: row.min_stock, reason: "Ajuste de stock critico (semilla demo)" });
      criticos += 1;
      continue;
    }
    break;
  }
  console.log(`  - Senales de inventario: ${agotados} productos agotados y ${criticos} en stock minimo.`);
}

async function main() {
  const email = arg("email", DEFAULT_EMAIL);
  const productsOnly = process.argv.includes("--products-only");
  const promoPercent = Number(arg("promo-percent", 12));
  const { tenant, user } = await resolveTenant(email);
  console.log(`Semilla Comercio (M-30) en el tenant ${tenant.name} (${tenant.id}) con usuario ${user.email}.`);
  await ensureComercioModule(tenant);

  await seedSettings(tenant.id, Number.isFinite(promoPercent) ? promoPercent : 12);
  await seedCatalog(tenant.id, user.id);
  if (productsOnly) {
    console.log("Solo maestros: se omitieron clientes, compras, ventas, cartera y flujo.");
    return;
  }

  const existingSales = await prisma.runWithTenant(tenant.id, () => prisma.comercioSale.count({}));
  await seedStockSignals(tenant.id, user.id, makeRandom(4711));
  if (existingSales > 0 && !process.argv.includes("--force-movements")) {
    console.log(`  - El tenant ya tiene ${existingSales} ventas: se omite el historial para no duplicar la contabilidad (usa --force-movements para poblar de todos modos).`);
    return;
  }

  const customers = await seedCustomers(tenant.id);
  const products = await prisma.runWithTenant(tenant.id, () => prisma.comercioProduct.findMany({ where: { active: true } }));
  const random = makeRandom(20261028);
  await seedPurchases(tenant.id, user.id, products, random);
  const refreshed = await prisma.runWithTenant(tenant.id, () => prisma.comercioProduct.findMany({ where: { active: true } }));
  const credits = await seedSales(tenant.id, user.id, refreshed, customers, random);
  await seedCreditPayments(tenant.id, user.id, credits, random);
  await seedCashflow(tenant.id, user.id, random);

  const summary = await prisma.runWithTenant(tenant.id, async () => ({
    productos: await prisma.comercioProduct.count({}),
    clientes: await prisma.comercioCustomer.count({}),
    ventas: await prisma.comercioSale.count({}),
    creditos: await prisma.comercioCredit.count({}),
    abonos: await prisma.comercioPayment.count({}),
    compras: await prisma.comercioPurchase.count({}),
    movimientos: await prisma.comercioStockMovement.count({}),
    flujo: await prisma.comercioExpense.count({})
  }));
  console.log("Estado final del tenant:", summary);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error("La semilla fallo:", error.message || error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
