// Contrato del boton «Descarga nuestra app» del lobby y su mini-guia de instalacion.
//
// Existe por tres defectos que este corte tiene que impedir, no describir:
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
  MOBILE_APP_FALLBACK_URL,
  handheldSignal,
  isHandheldDevice,
  mobileAppUrl
} from "../lib/mobileAppInstall.ts";

const root = path.resolve(import.meta.dirname, "..");
// Los fuentes del dashboard son CRLF: un regex multilinea sin normalizar sale verde sobre aire.
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const page = read("app/dashboard/page.tsx");
const band = read("components/lobby/AppInstallBand.tsx");

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
  assert.equal(mobileAppUrl("http://app.example.co"), MOBILE_APP_FALLBACK_URL, "un http en la configuracion no puede convertirse en el enlace del lobby");
  assert.equal(mobileAppUrl("no-es-una-url"), MOBILE_APP_FALLBACK_URL);
  assert.equal(mobileAppUrl(""), MOBILE_APP_FALLBACK_URL, "variable declarada vacia es variable sin configurar");
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
  const todo = JSON.stringify([APP_INSTALL_LABELS, INSTALL_STEPS]).toLowerCase();
  for (const sinTilde of ["configuracion", "contrasena", "instalacion", "enviate", "copialo", "numero", "telefono"]) {
    assert.equal(todo.includes(sinTilde), false, `la cadena visible perdio su tilde: ${sinTilde}`);
  }
});

test("el lobby monta la banda una sola vez, fuera del condicional de modulos", () => {
  assert.match(page, /import \{ AppInstallBand \} from "@\/components\/lobby\/AppInstallBand";/, "la banda entra por componente, no copiada en el lobby");
  assert.equal(page.split("<AppInstallBand />").length - 1, 1, "dos bandas serian dos botones de descarga en la misma pantalla");
  const vacio = page.indexOf("No tienes módulos habilitados");
  const banda = page.indexOf("<AppInstallBand />");
  assert.ok(vacio > 0 && banda > vacio, "la banda va despues del bloque de modulos");
  const tramo = page.slice(vacio, banda);
  assert.match(tramo, /<\/section>\}/, "contraste: la banda esta despues del cierre del ternario, o sea no depende de los modulos habilitados");
  assert.match(page.slice(banda), /<\/div>;/, "contraste: el corte sigue leyendo el cierre del lobby");
});

test("el hero del lobby sigue sin botones y la banda no reusa las clases del CTA retirado", () => {
  assert.doesNotMatch(page, /apex-lobby-cta-/, "el CTA del hero lo retiro el dueno: la banda no puede resucitar esa clase");
  assert.doesNotMatch(band, /apex-lobby-cta-/);
});

test("la banda pasa por ModalFrame y buttonClasses, sin hex ni ventanillas nativas", () => {
  assert.match(band, /from "@\/components\/ui\/ModalFrame"/);
  assert.match(band, /from "@\/components\/ui\/button"/);
  assert.match(band, /<ModalFrame\b/, "el dialogo flota por portal: un fixed dentro del lobby queda atrapado por .apex-page-enter");
  assert.match(band, /tone="brand"/, "las ventanas del panel comparten el marco de marca");
  const acciones = [...band.matchAll(/<(?:button|a)\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(acciones.length >= 3, `contraste: el barrido encontro ${acciones.length} acciones, se esperan al menos boton, enlace y copiado`);
  assert.equal(acciones.filter((tag) => /className=\{buttonClasses\(/.test(tag)).length, acciones.length, "toda accion toma las clases del helper: ninguna escribe su tinta a mano");
  assert.doesNotMatch(band, /#[0-9a-fA-F]{3,8}\b/, "ningun color literal: la tinta sale de los tokens");
  assert.doesNotMatch(band, /(?:\bwindow\.|\bglobalThis\.)(?:alert|confirm|prompt)\s*\(/, "un fallo del portapapeles se anuncia en el dialogo, no con una ventanilla");
  // Control de contraste del propio barrido: el regex debe ver una ventanilla cuando existe.
  assert.match("<button onClick={() => window.alert('x')}>", /(?:\bwindow\.|\bglobalThis\.)(?:alert|confirm|prompt)\s*\(/);
});

test("en el celular la accion primaria es el enlace a la app, en pestana nueva y sin exponer la ventana", () => {
  const footer = band.slice(band.indexOf("footer={handheld"), band.indexOf("icon={<Smartphone"));
  assert.ok(footer.length > 40, `contraste: el barrido del footer midio ${footer.length} caracteres, no esta leyendo la accion`);
  assert.match(footer, /handheld\s*\?\s*<a\b[\s\S]*:\s*<button/, "el enlace solo existe en la rama de celular y el boton de copiar solo en la de escritorio");
  const anchor = footer.match(/<a\b[^>]*>/g) || [];
  assert.equal(anchor.length, 1, "un segundo enlace a la app en escritorio es exactamente el callejon que el aviso quiere evitar");
  assert.match(anchor[0], /href=\{url\}/, "el destino sale de mobileAppUrl(), no de un literal");
  assert.match(anchor[0], /target="_blank"/);
  assert.match(anchor[0], /rel="noopener noreferrer"/);
  assert.doesNotMatch(band, /appapexos/, "la URL no se escribe en el JSX: vive en la libreria y en el respaldo de configuracion");
});

test("en computador la guia avisa la exclusividad, entrega el enlace y no deja al usuario sin el", () => {
  assert.match(band, /!handheld\s*\?\s*\([\s\S]*?APP_INSTALL_LABELS\.desktopNotice/, "el aviso vive en la rama de escritorio");
  assert.match(band, /role="note"/, "el aviso es contenido, no un alerta que interrumpe la lectura");
  assert.match(band, /setFeedback\(APP_INSTALL_LABELS\.copyBlocked\)/, "si el navegador no concede el portapapeles hay que decirlo, no callarlo");
  assert.match(band, />\{url\}<\/p>/, "el enlace queda escrito y seleccionable: copiar es el atajo, no la unica salida");
  assert.match(band, /aria-live="polite"[^>]*>\{feedback\}/, "el resultado del copiado se anuncia sin moverle la pantalla");
  assert.match(band, /navigator\.clipboard\.writeText\(url\)/);
});

test("la suite del lobby sigue leyendo el contrato heredado: nada de esto toca el hero ni los modulos", () => {
  assert.match(page, /Creamos sistemas/);
  assert.match(page, /Mis módulos/);
  assert.match(page, /PORTFOLIO_MODULES\.filter\(\(module\) => access\.bySlug\[module\.slug\] === true\)/);
  assert.match(page, /xl:grid-cols-4/);
});
