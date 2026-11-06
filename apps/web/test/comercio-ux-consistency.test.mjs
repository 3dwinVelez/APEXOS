// Pruebas de fuente de la pasada UX del modulo Comercio (2026-11-06).
//
// Son pruebas de contrato visual: leen el fuente y exigen que la pasada se mantenga. No
// sustituyen la certificacion de navegador (npm run certify:comercio-ux:local), que es la
// que mide desbordes, contraste, foco y tactiles en Chromium real. Aqui se corta la
// regresion barata: que alguien vuelva a poner una busqueda cruda, un texto sin tilde, un
// hook despues del gate de permisos o una capa de la vitrina sin aro de accesibilidad.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");

const shared = read("../components/comercio/shared.tsx");
const searchField = read("../components/ui/SearchField.tsx");
const modalFrame = read("../components/ui/ModalFrame.tsx");
const button = read("../components/ui/button.tsx");
const dataTable = read("../components/ui/data-table.tsx");
const storefront = read("../components/comercio/storefront.tsx");
const overlayHook = read("../components/ui/useOverlayA11y.ts");
const combobox = read("../components/transport/TransportSearchSelect.tsx");
const palette = read("../components/system/CommandPalette.tsx");
const theme = read("../components/comercio/storefront-theme.ts");
const graficos = read("../app/dashboard/comercio/ComercioCharts.tsx");
const rutaVitrina = read("../app/tienda/[code]/page.tsx");
const css = read("../app/globals.css");
const tailwind = read("../tailwind.config.ts");

const carpeta = path.resolve(directory, "../app/dashboard/comercio");
const fuentes = {};
for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
  if (entrada.isDirectory()) {
    const archivo = path.join(carpeta, entrada.name, "page.tsx");
    if (fs.existsSync(archivo)) fuentes[entrada.name] = fs.readFileSync(archivo, "utf8");
  } else if (entrada.name === "page.tsx") {
    fuentes.portada = fs.readFileSync(path.join(carpeta, "page.tsx"), "utf8");
  }
}
const nombrePantalla = Object.keys(fuentes).sort();

// Los comentarios del codigo van sin tildes por convencion del repo; solo el texto que ve
// el usuario lleva ortografia completa. Se quitan comentarios, rutas, clases y valores
// cortos de estado (`"movil"`, `"escritorio"`): son identificadores, no etiquetas.
const textoVisible = (fuente) => fuente
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/className=\{?"[^"]*"\}?/g, " ")
  .replace(/(href|src|for|id|key|type|role|aria-[a-z-]+|data-[a-z-]+)=\{?"[^"]*"\}?/g, " ")
  .replace(/"[a-z][a-z0-9_]{2,12}"/g, " ")
  .replace(/\/(?:dashboard|tienda|api|comercio|login)[\w\-/?=.]*/g, " ")
  .replace(/\b(?:set|get|use|on)[A-Z]\w*\b/g, " ")
  .replace(/\b[a-z]+(?:-[a-z0-9]+)+\b/g, " ");
// Palabras que el español escribe con tilde y que aqui solo se perdonan ya acentuadas.
// Cuidado con las que cambian de sentido segun la tilde: "cuando", "como", "que", "quien",
// "solo" y "publico" se dejaron fuera porque sin tilde tambien son correctas, y el barrido
// no puede pedirle al diccionario lo que el contexto decide.
const FALTA_SIN_TILDE = [
  "ademas", "aqui", "asi", "autonomo", "automatica", "automaticamente", "automatico", "aun",
  "busqueda", "busquedas", "camara", "camaras", "campana", "campanas", "categoria", "categorias",
  "catalogo", "catalogos", "caracter", "codigo", "codigos", "corazon", "credito", "creditos",
  "deca?da", "decision", "definicion", "descripcion", "despues", "dia", "dias", "difusion",
  "direccion", "discusion", "disposicion", "division", "documentacion", "edicion", "energia",
  "enfasis", "examenes", "exportacion", "facil", "facilmente", "fabrica", "facturacion",
  "financiacion", "funcion", "funciones", "gestion", "hipotesis", "imagenes", "indice",
  "informacion", "intervencion", "jardin", "lapiz", "limite", "linea", "lineas", "liquidacion",
  "maquina", "margenes", "mercancia", "minima", "minimo", "minimas", "minimos", "movil", "moviles",
  "multiplo", "multiples", "numero", "numeros", "nucleo", "ocasion", "opinion", "organizacion",
  "pagina", "paginas", "parrafo", "participacion", "pequena", "pequeno", "politica", "politicas",
  "posicion", "presentacion", "proposito", "proteccion", "proxima", "proximo", "proximas",
  "proximos", "publica", "rapida", "rapido", "rapidamente", "region", "relacion", "reposicion",
  "revision", "revolucion", "seleccion", "sesion", "silaba", "situacion", "solucion", "tactica",
  "telefono", "telefonos", "titulo", "titulos", "transito", "unica", "unico", "unicas", "unicos",
  "ultima", "ultimo", "ultimas", "ultimos", "util", "utiles", "valido", "variacion", "version",
  "envio", "envios", "mas", "tambien", "no esta",
];
const PALABRAS_SIN_TILDE = new RegExp(`\\b(?:${FALTA_SIN_TILDE.join("|")})\\b`, "i");
// La eñe es la otra mitad de la ortografia y se techa igual: aqui no caben las que nacen de
// un extranjerismo ("cadena", "canal", "extranjero"), solo las formas que en español se
// escriben con eñe y en el modulo aparecen ya corregidas.
const FALTA_SIN_ENYE = [
  "campana", "campanas", "disena", "disenado", "disenador", "disenadora", "disenadas",
  "disenados", "disenas", "diseno", "duena", "dueno", "manana", "mananas", "penultimo",
  "penultima", "senal", "senales", "anos",
];
const PALABRAS_SIN_ENYE = new RegExp(`\\b(?:${FALTA_SIN_ENYE.join("|")})\\b`, "i");
// Las tres reglas de ortografia visible, juntas y en el orden que reportan la falta.
const esFalta = (texto) => PALABRAS_SIN_TILDE.exec(texto) || TERMINACION_SIN_TILDE.exec(texto) || PALABRAS_SIN_ENYE.exec(texto);
// Regla estructural: en español no hay palabra terminada en -cion / -sion sin tilde, asi que
// alcanza con el final para saber que falta. Cubre las que la lista no enumera (anulacion,
// promocion, audicion, suscripcion...) y no choca con "action", "function" o "version" porque
// esos terminos caen en el recorte de identificadores de arriba.
const TERMINACION_SIN_TILDE = /\b\w*[aeiou](?:cion|sion)\b/i;

// Un candidato es texto que un humano puede leer en pantalla: el que va entre comillas o
// backticks, o el que queda entre un `>` y un `<` en el arbol JSX (con sus expresiones `{}`
// ya fuera). Escanear lineas crudas no sirve: `const [limite, setLimite] = ...` es un
// identificador, no una etiqueta, y la prueba lo reportaba como falta de ortografia.
function textosVisibles(fuente) {
  const limpio = textoVisible(fuente);
  const sinLlaves = (s) => s.replace(/\{[^{}]*\}/g, " ").replace(/\s+/g, " ").trim();
  const candidatos = [];
  for (const m of limpio.matchAll(/"([^"\n]{3,})"|`([^`\n]{3,})`|>((?:[^<>]|\{[^{}]*\}){3,}?)</g)) {
    const texto = sinLlaves(m[1] ?? m[2] ?? m[3] ?? "");
    if (texto.length < 3) continue;
    // Se exige espacio o inicial mayuscula: "movil" o "limite" sueltos son claves de estado
    // o identificadores; "Categorias" o "3 categorias disponibles" si son etiquetas.
    if (!/ /.test(texto) && !/^[A-ZÁÉÍÓÚÑ]/.test(texto)) continue;
    candidatos.push(texto);
  }
  return candidatos;
}

// Cada `function` declarada en la primera columna abre un componente o un utilitario del
// archivo. Las reglas de hooks son por cuerpo, asi que hay que partir ahi y no por archivo.
function componentes(fuente) {
  const aperturas = [...fuente.matchAll(/^(?:export default )?function \w+/gm)].map((m) => m.index);
  return aperturas.map((inicio, i) => fuente.slice(inicio, aperturas[i + 1] ?? fuente.length));
}

test("toda pantalla de Comercio sabe donde esta el usuario", () => {
  assert.match(shared, /aria-label="Ubicaci\u00f3n en Comercio"/, "ModuleHeader debe publicar la brujula");
  assert.match(shared, /aria-current="page"/, "la pantalla actual debe marcarse como pagina actual");
  assert.match(shared, /href="\/dashboard\/comercio"/, "la brujula debe llevar de vuelta al centro de Comercio");
  assert.doesNotMatch(shared, /\{eyebrow\}/, "el eyebrow de jerga (M-30) ya no existe");
  for (const nombre of nombrePantalla) {
    // Sin jerga de modulo en lo que se ve: ni "M-30" suelto ni referencias al prototipo.
    assert.doesNotMatch(textoVisible(fuentes[nombre]), /\bM-\d{2}\b/, `${nombre}: la pantalla no puede explicar el numero de modulo`);
  }
});

test("las busquedas del modulo usan el campo compartido, no un input suelto", () => {
  assert.match(searchField, /type="search"/, "el campo de busqueda debe ser type=search");
  assert.match(searchField, /htmlFor=\{id\}/, "la etiqueta debe estar asociada al campo");
  assert.match(searchField, /Limpiar la b/, "el boton de limpiar necesita nombre accesible");
  assert.match(searchField, /aria-describedby/, "la ayuda del campo se anuncia con aria-describedby");
  const conLista = nombrePantalla.filter((nombre) => /const filtered = /.test(fuentes[nombre]));
  assert.ok(conLista.length >= 7, `se esperaban al menos 7 pantallas con filtro, hay ${conLista.length}`);
  for (const nombre of conLista) {
    assert.match(fuentes[nombre], /<SearchField/, `${nombre}: filtra una lista y debe usar SearchField`);
    assert.ok(!/placeholder="Buscar/.test(fuentes[nombre]), `${nombre}: quedo un placeholder de busqueda artesanal`);
  }
});

test("los textos que ve el cliente conservan la ortografia completa", () => {
  // No solo las pantallas: la vitrina publica, su ruta de aterrizaje, los graficos y los
  // primitivos del modulo tambien se leen aqui, porque es donde el dueno ve "Catalogo" o
  // "Envio a domicilio" sin tilde.
  const porArchivo = {
    ...fuentes,
    "cabecera-vitrina": rutaVitrina,
    "compartido": shared,
    "graficos": graficos,
    "vitrina": storefront,
  };
  const offenders = [];
  for (const nombre of Object.keys(porArchivo).sort()) {
    for (const texto of textosVisibles(porArchivo[nombre])) {
      const falta = esFalta(texto);
      if (falta) offenders.push(`${nombre}: [${falta[0]}] ${texto.slice(0, 120)}`);
    }
  }
  assert.ok(Object.keys(porArchivo).length >= 14, "el barrido perdio archivos del modulo");
  assert.deepEqual(offenders, [], `textos visibles sin tilde:\n${offenders.join("\n")}`);
  // El barrido no puede ser decorativo, ni tampoco voraz: se prueba con faltas escritas a mano
  // en las tres formas que vive el texto del modulo (etiqueta entre comillas, prosa en el arbol
  // JSX e interpolacion) y con dos cosas que NO son texto del usuario y no deben levantarlo.
  const conFalta = [
    '<ModalFrame title="Confirmar anulacion">',
    "<li>Campana vigente hasta {promo.end}</li>",
    "<p>{`${categories.length} categorias en movimiento`}</p>",
    '<Field label="Creditos vigentes" />',
    "const detalle = \"Aun no hay ventas\";",
  ];
  for (const muestra of conFalta) {
    const encontradas = textosVisibles(muestra).filter((t) => esFalta(t));
    assert.equal(encontradas.length, 1, `la prueba no atrapa la falta conocida: ${muestra}`);
  }
  const sinFalta = [
    "const [limite, setLimite] = useState(tamano);",
    'const [viewport, setViewport] = useState<"escritorio" | "movil">("escritorio");',
    'if (buyer.delivery === "envio") return "ok";',
  ];
  for (const muestra of sinFalta) {
    const encontradas = textosVisibles(muestra).filter((t) => esFalta(t));
    assert.deepEqual(encontradas, [], `la prueba levanta codigo, no prosa: ${muestra}`);
  }
});

test("el ventanado movil no se puede llamar despues del gate de permisos", () => {
  // Un hook despues de `if (blocked) return blocked` cambia el orden de hooks y React tira
  // la pantalla entera: es la falla que esta prueba impide que vuelva. La regla es por
  // componente, no por archivo: un hijo que no tiene gate puede ventanear donde quiera.
  assert.match(shared, /export function useVentana</, "useVentana debe salir de los primitivos compartidos");
  assert.match(shared, /\}, \[items\.length, tamano\]\);/, "la ventana se reinicia por longitud, no por identidad del arreglo");
  const conVentana = nombrePantalla.filter((nombre) => /useVentana\(/.test(fuentes[nombre]));
  assert.ok(conVentana.length >= 6, `se esperaban al menos 6 pantallas ventaneadas, hay ${conVentana.length}`);
  for (const nombre of conVentana) {
    for (const bloque of componentes(fuentes[nombre])) {
      if (!/useVentana\(/.test(bloque)) continue;
      const gate = bloque.indexOf("comercioGate(access)");
      assert.ok(gate === -1 || bloque.indexOf("useVentana(") < gate, `${nombre}: useVentana se llama despues del gate y rompe los hooks`);
      assert.match(bloque, /Ver \{ventana\.restantes\} [^<]*más/, `${nombre}: un componente ventaneado debe ofrecer ver el resto`);
    }
  }
});

test("las capas de la vitrina comparten el aro de accesibilidad", () => {
  assert.match(overlayHook, /event\.key === "Escape"/, "Escape debe cerrar la capa");
  assert.match(overlayHook, /document\.body\.style\.overflow = "hidden"/, "el fondo no se desplaza con la capa abierta");
  assert.match(overlayHook, /anterior\?\.focus\(\)/, "el foco vuelve al disparador al cerrar");
  assert.match(storefront, /import \{ useOverlayA11y \} from "@\/components\/ui\/useOverlayA11y"/, "la vitrina usa el hook compartido");
  assert.match(storefront, /const capaCarrito = useOverlayA11y<HTMLDivElement>\(cartOpen/, "el carrito esta amarrado al aro");
  assert.match(storefront, /const capa = useOverlayA11y<HTMLDivElement>\(true, onClose\)/, "la vista rapida esta amarrada al aro");
  assert.match(storefront, /ref=\{capaCarrito\}/, "la capa del carrito recibe el ref del aro");
  assert.match(storefront, /ref=\{capa\}/, "la vista rapida recibe el ref del aro");
  assert.doesNotMatch(storefront, /setCartOpen\(false\);\s*\n\s*setQuick\(null\);/, "el escape artesanal de la vitrina se jubilo");
  assert.ok(/aria-modal="true"/.test(storefront), "las capas de la vitrina se declaran modales");
  assert.match(storefront, /aria-label="Pedido"/, "el carrito se anuncia como Pedido");
  assert.match(storefront, /Detalle de \$\{item\.name\}/, "la vista rapida se anuncia con el nombre del producto");
});

test("las ventanas emergentes animan entrada y fondo, y el movimiento reducido las apaga", () => {
  assert.match(modalFrame, /apex-backdrop-enter/, "el velo del ModalFrame entra con animacion");
  assert.match(modalFrame, /apex-dialog-enter/, "el dialogo del ModalFrame entra con animacion");
  assert.match(css, /@keyframes apexBackdropEnter/, "la animacion del velo existe en la hoja");
  assert.match(css, /\.apex-backdrop-enter \{ animation: apexBackdropEnter/, "la clase del velo esta conectada");
  const bloque = /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/.exec(css)?.[0] || "";
  for (const clase of [".apex-page-enter", ".apex-dialog-enter", ".apex-backdrop-enter"]) {
    assert.ok(bloque.includes(clase), `movimiento reducido debe apagar ${clase}`);
    const despues = bloque.slice(bloque.indexOf(clase));
    assert.match(despues, /^[\s\S]{0,160}animation: none !important/, `${clase} debe quedar sin animacion con movimiento reducido`);
  }
});

test("los enlaces-accion usan la misma tinta y el mismo foco que los botones", () => {
  assert.match(button, /export function buttonClasses/, "debe existir una unica fuente de estilos de boton");
  assert.match(button, /className=\{buttonClasses\(variant, size, className\)\}/, "Button consume esa fuente");
  for (const nombre of nombrePantalla) {
    assert.doesNotMatch(fuentes[nombre], /border border-transparent bg-apex[^"]*text-white/, `${nombre}: copia los estilos del boton primario en vez de usar buttonClasses`);
  }
  assert.match(fuentes.promociones, /className=\{buttonClasses\("primary", "compact"\)\}/, "el envio por WhatsApp usa la fuente compartida");
});

test("las tablas declaran el encabezado de cada columna", () => {
  assert.match(dataTable, /scope="col"/, "SmartDataTable marca sus encabezados con scope=col");
  assert.ok((dataTable.match(/scope="col"/g) || []).length >= 2, "el encabezado de seleccion y el de cada columna llevan scope");
});

test("el centro de comandos no le roba el foco al dialogo cerrado con Escape", () => {
  // ModalFrame devuelve el foco al disparador al cerrar con Escape. El palette escuchaba el
  // teclazo aunque estuviera cerrado y, un tick despues, llevaba el foco a su propio boton de
  // la barra: el usuario quedaba arriba en vez del boton que habia pulsado.
  assert.match(palette, /if \(!open\) return;/, "el escuchador de Escape solo se monta con el palette abierto");
  assert.match(palette, /\}, \[open\]\);/, "y se desmonta al cerrar");
  const escuchadorCerrado = /const onKey[\s\S]*?\{(?:[^{}]|\{[^{}]*\})*\}/.exec(palette)?.[0] || "";
  assert.doesNotMatch(escuchadorCerrado, /Escape/, "el escuchador fijo del teclado no debe tocar Escape");
});

test("un selector tecleable abierto dentro de una capa sigue al scroll", () => {
  assert.match(combobox, /window\.addEventListener\("scroll", onMove, true\)/, "escucha en fase para captar el scroll de los di\u00e1logos");
  assert.match(combobox, /window\.removeEventListener\("scroll", onMove, true\)/, "y la quita al cerrar");
});

test("los blancos tactiles del modulo tienen el piso de WCAG 2.5.8", () => {
  // La cota dura es 24x24 CSS px. Los tres casos que la certificacion encontro en 390 px
  // quedan fijados aqui: la brujula, la casilla con etiqueta y el titulo de la tarjeta.
  const brujula = /<nav aria-label="Ubicaci\u00f3n en Comercio"[\s\S]*?<\/nav>/.exec(shared)?.[0] || "";
  assert.ok(brujula.length > 0, "la brujula debe existir en ModuleHeader");
  assert.match(brujula, /min-h-6/, "el enlace «Comercio» de la brujula debe medir 24 px de alto");
  assert.match(shared, /<label className="inline-flex min-h-6 items-center/, "la etiqueta de la casilla es el blanco real: debe llegar a 24 px");
  assert.match(storefront, /className="min-h-6 text-left text-sm font-medium leading-snug/, "el titulo de la tarjeta de la vitrina debe poder pulsarse en movil");
});

test("los niveles de tinta que llevan texto se certifican contra la cota AA", () => {
  // muted y faint pintan el precio de referencia, «Ref. P-0019», el contador del departamento
  // y el aviso legal del pie. Con el piso viejo (3,8) la vitrina reprobaba contraste y la
  // prueba de formula no lo veia porque no medía esos niveles: aqui quedan fijados los dos.
  const objetivos = /const INK_TARGETS = \{([^}]*)\}/.exec(theme)?.[1] || "";
  const leido = Object.fromEntries([...objetivos.matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.ok(leido.muted >= 4.5, `muted es texto que se lee: su objetivo debe ser >= 4.5, esta en ${leido.muted}`);
  assert.ok(leido.faint >= 4.5, `el microcopy del pie tambien se lee: debe ser >= 4.5, esta en ${leido.faint}`);
  assert.ok(leido.muted > leido.faint, "muted sigue siendo un escalon mas oscuro que faint: la jerarquia se conserva");
  assert.ok(leido.strong > leido.body && leido.body > leido.secondary && leido.secondary > leido.muted, "la rampa de tinta queda ordenada de mas a menos contraste");
});

test("el acento de marca viste el texto con su propia tinta, no con el color de pinta", () => {
  // text-apex (15 118 110) sobre blanco mide 5,4:1 y parece cumplirla, pero sobre su propio
  // tinte bg-apex/10 —la pestana activa, el chip de porcentaje, el numero de paso— baja a
  // 4,45:1 y suspende AA. El texto lleva text-apex-ink; el acento se conserva para pintar
  // bordes, rellenos, iconos y el cuadro de la casilla.
  const colores = {
    ":root": /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "",
    "claro contraste alto": /html\[data-contrast="high"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "",
    "oscuro contraste alto": /html\.dark\[data-contrast="high"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "",
    oscuro: /html\.dark \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ""
  };
  for (const [bloque, cuerpo] of Object.entries(colores)) {
    assert.match(cuerpo, /--color-apex-ink:/, `el bloque ${bloque} debe declarar su tinta de marca`);
  }
  assert.match(tailwind, /"apex-ink": "rgb\(var\(--color-apex-ink\) \/ <alpha-value>\)"/, "el color debe ser utilizable como text-apex-ink");

  const fuentesModulo = { ...fuentes, shared, storefront, charts: read("../app/dashboard/comercio/ComercioCharts.tsx") };
  for (const [nombre, fuente] of Object.entries(fuentesModulo)) {
    const candidatas = fuente
      .split("\n")
      // Un icono y el cuadro de una casilla no son texto: ahi el acento se queda.
      .filter((linea) => !/type="checkbox"/.test(linea) && !/<[A-Z]\w*\s+size=\{?\d+\}? className="text-apex"/.test(linea));
    const cruda = candidatas.filter((linea) => /(^|[\s"'`:{])text-apex(?![-\w])/.test(linea));
    assert.deepEqual(cruda, [], `${nombre} pinta TEXTO con el acento de pinta (text-apex); debe usar text-apex-ink`);
  }
});

test("los selectores cortos que quedan conservan el estilo de campo del sistema", () => {
  const conSelect = nombrePantalla.filter((nombre) => /<select\b/.test(fuentes[nombre]));
  for (const nombre of conSelect) {
    const trozos = fuentes[nombre].split(/<select\b/).slice(1);
    assert.equal(trozos.every((trozo) => /apex-select|TransportSearchSelect/.test(trozo.slice(0, 400))), true, `${nombre}: un <select> sin la clase apex-select se ve distinto del resto`);
  }
});
