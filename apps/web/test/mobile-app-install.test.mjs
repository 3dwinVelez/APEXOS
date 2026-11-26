// Contrato del boton «Descarga nuestra app» del inicio de sesion y su mini-guia de instalacion.
//
// Existe por cuatro defectos que este corte tiene que impedir, no describir:
//  0. El 2026-11-25 el dueno corrigio la montura: la oferta de la app va en la pantalla con la que
//     un usuario de celular ya se cruza (el acceso), no dentro del tablero, adonde hay que tener
//     sesion y empresa para llegar. El arnes por eso mide dos cosas: que el acceso la monte UNA vez
//     fuera del formulario y que el tablero NO la monte.
//  1. Mandar a un usuario de computador a la app es mandarlo a un boton que no puede pulsar: el
//     servicio de la app (repo aparte `AppApexos`) ya responde «es exclusivo para celulares» y no
//     permite instalar. La guia tiene que decirlo ANTES del viaje, no despues.
//  2. La deteccion de dispositivo se escribe con `matchMedia("(pointer: coarse)")` o con el ancho
//     de la ventana y falla en dos direcciones: un portatil tactil no es un celular y un celular
//     con la ventana estrecha no es escritorio. Aqui se mide el agente del navegador, y la prueba
//     exige que la funcion devuelva VERDADERO y FALSO sobre el mismo conjunto (control de contraste).
//  3. El copy de los pasos y la URL son contrato de producto: si alguien reescribe «Instalar app»
//     por «Descargar», la certificacion de navegador deja de encontrar el boton y la guia ensena un
//     menu que ya no existe. Por eso el texto vive en la libreria y la prueba lo lee de alli.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  APP_INSTALL_LABELS,
  INSTALL_STEPS,
  MOBILE_APP_ADMIN_ENDPOINT,
  MOBILE_APP_ADMIN_LABELS,
  MOBILE_APP_FALLBACK_URL,
  MOBILE_APP_FETCH_TIMEOUT_MS,
  MOBILE_APP_PUBLIC_ENDPOINT,
  fetchConfiguredMobileAppUrl,
  handheldSignal,
  isHandheldDevice,
  mobileAppUrl
} from "../lib/mobileAppInstall.ts";

const root = path.resolve(import.meta.dirname, "..");
// Los fuentes del dashboard y del acceso son CRLF: un regex multilinea sin normalizar sale verde sobre aire.
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const lobby = read("app/dashboard/page.tsx");
const acceso = read("app/login/page.tsx");
const band = read("components/system/AppInstallBand.tsx");
const lib = read("lib/mobileAppInstall.ts");
const admin = read("app/dashboard/administracion/page.tsx");

const UAS = {
  android: { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A155G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36", maxTouchPoints: 5, platform: "Linux armv8l" },
  iphone: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", maxTouchPoints: 5, platform: "iPhone" },
  ipad: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", maxTouchPoints: 5, platform: "MacIntel" },
  windows: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", maxTouchPoints: 0, platform: "Win32" },
  windowsTactil: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", maxTouchPoints: 10, platform: "Win32" },
  macos: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", maxTouchPoints: 0, platform: "MacIntel" }
};

test("la URL de la app es https, sin barra final y cae al destino conocido si la configuracion esta torcida", () => {
  assert.equal(mobileAppUrl(undefined), MOBILE_APP_FALLBACK_URL);
  assert.match(MOBILE_APP_FALLBACK_URL, /^https:\/\/appapexos-production\.up\.railway\.app$/, "el destino quemado es el servicio de la app: si cambia, se cambia aqui y en docs/project/app-movil.md");
  assert.equal(mobileAppUrl("https://app.example.co/"), "https://app.example.co", "la barra final rompe el enlace al concatenar rutas");
  assert.equal(mobileAppUrl("http://app.example.co"), MOBILE_APP_FALLBACK_URL, "un http en la configuracion no puede convertirse en el enlace del acceso");
  assert.equal(mobileAppUrl("no-es-una-url"), MOBILE_APP_FALLBACK_URL);
  assert.equal(mobileAppUrl(""), MOBILE_APP_FALLBACK_URL, "variable declarada vacia es variable sin configurar");
  assert.equal(mobileAppUrl("http://localhost:3005"), "http://localhost:3005", "el http solo se admite en el propio puesto: es la misma regla que aplica el API al guardar");
});

test("la deteccion distingue celular, iPad y computador, y un portatil tactil sigue siendo computador", () => {
  assert.equal(isHandheldDevice(UAS.android), true, "Android con Chrome es el dispositivo donde se instala la app");
  assert.equal(isHandheldDevice(UAS.iphone), true);
  assert.equal(isHandheldDevice(UAS.ipad), true, "iPadOS 13+ se anuncia como MacIntel de escritorio: sin los puntos de contacto lo mandariamos al aviso de escritorio");
  assert.equal(isHandheldDevice(UAS.windows), false);
  assert.equal(isHandheldDevice(UAS.windowsTactil), false, "pantalla tactil en Windows no es un celular: el ancho y el touch no deciden");
  assert.equal(isHandheldDevice(UAS.macos), false, "MacIntel sin multitouch es escritorio: la excepcion de iPad no puede abrirse a todo Mac");
  // Control de contraste: una funcion que devolviera siempre lo mismo pasaria las seis de arriba.
  const resultados = Object.values(UAS).map(isHandheldDevice);
  assert.ok(resultados.includes(true) && resultados.includes(false), "la clasificacion no puede colapsar a un solo valor");
});

test("sin cristal tactil la guia nace del lado escritorio, dentro y fuera del navegador", () => {
  // Node 22 expone un `navigator` global (userAgent "Node.js/22"): el servidor de Next lo ve y aun
  // asi no puede clasificar como celular. Sin `navigator` tampoco se inventa una senal.
  const senal = handheldSignal();
  assert.equal(typeof senal.userAgent, "string");
  assert.equal(typeof senal.maxTouchPoints, "number");
  assert.equal(isHandheldDevice(senal), false, "el render del servidor no puede pintar la rama de celular y desalinear la hidratacion");

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  delete globalThis.navigator;
  try {
    assert.equal(typeof navigator, "undefined", "contraste: si el global no se borro, la rama sin navegador nunca se ejercito y el assert de abajo es verde por accidente");
    assert.deepEqual(handheldSignal(), { userAgent: "", maxTouchPoints: 0, platform: "" }, "sin navigator la senal es vacia, no adivinada");
    assert.equal(isHandheldDevice(handheldSignal()), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});

test("la guia ensena Chrome, los tres puntos, Instalar app y el acceso directo", () => {
  const copy = [...INSTALL_STEPS.map((step) => `${step.label} ${step.detail}`), APP_INSTALL_LABELS.guideTitle, APP_INSTALL_LABELS.installedHint].join(" ");
  assert.ok(INSTALL_STEPS.length >= 4, `la mini-guia tiene ${INSTALL_STEPS.length} pasos: hacen falta los cuatro del flujo de Chrome`);
  for (const needle of [/Chrome/, /tres puntos/, /Instalar app/, /acceso directo/i]) {
    assert.match(copy, needle, `el paso que falta o se reescribo: ${needle}`);
  }
  assert.equal(new Set(INSTALL_STEPS.map((step) => step.id)).size, INSTALL_STEPS.length, "dos pasos con el mismo id rompen la lista de React");
});

test("el boton del lobby se llama como el dueno lo pidio y la prosa visible conserva sus tildes", () => {
  assert.equal(APP_INSTALL_LABELS.bandAction, "Descarga nuestra app");
  assert.match(APP_INSTALL_LABELS.desktopNotice, /exclusiva para celulares/, "el aviso de escritorio nombra la restriccion real del servicio");
  const todo = JSON.stringify([APP_INSTALL_LABELS, MOBILE_APP_ADMIN_LABELS, INSTALL_STEPS]).toLowerCase();
  for (const sinTilde of ["configuracion", "contrasena", "instalacion", "enviate", "copialo", "numero", "telefono", "direccion", "movil", "quien", "ultima"]) {
    assert.equal(todo.includes(sinTilde), false, `la cadena visible perdio su tilde: ${sinTilde}`);
  }
});

test("la pantalla de acceso monta la banda una sola vez y fuera del formulario", () => {
  assert.match(acceso, /import \{ AppInstallBand \} from "@\/components\/system\/AppInstallBand";/, "la banda entra por componente, no copiada en el acceso");
  assert.equal(acceso.split("<AppInstallBand />").length - 1, 1, "dos bandas serian dos botones de descarga en la misma pantalla");
  const cierre = acceso.indexOf("</form>");
  const banda = acceso.indexOf("<AppInstallBand />");
  assert.ok(cierre > 0 && banda > cierre, "la banda va despues del cierre del formulario: dentro, su boton seria un intento de entrar");
  const columna = acceso.indexOf("apex-login-panel-stack");
  assert.ok(columna > 0 && columna < banda, "formulario y banda comparten la columna fija del panel de acceso");
  assert.match(acceso.slice(banda), /<\/div>\s*<\/div>\s*<\/section>/, "contraste: el corte sigue leyendo el cierre del panel, no se detuvo en el primer div");
});

test("el tablero deja de ofrecer la descarga: el boton vive antes de entrar", () => {
  assert.equal(lobby.split("AppInstallBand").length - 1, 0, "la banda se retiro del lobby por orden del dueno: un segundo montaje es exactamente el defecto que se esta corrigiendo");
  assert.doesNotMatch(lobby, /mobileAppInstall/, "el tablero no puede quedarse leyendo la libreria de la app por su cuenta");
  // Contraste: si el acceso tampoco la montara, el assert de arriba seria verde por ceguera y no por medida.
  assert.ok(acceso.includes("<AppInstallBand />"), "contraste: el acceso si monta la banda");
});

test("la banda se apila porque vive en la columna del acceso, no en un ancho de pagina", () => {
  assert.doesNotMatch(band, /sm:flex-row|sm:w-auto|sm:p-5/, "los breakpoints miden la ventana: en el panel de 28rem un row aplastaria el boton contra el titulo");
  assert.match(band, /buttonClasses\("primary", "touch", "w-full"\)/, "la accion ocupa el ancho de la columna y se pulsa con el pulgar");
});

test("el hero del lobby sigue sin botones y la banda no reusa las clases del CTA retirado", () => {
  assert.doesNotMatch(lobby, /apex-lobby-cta-/, "el CTA del hero lo retiro el dueno: la banda no puede resucitar esa clase");
  assert.doesNotMatch(band, /apex-lobby-cta-/);
});

test("la banda pasa por ModalFrame y buttonClasses, sin hex ni ventanillas nativas", () => {
  assert.match(band, /from "@\/components\/ui\/ModalFrame"/);
  assert.match(band, /from "@\/components\/ui\/button"/);
  assert.match(band, /<ModalFrame\b/, "el dialogo flota por portal: un fixed dentro del lobby queda atrapado por .apex-page-enter");
  assert.match(band, /tone="brand"/, "las ventanas del panel comparten el marco de marca");
  const acciones = [...band.matchAll(/<(?:button|a)\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(acciones.length >= 2, `contraste: el barrido encontro ${acciones.length} acciones, se esperan el boton de la banda y el enlace directo de la guia`);
  assert.equal(acciones.filter((tag) => /className=\{buttonClasses\(/.test(tag)).length, acciones.length, "toda accion toma las clases del helper: ninguna escribe su tinta a mano");
  assert.doesNotMatch(band, /#[0-9a-fA-F]{3,8}\b/, "ningun color literal: la tinta sale de los tokens");
  assert.doesNotMatch(band, /(?:\bwindow\.|\bglobalThis\.)(?:alert|confirm|prompt)\s*\(/, "un fallo del portapapeles se anuncia en el dialogo, no con una ventanilla");
  // Control de contraste del propio barrido: el regex debe ver una ventanilla cuando existe.
  assert.match("<button onClick={() => window.alert('x')}>", /(?:\bwindow\.|\bglobalThis\.)(?:alert|confirm|prompt)\s*\(/);
});

test("la accion de la guia es un enlace directo a la app, en celular y en computador", () => {
  const footer = band.slice(band.indexOf("footer={"), band.indexOf("icon={<Smartphone"));
  assert.ok(footer.length > 40, `contraste: el barrido del footer midio ${footer.length} caracteres, no esta leyendo la accion`);
  assert.doesNotMatch(footer, /handheld/, "la accion directa no puede volver a ramificarse por dispositivo: el dueno pidio un boton que lleve a la URL");
  assert.match(footer, /<a\b/, "la accion de la guia es un enlace, no un boton con manejador");
  assert.equal((footer.match(/<button/g) || []).length, 0, "no queda boton de copiar: el portapapeles salio de la pantalla");
  const anchor = footer.match(/<a\b[^>]*>/g) || [];
  assert.equal(anchor.length, 1, "una sola accion directa en la guia, no dos rutas al mismo destino");
  assert.match(anchor[0], /href=\{url\}/, "el destino sale del valor administrado, no de un literal");
  assert.match(anchor[0], /target="_blank"/);
  assert.match(anchor[0], /rel="noopener noreferrer"/);
  assert.match(footer, />\{APP_INSTALL_LABELS\.openApp\}<\/a>/, "el rotulo dice abrir: no ofrece copiar lo que lleva directo");
  assert.doesNotMatch(band, /appapexos/, "la URL no se escribe en el JSX: vive en la libreria y en el respaldo de configuracion");
});

test("en computador la guia avisa la exclusividad y entrega el enlace escrito, sin portapapeles", () => {
  assert.match(band, /!handheld\s*\?\s*\([\s\S]*?APP_INSTALL_LABELS\.desktopNotice/, "el aviso vive en la rama de escritorio");
  assert.match(band, /role="note"/, "el aviso es contenido, no un alerta que interrumpe la lectura");
  assert.match(band, />\{url\}<\/p>/, "el enlace queda escrito y seleccionable: es el respaldo cuando la pestana no sirve");
  assert.doesNotMatch(band, /navigator\.clipboard|copyLink|setFeedback/, "el portapapeles salio del contrato: la accion es abrir");
  assert.doesNotMatch(band, /APP_INSTALL_LABELS\.(copyLink|copied|copyBlocked)/, "ningun rotulo de copiado puede seguir vivo en la pantalla");
  assert.doesNotMatch(lib, /copyLink:|copied:|copyBlocked:/, "las cadenas de copiado se retiran de la libreria, no se dejan huecas");
  // Contraste: el barrido ve el portapapeles cuando existe, si no el verde seria por ceguera.
  assert.match("<button onClick={() => navigator.clipboard.writeText(u)}>abrir</button>", /navigator\.clipboard/);
});

test("el tablero conserva el contrato heredado y el acceso conserva su formulario", () => {
  assert.match(lobby, /Creamos sistemas/);
  assert.match(lobby, /Mis módulos/);
  assert.match(lobby, /PORTFOLIO_MODULES\.filter\(\(module\) => access\.bySlug\[module\.slug\] === true\)/);
  assert.match(lobby, /xl:grid-cols-4/);
  // Contraste: si el acceso se reescribiera entero, el corte `</form>` del montaje no significaria nada.
  assert.match(acceso, /onSubmit=\{submit\}/);
  assert.match(acceso, /Entrar de forma segura/);
});

test("el enlace administrado se lee sin sesion, se escribe por administracion y se agota rapido", () => {
  assert.equal(MOBILE_APP_PUBLIC_ENDPOINT, "/api/v1/public/platform/mobile-app", "el acceso es previo a la sesion: la lectura no puede vivir detras del authenticate");
  assert.equal(MOBILE_APP_ADMIN_ENDPOINT, "/api/v1/admin/platform/mobile-app", "la escritura y la lectura con ambiente van por el area de administracion");
  assert.ok(!MOBILE_APP_PUBLIC_ENDPOINT.includes("/admin/"), "el endpoint publico no puede apuntar al de escritura");
  assert.ok(MOBILE_APP_FETCH_TIMEOUT_MS <= 2000, `la lectura admite ${MOBILE_APP_FETCH_TIMEOUT_MS} ms: el acceso no puede esperar a la API para pintar su boton`);
});

test("el valor administrado manda y cualquier respuesta torcida cae al respaldo del ambiente", async () => {
  const previo = process.env.NEXT_PUBLIC_MOBILE_APP_URL;
  process.env.NEXT_PUBLIC_MOBILE_APP_URL = "https://respaldo.test";
  try {
    const fetcher = ({ body, ok = true }) => async (input, init) => {
      assert.equal(input, MOBILE_APP_PUBLIC_ENDPOINT, "el acceso pregunta por el endpoint publico, no por el de administracion");
      assert.ok(init?.signal instanceof AbortSignal, "la lectura tiene senal de cancelacion: sin ella un viaje lento congela el acceso");
      assert.equal(init?.cache, "no-store", "el enlace se administra por ambiente: una respuesta cacheada mostraria el destino de otro ambiente");
      return { ok, status: ok ? 200 : 500, json: async () => body };
    };
    assert.equal(await fetchConfiguredMobileAppUrl(fetcher({ body: { url: "https://app.example.co/" } })), "https://app.example.co", "el valor guardado es el destino del boton");
    assert.notEqual(await fetchConfiguredMobileAppUrl(fetcher({ body: { url: "https://ganador.test" } })), "https://respaldo.test", "contraste: si el respaldo ganara siempre, administrar no cambiaria nada");
    assert.equal(await fetchConfiguredMobileAppUrl(fetcher({ body: { url: "http://inseguro.test" } })), "https://respaldo.test", "un http administrado no puede reemplazar el respaldo");
    assert.equal(await fetchConfiguredMobileAppUrl(fetcher({ body: {} })), "https://respaldo.test", "respuesta sin URL no deja el boton sin destino");
    assert.equal(await fetchConfiguredMobileAppUrl(fetcher({ body: { url: "https://x.test" }, ok: false })), "https://respaldo.test", "un 500 de la plataforma pinta el acceso con el respaldo");
    assert.equal(await fetchConfiguredMobileAppUrl(undefined), "https://respaldo.test", "sin fetch no hay lectura: sigue habiendo boton");
  } finally {
    if (previo === undefined) delete process.env.NEXT_PUBLIC_MOBILE_APP_URL;
    else process.env.NEXT_PUBLIC_MOBILE_APP_URL = previo;
  }
});

test("una lectura lenta o que revienta no deja el acceso colgado", async () => {
  const previo = process.env.NEXT_PUBLIC_MOBILE_APP_URL;
  process.env.NEXT_PUBLIC_MOBILE_APP_URL = "https://respaldo.test";
  try {
    const inicio = Date.now();
    const colgando = await fetchConfiguredMobileAppUrl((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("cancelado por el acceso")));
    }));
    const espera = Date.now() - inicio;
    assert.equal(colgando, "https://respaldo.test", "la promesa que no resuelve se cancela y el boton usa el respaldo");
    assert.ok(espera >= MOBILE_APP_FETCH_TIMEOUT_MS - 100, `se corto a los ${espera} ms: el presupuesto de ${MOBILE_APP_FETCH_TIMEOUT_MS} ms no se cumple`);
    assert.ok(espera < MOBILE_APP_FETCH_TIMEOUT_MS + 2000, `se corto a los ${espera} ms: el acceso se quedo esperando mas de lo declarado`);
    assert.equal(await fetchConfiguredMobileAppUrl(async () => { throw new Error("red caída"); }), "https://respaldo.test", "una red que tira también cae al respaldo");
  } finally {
    if (previo === undefined) delete process.env.NEXT_PUBLIC_MOBILE_APP_URL;
    else process.env.NEXT_PUBLIC_MOBILE_APP_URL = previo;
  }
});

test("la banda arranca con el respaldo y toma el enlace administrado cuando responde la plataforma", () => {
  assert.match(band, /fetchConfiguredMobileAppUrl/, "la banda pregunta a la plataforma: quemar el destino es lo que se esta corrigiendo");
  assert.match(band, /useState\(\(\) => mobileAppUrl\(\)\)/, "el boton nace con el respaldo del ambiente: nunca se pinta sin destino mientras llega la lectura");
  assert.match(band, /if \(alive\) setUrl\(configured\)/, "la respuesta puede llegar despues del desmonte: sin el guard, React avisa y el estado se escribe fuera de la pantalla");
  assert.match(band, /url=\{url\}/, "la guia recibe el valor leido, no lo recalcula por su cuenta");
  assert.doesNotMatch(band, /NEXT_PUBLIC_MOBILE_APP_URL/, "la variable no se lee en el componente: vive en mobileAppUrl()");
  assert.doesNotMatch(band, /MOBILE_APP_ADMIN_ENDPOINT/, "el acceso no puede llamar al endpoint de administracion: no hay sesion todavia");
});

test("el administrador de configuracion monta el apartado del enlace y escribe por el endpoint de administracion", () => {
  assert.match(admin, /import \{[^}]*MOBILE_APP_ADMIN_ENDPOINT[^}]*\} from "@\/lib\/mobileAppInstall";/, "la pantalla importa el contrato de la libreria, no reescribe la ruta");
  assert.match(admin, /key: "app-movil"[^\n]*modal: "app-movil"/, "el apartado vive dentro del catalogo de configuracion de APEXOS, no en una pantalla nueva");
  assert.match(admin, /if \(item\.key === "app-movil"\) void loadMobileAppConfig\(\);/, "abrir el apartado lee el valor del servidor");
  assert.match(admin, /method: "PUT", body: JSON\.stringify\(\{ url: candidate \}\)/, "guardar escribe el enlace completo, no un trozo");
  assert.doesNotMatch(admin, /MOBILE_APP_PUBLIC_ENDPOINT/, "el administrador no lee por el endpoint publico: necesita el ambiente y la trazabilidad");
  assert.match(admin, /mobileAppConfig\?\.environment/, "el ambiente lo declara el servidor: el navegador no puede inferirlo");
  assert.match(admin, /MOBILE_APP_ADMIN_LABELS\.scopeNotice/, "el alcance por ambiente se lee antes de guardar");
});

test("la ventana del enlace no escribe su destino, no usa ventanillas nativas y deja ver el ambiente", () => {
  const desde = admin.indexOf('{activeModal === "app-movil"');
  const hasta = admin.indexOf('{activeModal === "users"');
  assert.ok(desde > 0 && hasta > desde, "contraste: el corte de la ventana del enlace se tomo, no se midio aire");
  const ventana = admin.slice(desde, hasta);
  assert.match(ventana, /<ModalFrame\b/, "el dialogo flota por portal como las demas ventanas del panel");
  assert.match(ventana, /type="url"/, "el campo valida formato de direccion antes de enviar");
  assert.match(ventana, /value=\{mobileAppDraft\}/);
  assert.match(ventana, /onChange=\{\(event\) => setMobileAppDraft\(event\.target\.value\)\}/, "lo escrito en pantalla es lo que se guarda: sin el control el usuario edita a ciegas");
  assert.match(ventana, /saveMobileAppLink\(MOBILE_APP_FALLBACK_URL\)/, "restaurar escribe el respaldo en la plataforma, no borra la fila a escondidas");
  assert.match(ventana, /mobileAppConfig\?\.updated_at/, "la ventana dice cuando se movio el enlace");
  assert.match(ventana, /MOBILE_APP_ADMIN_LABELS\.updatedBy/, "la ventana tiene que decir QUIEN lo movio: un cambio sin autor no es trazable");
  assert.match(ventana, /mobileAppConfig\?\.updated_by \|\| MOBILE_APP_ADMIN_LABELS\.never/, "contraste: sin cambios todavia se dice en voz alta, no se deja el campo en blanco");
  assert.match(ventana, /mobileAppConfig\?\.source === "base"/, "la ventana distingue el valor administrado del destino quemado");
  assert.doesNotMatch(ventana, /appapexos/, "el respaldo no se escribe en la pantalla: vive en la libreria");
  assert.doesNotMatch(ventana, /(?:\bwindow\.|\bglobalThis\.)(?:alert|confirm|prompt)\s*\(/, "el resultado del guardado se anuncia en el aviso de catalogo");
  assert.doesNotMatch(ventana, /localStorage/, "el enlace no se guarda en el navegador: se guarda en la plataforma");
});
