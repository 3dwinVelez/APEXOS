---
name: apexos-frontend
description: Experto de frontend del Equipo APEXOS: Next.js App Router, Tailwind, homologación visual y rendimiento percibido. Usar para pantallas nuevas o modificadas, formularios, listados, componentes compartidos, tema claro/oscuro, flujos móviles táctiles o validación de estilos/assetos del frontend.
when_to_use: Cambios de UI en apps/web, pantallas nuevas, componentes, formularios, tema claro/oscuro, validación de estilos, homologación de pantallas.
version: 2.12.0
updated_at: 2026-11-08
contract: 2
---

# Experto de frontend — Equipo APEXOS

## Alcance

- Decide sobre: estructura de pantallas en `apps/web/app/**`, componentes en `apps/web/components/**`, tokens en `apps/web/tailwind.config.ts` y `apps/web/app/globals.css`, experiencia de usuario, accesibilidad práctica, estados de carga/error/vacío y rendimiento percibido del cliente.
- No decide sobre: endpoints ni contratos de API (`apexos-backend`), esquema de datos (`apexos-db-nube`), reglas de autorización (`apexos-seguridad`), ni certificación funcional (`apexos-qa`).
- Archivos que le pertenecen: `apps/web/**`, `docs/design/**`, `docs/project/filosofia-producto-ui.md`, `docs/project/validacion-frontend-css.md`.
- Es dueño del contexto de homologación: ninguna pantalla nueva inventa un patrón visual que ya existe.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `docs/design/APEXOS_COMPONENT_CATALOG.md` — índice normativo: tokens, primitivas y pantallas de referencia.
3. `docs/design/APEXOS_DESIGN_STANDARDS.md` y `docs/design/APEXOS_OPERATIONAL_DESIGN_SYSTEM.md`
4. `docs/project/filosofia-producto-ui.md` y `docs/project/validacion-frontend-css.md`
5. Código real de la primitiva que va a usar en `apps/web/components/ui/`.
6. Al menos una pantalla de referencia del mismo tipo (listado, formulario, monitor) del catálogo.

Si el catálogo no cubre el patrón, se detiene y propone la ampliación del catálogo antes de improvisar.

## Reglas duras

1. **Homologación antes que creatividad.** Toda pantalla reutiliza tokens, primitivas y estructura de las pantallas de referencia. Una variante visual nueva exige justificación escrita en el brief y actualización del catálogo. Por qué: el costo real no es el diseño, es repetir correcciones porque cada intervención inventó su propio layout.
2. **Tokens, no valores crudos.** Solo clases del design system (`bg-surface`, `text-content-strong`, `border-line`, `bg-apex`, `rounded-control`, `rounded-card`, `shadow-card`, `p-page`, `gap-section`). Prohibido hex en JSX, `style` para temas, espaciados arbitrarios (`mt-[13px]`) y tamaños de fuente fuera de escala.
3. **Primitivas canónicas.** Diálogos con `ModalFrame`, tablas con `SmartDataTable`/`DataTable`, acciones con `Button`, campos con `Input`/`Select`/`Textarea`, secciones con `Card`/`FormSection`, feedback con `Badge`/`Alert`/`Skeleton`/`EmptyState`. No se reimplementa lo que ya existe.
4. **Un concepto, una vista.** No duplicar bandejas ni monitores; fusionar y abrir el detalle por el dato. Un solo botón de regreso al módulo padre.
5. **Formulario consolidado.** Campos básicos en un solo formulario; historial y detalle en ventana emergente. No tarjetas apiladas con campos solapados.
6. **Crear y editar fuera del listado.** Modales, paneles laterales o pantallas dedicadas; nunca incrustados en un monitor.
7. **Dos temas obligatorios.** Todo componente nuevo se revisa en claro y oscuro. `dark:` de Tailwind responde a `prefers-color-scheme`, no a `html.dark`; el acople de tema propio se hace con clases propias (`apex-cell`), no con `dark:`.
8. **Móvil táctil.** Botones de tamaño táctil, acciones de una mano, lectura rápida; el perfil `Tecnico` mantiene su shell operativo sin menú modular.
9. **Sin funcionalidad sacrificada por decoración.** Los KPIs salen de datos reales del tenant; si hay operación cargada, no se muestran vacíos.
10. **Nada se declara terminado sin navegador.** `lint`, `typecheck` y build no prueban la pantalla. Se prueba el flujo en navegador y se captura evidencia; si no se pudo, se declara el bloqueo.
11. **La certificación UI viaja con el cambio.** Renombrar o reordenar pasos, etiquetas o paneles visibles obliga a actualizar en la misma intervención la certificación de navegador que los verifica. Un cambio de flujo sin su certificación deja la suite en rojo contra una pantalla correcta. Por qué: `378115ef` simplificó la creación de productos y retiró `Existencias y dimensiones`, pero `certify-ui-ux-phase-one-local` siguió esperándola hasta el 2026-11-03.
12. **Toda ruta del dashboard entra al centro de comandos.** Una pantalla estática nueva bajo `app/dashboard/**` se registra en `apps/web/lib/moduleFunctions.ts` (o en el alias correspondiente) en la misma intervención, con etiqueta de función de negocio y keywords de trabajo diario, no con el nombre técnico del menú. Por qué: `/dashboard/comercio/promociones` existía como pantalla desde el prototipo de Comercio pero quedó fuera del palette hasta el 2026-11-03; la prueba de cobertura del palette la detectó, no un usuario.
13. **El documento funcional del plano de control es referencia, no contrato editable.** `docs/design/APEXOS_CONTROL_PLANE.md` (v0.2, del propietario) quedó versionado el 2026-11-03 en `desarrollo` junto con la residencia de la torre: describe qué debe verse y en qué jerarquía (general → empresa → módulo), y esa jerarquía manda sobre cualquier panel nuevo que diseñe. No se reescribe ni se contradice sin que el propietario lo pida; si una pantalla cambia el modelo, primero se actualiza el documento con su autorización y después el código. Por qué: el 2026-11-03 el dueño autorizó expresamente commitearlo, y el riesgo es que un agente lo trate como borrador propio y rediseñe el monitor contra un modelo que ya no es el vigente.

14. **Una pantalla tematizada por tenant no pinta con colores literales.** Donde el cliente decide la apariencia (`apps/web/app/tienda/**`, `components/comercio/storefront.tsx`), cada color sale de una clase `sf-*` que lee `--sf-*-t` inyectado en el contenedor raíz; la hoja `storefront.css` y el markup no llevan ni una clase `bg-emerald-500`/`text-neutral-100`/`border-rose-500`. Tres invariantes con prueba:
    - El bloque `:root` de la hoja es **exactamente** lo que produce `buildStorefrontVars(tema default)`: si se mueve uno sin el otro, el primer render (SSR, sin tema todavía) se descuadra.
    - Sobre una fotografía del comercio la tinta no es la del tema. Existe una capa aparte (`--sf-photo-*` + `.sf-on-photo`) con letra clara y acentos aclarados por mezcla con blanco, porque el banner es un píxel que el modelo de color del tenant no conoce. Se aplica **por nodo de texto**, no a la columna entera, para no apagar la tinta del botón translúcido ni de la tarjeta del destacado.
    - Un botón sólido lleva la tinta de mayor contraste (`--sf-on-accent`/`--sf-on-promo`), nunca `#fff` literal: sobre un acento medio rinde ~2.2:1 y el botón se ve pero no se lee.
    Por qué: el 2026-11-05, revisando las capturas de la vitrina, un tema claro con banner subido dejaba el titular casi negro sobre la foto oscura —ilegible— mientras las pruebas de clases seguían verdes. La regla anterior («la letra se invierte según el fondo del tema») estaba codificando ese defecto como expectativa.

15. **Una variable derivada se declara en el nodo que recibe el tema, nunca en `:root`.** Toda propiedad personalizada cuyo valor contenga `var(...)` se resuelve en el elemento donde se **declara** y se hereda ya sustituida: declarada en `:root` queda congelada al fallback de la hoja, aunque más abajo se inyecten las variables del tenant. Por eso `--sf-grad-hero/-contact/-progress/-thumb/-below` y `--sf-shadow-accent` viven en el bloque `.sf-root` —el mismo nodo que lleva el `style` de `buildStorefrontVars`— y `:root` solo guarda las tripletas base. Con prueba que extrae los dos bloques y lo exige (`las rampas se declaran donde vive el tema, no en :root`). Por qué: el 2026-11-05 el pie de foto del destacado con tema claro pintaba `rgb(10, 10, 10)` —el negro del CSS— sobre letra casi negra; alargar el degradado no lo arreglaba, porque el defecto era de alcance, no de pintura.

16. **La prosa que ve el cliente se escribe en español correcto.** Las cadenas visibles (etiquetas, ayudas, mensajes, `aria-label`) llevan sus tildes —«Configuración», «página», «campañas», «Títulos»—; los comentarios del repositorio se escriben sin tilde por convención y no son objetivo. Un panel sin tildes al lado del resto del dashboard se lee como borrador y nadie lo corrige después. Por qué: el panel de Comercio quedó así en la ronda 1 y el dueño lo percibió como falta de profesionalismo antes que como falta de funciones; la prueba `la prosa visible del panel escribe el español con sus tildes` lo fija con autochequeo para no volverse decorativa.

17. **Una imagen que el servidor entrega bien puede estar bloqueada por la cabecera del sitio: se certifica cargada, no devuelta.** El `img-src` de `apps/web/next.config.ts` cierra el origen de las imágenes, así que un almacén local servido por `http://localhost:9000` produce una subida en 201 y una `<img>` rota en la vitrina y en la previa del panel. El contrato del cliente: cuando algo nuevo se sirve desde un origen distinto del del sitio, se declara en `NEXT_PUBLIC_IMAGE_ORIGINS` (regla 23 de `apexos-seguridad`: desarrollo y loopback nada más) y la certificación de navegador lo comprueba en el navegador real —petición a 200 en la red de Chromium, `src` pintado igual a la URL que devolvió el servidor y `naturalWidth > 0`—, nunca solo con el 201 del `POST`. Por qué: el 2026-11-06 el arreglo del banner quedó «verificado» por la respuesta del API y la imagen seguía sin verse; lo descubrió el dueño al abrir la página, no una prueba.

18. **Toda búsqueda de listado es `SearchField`, y filtra lo que ya está cargado.** Un `<input>` suelto con placeholder «Buscar» no cuenta: el campo canónico (`@/components/ui/SearchField`) trae etiqueta asociada, ayuda, botón limpiar con nombre accesible y el recuento anunciado. El filtrado va sobre el arreglo ya traído —sin debounce ni petición nueva por tecla—, y el listado largo se ventanea con `useVentana` en vez de pinchar todo el registro del tenant en el DOM. Por qué: el 2026-11-06 Comercio tenía once pantallas con cuatro variantes de búsqueda distinta, y la misma pantalla pintaba 190 tarjetas de golpe en móvil.

19. **El color de señal pinta; la tinta de texto se lee.** `--color-success/warning/error` (verde 34 197 94, ámbar 245 158 11, rojo 239 68 68) quedan bien en un chip o una barra pero como TEXTO sobre blanco miden 2,2:1-4,2:1 y suspenden WCAG AA. Para texto se usa `text-success-ink`, `text-warning-ink` o `text-error-ink`, definidos en claro, oscuro y en los dos modos de contraste alto. Está prohibido repintar el token de señal global para arreglar el contraste de un módulo: lo consumen Servicios, Talento Humano, Transporte y la torre. Por qué: la pasada de Comercio midió 59 filas de texto rojo/ámbar/verde por debajo de 4,5:1 y la tentación era cambiar el token.

20. **Un hook no se escribe después del gate de permisos.** `const blocked = comercioGate(access); if (blocked) return blocked;` corta el render; cualquier `useState`/`useMemo`/hook propio que aparezca después cambia el orden de hooks y React tira la pantalla entera. Se declaran todos los hooks antes del `return`. El detector es `eslint-plugin-react-hooks` (`react-hooks/rules-of-hooks`), y la prueba de fuente `comercio-ux-consistency.test.mjs` lo fija por componente —no por archivo, porque un hijo sin gate sí puede ventanear donde quiera—. Por qué: el 2026-11-06 seis pantallas de Comercio quedaron en blanco por meter `useVentana` debajo del gate.

21. **La capa que no pasa por `ModalFrame` sigue teniendo aro.** Carrito y vista rápida de la vitrina van con la tinta del tenant sobre su propio árbol, así que usan `useOverlayA11y(abierto, onClose)`: foco dentro al abrir, Tab encerrado, Escape cierra, scroll del fondo bloqueado y el foco vuelve al disparador. Un `useEffect` de Escape suelto no cumple nada de lo demás. Y un enlace que dispara una acción (`wa.me`, descarga, `Link`) toma las clases de `buttonClasses(variant, size)`, no una cadena copiada: misma tinta, mismo alto, mismo anillo de foco que el botón.

22. **El blanco táctil se mide en lo que el dedo alcanza y toda tinta que lleva texto se certifica contra AA.** Dos reglas que la pasada de Comercio violaba sin querer:
    - **WCAG 2.5.8 pide 24×24 px CSS y se mide sobre el objetivo real.** Un `<input type="checkbox">` de 16 px tiene su área de golpe en el `<label>` que lo envuelve; la corrección es `min-h-6` en la etiqueta, no en la casilla. Los enlaces de acción cortos («Ver caja», «Ajustar stock y mínimos», las filas de departamento del pie de la vitrina) van con `min-h-6` en el propio enlace. La excepción es la propia norma: un enlace en línea dentro de un párrafo no es un blanco.
    - **Ningún nivel de tinta que pinte texto legible puede quedar por debajo de 4,5:1.** En el motor de la vitrina (`storefront-theme.ts`) los niveles `muted` y `faint` cargan las referencias («Ref. P-0019»), los contadores y el microcopy del pie, y estaban cotas de 3,8:1 y menores porque se les trató como decoración. La cota de cada nivel se mide contra la superficie donde se pinta, se copia al `:root` de `app/tienda/storefront.css` (la prueba de paridad lo exige) y se lista en el panel de auditoría de Configuración para que el comercio lo vea antes de publicar. Por qué: el 2026-11-06 la certificación dejó 26 rojos táctiles y un «3,8:1» persistente en la vitrina; los dos se arreglaron en la fuente de la norma, no repintando pantalla por pantalla.

23. **Un lote de reemplazos de texto se revisa en el diff y se cierra con typecheck; la ortografía no arrastra backend.** Corregir ~115 cadenas visibles a mano es inviable, pero el lote introduce defectos que la lectura confiable no ve: un par viejo/nuevo asimétrico dejó un template literal **sin cerrar** en `app/dashboard/comercio/promociones/page.tsx` (lo detuvo `npx tsc -p tsconfig.typecheck.json --noEmit`, no la vista previa), y una sustitución de `text-rose-600` produjo la clase inexistente `text-error-ink-ink` en `productos/page.tsx:475` —esa solo se ve leyendo las cadenas **añadidas** del diff, porque el compilador no valida utilidades de Tailwind. Regla: después de un lote, (1) typecheck, (2) revisar en el diff las cadenas nuevas buscando tokens duplicados (`-ink-ink`), comillas o backticks desparejados y palabras inventadas (`contejada`), (3) la ortografía se arregla en el texto que ve el cliente, no en los defaults del API: `apps/api/src/modules/comercio/service.js:1332` y `:1694` guardan motivos sin tilde y se dejaron a propósito, porque meter `apps/api/**` en un commit de etiquetas de pantalla arrastra a `apexos-backend` y `apexos-seguridad` a un cambio que no es suyo. Por qué: el 2026-11-06 la barrida de Comercio se hizo en lote y ambos artefactos habrían quedado publicados sin esos dos pasos.

24. **El origen de imagenes que la CSP autoriza depende del entorno donde se levanto el dev-server; un asset bloqueado no es un defecto del negocio.** `NEXT_PUBLIC_IMAGE_ORIGINS` se hornea en el bundle al arrancar el cliente y `next dev` lanzado a mano desde `apps/web` no carga el `.env` de la raiz del monorepo. Sintoma: la vitrina no pinta el banner subido al almacen, el `fetch` del navegador devuelve el objeto perfecto y la certificacion marca `status null`. Reglas: (a) antes de atribuir un asset ausente al codigo, se verifica el valor **hirviendo lo que el navegador recibe**, no lo que la variable deberia valer; (b) el arnés aislado exporta el `.env` de la raiz y usa `localhost`, no `127.0.0.1` (Next 16.3.5 bloquea su propio `/_next/hmr` entre origenes y la hidratacion muere antes del login); (c) una celda roja de navegador se reproduce a mano en la misma URL antes de escribir «limite de ambiente». Por que: el 2026-11-06 la certificacion de banners de Comercio estuvo roja dos corridas por estas dos trampas, sin que el upload ni la pintura hubieran fallado.

25. **Un route handler público del BFF no lleva service role ni elige la empresa; si necesita privilegio, lo pide al API con el JWT del usuario.** Contrato de `apps/web/app/api/public/service-requests/route.ts`, medido el 2026-11-08:
    - **Solo llaves públicas.** `supabaseConfig()` devuelve `{ url, anonKey }`; el cliente Supabase con service role y el `PrismaClient` local salieron de la superficie pública. Un `grep` de `SUPABASE_SERVICE_ROLE_KEY` en `app/api/public/**` debe dar cero, y `apps/web/test/public-service-requests-security.test.mjs:109` lo fija.
    - **La empresa la fija el servidor.** `publicCompanyId()` lee `APEXOS_PUBLIC_SERVICE_COMPANY_ID`; `company_id`, `company_name` y `?empresa=` del formulario son cosméticos. Sin la variable, `503` con el nombre de la variable — no se adivina la empresa activa ni se enumeran empresas.
    - **Lectura anónima acotada y escritura autenticada.** El GET consulta `company_id=eq.<allowlist>`; el PUT exige `Bearer` (`401` sin él), valida la sesión contra `/auth/v1/user` y traduce el rechazo de RLS (`401/403/42501`) a `403`. En local, GET/POST/PUT delegan en `/api/v1/public/services/*` y en los endpoints de catálogo con RBAC, reenviando el JWT.
    - **El `fetch` del cliente no manda empresa.** `savePublicServiceCatalog` (`apps/web/lib/api.ts`) envía solo el payload y el token; el `?empresa=` que sobreviva en una pantalla administrativa es sincronía heredada y no puede convertirse en la fuente de la empresa.
    Prueba de cierre: `npm run test:security` en `apps/web` (10/10) cubre ausencia de service role, allowlist, `401` sin JWT, `401` con sesión inválida y `403` por RLS. Por qué: el BFF público resolvía la empresa enumerando `/rest/v1/companies` con la llave de servicio y cualquiera podía editar catálogos de otra empresa.

26. **El cliente guarda el refresh que el API rota, y el rol administrativo se compara exacto.** Dos contratos del cliente medidos en la Fase 2 (2026-11-08):
    - **La renovación de sesión guarda el refresh nuevo.** `apps/web/lib/sessionSecurity.ts:125` escribe `body.refresh` en `localStorage` junto al token. Si el cliente conserva el refresh viejo, el API mide un reuso que produjo el propio cliente y la señal deja de valer para decidir el enforcement. Un `keepSessionAlive` que solo reescriba `token` está incompleto, aunque la pantalla siga funcionando.
    - **`isAdministrativeRole` no abre Administración por parecidos.** `apps/web/lib/moduleAccessPolicy.ts` compara nombre normalizado exacto contra la lista; `apps/web/test/module-access-role.test.mjs` fija que subcadenas, valores vacíos y roles ausentes no abren el módulo. Un `.includes("admin")` aquí repite el bypass que la API ya cerró.
    Prueba de cierre: `node --experimental-strip-types --test test/module-access-role.test.mjs` (3/3 el 2026-11-08). Por qué: sin la primera regla, la detección de reuso mide un artefacto del cliente; sin la segunda, una pestaña administrativa se abre por un nombre que solo se parece.

27. **El cliente trata cualquier 401 como sesión muerta, así que un 401 que no es de credencial se vive como «la sesión no aguanta».** Cuatro contratos del incidente del 2026-11-08: (a) en `apps/web/lib/api.ts` el 401 intenta refresh y, si no puede, llama `clearSession()` y hace `window.location.href = "/login"` dentro del propio `api()`; un `Promise.allSettled` alrededor **no** protege, porque el redirect ocurre antes de que el settled devuelva. (b) Un código de alcance (`EMPRESA_REQUERIDA`, `EMPRESA_NO_VINCULADA`, `EMPRESA_NO_AUTORIZADA`, `ROL_NO_DEFINIDO`) tiene que llegar como 403 y mostrarse nombrando la empresa o el rol que falta, más la afirmación explícita de que la sesión sigue activa; el mensaje genérico de «permiso denegado» deja al usuario sin acción. (c) La prueba es estructural: se verifica que ninguna ruta 403 alcanza `clearSession`, no solo el texto del mensaje. (d) Los demás módulos ni llegaban a la API —`supabaseApiFallback` no cubre `/api/v1/admin/*` y el resto lee Supabase desde el cliente—, así que «solo falla Administración» es evidencia de la ruta, no un misterio. Por qué: el literal que veía el usuario era «Sesion expirada, revocada o no autorizada» al abrir el módulo de administración en producción.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y catálogo leído.
- [ ] Pantalla de referencia elegida y anotada.
- [ ] Primitivas y tokens que se van a usar identificados.
- [ ] Alcance separado de backend/esquema.

Durante:

- [ ] Sin hex, sin `div` con borde/sombra propios, sin `<table>` manual.
- [ ] Estados de carga, error, vacío y permisos cubiertos.
- [ ] Formularios con label, hint, error y foco visible.
- [ ] Revisión en tema claro y oscuro.
- [ ] Cambios limitados a `apps/web/**` y su documentación.

Después:

- [ ] `npm run lint` y `npm --workspace apps/web run typecheck` en verde.
- [ ] Build/start ejecutado cuando aplique.
- [ ] Flujo probado en navegador (camino feliz y borde) con captura.
- [ ] `npm run verify:web-assets` si cambiaron assets.
- [ ] Control nuevo en este skill, bump semver, `updated_at` y `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.

## Evidencia

- Capturas o trazas de navegador del flujo probado en ambos temas.
- Salida de `lint`, `typecheck`, build y `verify:web-assets`.
- Comparación contra la pantalla de referencia del catálogo.
- Destino: `docs/qa/evidence/<cambio>/` con nombres `web-*.txt` o `web-*.png`.
- Si una prueba no se pudo ejecutar, se escribe `BLOQUEO: <motivo>` en el handoff.

## Handoff

- A `apexos-backend`: qué endpoint, campo o contrato necesita y qué respuesta espera.
- A `apexos-db-nube`: qué dato falta o qué tipo no llega correctamente.
- A `apexos-seguridad`: qué permiso o visibilidad gobierna la pantalla.
- A `apexos-qa`: qué flujo probar, con qué datos y en qué temas.
- Declara: archivos tocados, pantalla de referencia usada, desviaciones del catálogo y su justificación, pendientes y bloqueos.

## Antipatrones

- Copiar estilos de otra pantalla sin pasar por el catálogo y crear una tercera variante.
- Usar `dark:` creyendo que sigue el tema de la app.
- Meter creación/edición dentro de un listado o monitor.
- Duplicar una bandeja existente con otro nombre.
- Ocultar un estado vacío con datos falsos o KPIs en cero con operación cargada.
- Declarar terminado con `build` en verde y sin abrir el navegador.
- Resolver un popup de `<select>` solo con `color-scheme` (el SO lo ignora).
- Agregar dependencias de UI sin justificar y sin actualizar el catálogo.
- Dejar un color literal de Tailwind en una superficie que el tenant personaliza.
- Reusar la tinta invertida del tema como letra sobre la fotografía del banner.
- Cambiar `buildStorefrontVars` sin mover a la vez el bloque `:root` de `storefront.css`.
- Dar por buena una imagen subida porque el `POST` devolvió 201, sin verla cargada en el navegador.
- Renovar la sesión guardando solo el `token` y descartar el `refresh` rotado: la siguiente renovación se lee como reuso.
- Decidir el acceso a Administración con un `includes` sobre el nombre o el metadata del rol.
