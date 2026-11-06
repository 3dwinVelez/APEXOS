# Brief — Vitrina de Comercio tematizable por el cliente

- **ID**: `2026-11-05-vitrina-comercio-tematizada`
- **Fecha**: `2026-11-05`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "necesito que sobre el modulo de comercio, este cuenta con una herramienta que habilita un link donde presentamos un catalogo, requiero que esta pagina pueda ser configurada desde el modulo de configuracion que ya tenemos en comercio y que le permita al usuario cambiar los colores de la presentacion, colocar banners, fondos, etc.. trabaja sobre el ambiente de desarollo y solo commitea localmente los cambios a evaluar al finalizar la intervencion. recuerda que esta configuracion le debe permitir no solo poner una imagen si no crear algo unico en su propio espacio que le permita promocinar sus productos, tambien podriamos considerar conectar algun modelo gratuito que pueda ayudarle a generar imagenees y subirlas es un ejemplo, has el analisis interviene y revisamos el resultado"

## 1. Objetivo

Que el dueño del negocio personalice desde `Comercio → Configuración` la página pública `/tienda/<código>`: colores de acento y promociones, fondo, banner (imagen subida o generada con un modelo gratuito sin clave) y textos propios del banner. El tema se persiste en el slot existente `comercio_settings.preferences_json` y viaja sanitizado en la payload pública del catálogo. Sin migración de esquema.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/modules/comercio/service.js` | Validar/normalizar `preferences.theme` en `updateSettings`; derivar tema en `publicCatalog` (hex validados, banner como URL pública); `setStorefrontTheme`, `attachStorefrontBanner`, `detachStorefrontBanner`, `generateStorefrontBanner` |
| `M` | `apps/api/src/modules/comercio/schema.js` | `storefrontThemeBody` y `storefrontGenerateBody` (hex `^#[0-9a-fA-F]{6}$`, largos, enum de semilla de estilo) |
| `M` | `apps/api/src/modules/comercio/routes.js` | `PUT /comercio/settings/storefront/theme` (write), `POST /comercio/settings/storefront/banner` multipart (write), `DELETE /comercio/settings/storefront/banner` (write), `POST /comercio/settings/storefront/generate-image` (write) |
| `M` | `apps/api/src/modules/comercio/storage.js` | Clave de objeto genérica (`{tenant}/comercio/storefront/banner-*`) reutilizando validación de firma/tamaño/dimensiones ya existente |
| `A` | `apps/api/src/modules/comercio/imagegen.js` | Cliente de `image.pollinations.ai` (gratuito, sin clave): URL fija, prompt acotado, timeout, tope de bytes, salida binaria validada antes de subir |
| `A` | `apps/api/test/comercio-storefront-theme.test.js` | Sanidad del tema público (no fuga de costo/stock/tenant), rechazo de hex inválido, upsert de banner en preferencias, generador con fetch falso, 503 sin Supabase y el strip de campos ajenos a `setStorefrontTheme` |
| `A` | `apps/web/app/tienda/storefront.css` | Utilidades `sf-*` de la vitrina leídas de variables CSS (`--sf-*`) con la paleta actual como valores por defecto |
| `M` | `apps/web/app/tienda/[code]/page.tsx` | `<link>` al CSS de vitrina, `generateMetadata` con nombre/tagline, tipo `PublicCatalog.theme` |
| `M` | `apps/web/components/comercio/storefront.tsx` | Raíz con variables `--sf-*` derivadas del tema (acentos, promociones, papel, tinta y contrastes seguros); banner editable con headline/subtítulo/imagen; fondo opcional; literales `emerald/rose/neutral` de la vitrina migrados a `sf-*` |
| `A` | `apps/web/components/comercio/storefront-theme.ts` | Derivación de paleta (mezcla con negro/blanco para escalas 600/500/400/900/800, texto sobre color por luminancia relativa) — sin dependencias |
| `M` | `apps/web/app/dashboard/comercio/configuracion/page.tsx` | Sección «Apariencia de la vitrina»: presets, selectores de color, banner (suber/quitar/generar con IA), textos del banner y guardado vía `PUT .../storefront/theme` |
| `A` | `apps/web/test/comercio-storefront-theme.test.mjs` | El storefront consume `theme`/`sf-*`, la página pública enlaza su CSS y configuración guarda el tema |
| `A` | `docs/qa/evidence/vitrina-comercio-tematizada-20261105/` | Salidas de suites, capturas de navegador del antes/después y dictamen |
| `A` | `scripts/certifications/comercio-storefront-theme-local.js` | Certificación end-to-end de la vitrina tematizada (40 verificaciones), registrada como `npm run certify:comercio-storefront-theme:local`: contrato público, defensas de inyección por efecto, tres estados de pintura medidos con WCAG, panel vivo y constancia honesta de storage/generación |
| `M` | `package.json` | Alta del script `certify:comercio-storefront-theme:local` |
| `M` | `agents/CHANGELOG.md`, `agents/registry.json`, `.qoder/skills/apexos-backend/SKILL.md`, `.qoder/skills/apexos-frontend/SKILL.md`, `.qoder/skills/apexos-seguridad/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-brief/SKILL.md` | Controles nuevos + bump + `updated_at` (espejo `agents/` vía `agents:sync`) |
| `A` | `docs/briefs/2026-11-05-vitrina-comercio-tematizada.md` | Este documento |

### Módulos (`change_intent.modules`)

- `comercio`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Esquema Prisma y migraciones: el tema vive en `preferences_json` (JSONB) — nada toca `apps/api/prisma/**`.
- Carrito, WhatsApp, promociones, precios y visibilidad de productos: no cambian su contrato.
- Tema del dashboard (tokens de `globals.css`): la vitrina es superficie de marca del comercio y mantiene su paleta autocontenida, ahora parametrizada.
- Promociones a `develop`/`main`, despliegues, Supabase nube: prohibidos sin autorización independiente.
- Pasarelas de pago, SEO avanzado, multi-plantilla: no pedidos.

## 4. Restricciones

- Rama: solo `desarrollo`. **El usuario pidió commit local y NO push** — la publicación a `origin/desarrollo` queda pendiente de su autorización en esta intervención.
- Aislamiento multi-tenant y RBAC intactos: el tema solo se escribe con `comercio:write`; la lectura pública sigue siendo `catalog_code → tenant → runWithTenant` sin exponer `tenant_id`, costo ni stock.
- La payload pública no debe contener las cadenas `cost` ni `stock` (aserción negativa vigente en `comercio-service.test.js`).
- Sin secretos ni claves en el repo; Pollinations se usa sin API key.
- Validación de imagen con firma real (`detectFileMime`), 5 MB y 4096 px — mismo estándar que fotos de producto.

## 5. Criterios de aceptación

Resultado al cierre (2026-11-05). El criterio 5, que era el de navegador, se promovió a una certificación versionada (`scripts/certifications/comercio-storefront-theme-local.js`) en lugar de quedar como corrida manual.

1. `node --test apps/api/test/comercio-storefront-theme.test.js` → **19/19 en verde**. Ajuste del criterio: el hex inválido sí rechaza 400 `THEME_COLOR_INVALID`, pero un campo no declarado (`banner_url`, `banner_path`) **no** da 400 —AJV viene con `removeAdditional: true` y lo elimina en silencio—, así que la defensa se afirma por efecto y quedó probada en el servicio (`setStorefrontTheme` ignora los campos que no le pertenecen).
2. `node --test apps/api/test/comercio-service.test.js apps/api/test/comercio-storage.test.js` → verde sin regresión (subset de Comercio **54 pruebas, exit 0**). Regresión API completa en modo secuencial: **1014 pruebas, 1010 pasan, 0 fallos de producto** y 2 archivos cancelados por una condición del arnés (ver sección 12).
3. `node --test apps/web/test/comercio-storefront-resilience.test.mjs apps/web/test/comercio-storefront-theme.test.mjs` → **13/13** el archivo nuevo; suite web completa **622 pruebas, exit 0**.
4. `npm run lint` y `typecheck` → `tsc --noEmit` exit 0 y `eslint` exit 0 sobre los cuatro archivos tocados; `node --check` OK en los siete JS.
5. Navegador: **certificación 40/40 en verde** (`fallidos: []`) — tema propio aplicado, preset desde el panel leído de vuelta en la ruta pública, banner renderizado con scrim y letra sobre fotografía legible, botón con la tinta de mayor contraste y cero fuga en el catálogo público.
6. `agents:sync` → `agents:check` (11 agentes y 11 documentos) → `test:agents` **42/42** → `agents:preflight` `local-ahead` en los cinco dueños → `agents:coverage` en verde.

## 6. Evidencia y certificación exigida

- Pruebas: suites de criterios 1–4 más `comercio-reports-charts` (no regresión de tokens del dashboard).
- Certificación: flujo end-to-end en navegador local (API en 3000 sobre `infra-postgres-1`, `next dev`) capturado en `docs/qa/evidence/vitrina-comercio-tematizada-20261105/` con salida de suites y PNG de configuración + vitrina antes/después. No existe arnés versionado de Comercio; se declara evidencia dirigida por QA y la certificación end-to-end `QA Railway` queda pendiente como deuda propia del módulo (no nueva en esta intervención).
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- Aislamiento de tenant en la vitrina pública → mismo aserto negativo de no-fuga ampliado al payload con tema.
- Resiliencia de `/tienda/<code>` (fallback 10 min, 404 → cerrado) → `comercio-storefront-resilience.test.mjs` sigue en verde.
- Fotos de producto y bucket `comercio-assets` → `comercio-storage.test.js` sin regresión.
- Carrito/WhatsApp del catálogo → refactor cosmético sin cambio de lógica; verificado en navegador.

## 8. Riesgos y rollback

- Riesgo: refactor de 1400 líneas del storefront introduce regresiones visuales → Mitigación: utilidades `sf-*` con defaults = paleta actual (cambio neutro si no hay tema); captura antes/después en navegador. Rollback: `git revert` del commit.
- Riesgo: Pollinations cae o cambia de forma → Mitigación: el generador es una ruta auxiliar; el flujo de banner subido no depende de él y el error se propaga honesto al cliente.
- Riesgo: fuga de datos comerciales por el tema → Mitigación: el tema se reconstruye campo por campo en el servidor (blanco de claves + hex validado); prueba de aserción negativa.

## 9. Supuestos y preguntas abiertas

- Supuesto: «modelo gratuito» = Pollinations sin cuenta ni clave (verificado alcanzable: JPEG en ~7 s). No se almacena ninguna credencial.
- Supuesto: el tema se guarda en `preferences_json.theme` (documentado en el esquema como slot de preferencias visuales) — sin columna nueva.
- Supuesto: el banner de vitrina reemplaza al «hero» compuesto cuando existe; sin banner guardado se conserva el hero actual de productos destacados.
- Pregunta abierta (no bloquea): inactivar definitivamente el bucket público para banner en la nube — se comporta igual que fotos de producto, misma migración pendiente de infra.

## 10. Autorizaciones requeridas

- [ ] `git push origin desarrollo` de este cambio (el usuario pidió solo commit local para evaluar).
- [ ] Promoción a `develop` (pre-QA con manifiesto y evidencia) — posterior y separada.
- [ ] Aplicar en la nube cualquier dependencia de infraestructura del bucket (sin cambios nuevos en esta intervención).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: ejecutado 2026-11-05 con `--paths "apps/api/src/modules/comercio/**,apps/web/app/tienda/**,apps/web/app/dashboard/comercio/**,apps/web/components/comercio/**,apps/api/prisma/schema.prisma"` → Veredicto `OK`; ruteo: `equipo-apexos`, `apexos-db-nube`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- **Agentes consultados**: los seis anteriores (lecturas obligatorias completadas).
- **Documentación a actualizar**: este brief, `agents/CHANGELOG.md`, SKILL de backend/frontend/seguridad/qa.
- **Agentes a actualizar**: `apexos-backend` 2.4.0 → **2.5.0** (controles `tema-vitrina-sin-migracion`, `strip-ajv-reconstruccion`); `apexos-frontend` 2.3.0 → **2.4.0** (`vitrina-tokens-sf`, `tinta-sobre-fotografia`); `apexos-seguridad` 2.6.1 → **2.7.0** (`superficie-tema-sin-inyeccion`); `apexos-qa` 2.8.0 → **2.9.0** (`certificacion-pintura-medida`); `apexos-brief` 2.7.2 → **2.8.0** (`brief-personalizacion-residencia-dato`, dueño de `docs/briefs/` según el preflight). Las versiones base difieren del planeamiento inicial porque el frente de la torre bumpó esos mismos agentes el mismo día: se partió de la versión vigente en `origin/desarrollo`, no de la que se anotó al abrir el brief.
- **Registro**: `agents/registry.json` vía `agents:sync` y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"`.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas sección 5 → **commit local**. El push queda bloqueado por la instrucción del usuario.
- **Publicación obligatoria**: NO aplica en esta intervención por orden expresa del usuario («solo commitea localmente los cambios a evaluar»); se pide autorización aparte.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit

## 12. Cierre de la intervención

**Qué quedó funcionando.** El comercio configura su vitrina desde `Comercio → Configuración → Apariencia de la vitrina`: tres colores (base/acento/promo) con presets, textos del cartel, banner propio (subida o generado) y fondo derivado. Todo se persiste en `comercio_settings.preferences_json.theme` —sin migración— y la ruta pública `/tienda/<code>` se pinta con variables `--sf-*` inyectadas en el contenedor raíz. Un tenant que no configura nada ve la paleta anterior, byte a byte.

**Defecto de producto encontrado y corregido (no lo vio ninguna prueba).** Con banner subido y tema claro, el titular del hero quedaba casi negro sobre la fotografía: la regla «la letra se invierte según el fondo del tema» no conoce los píxeles del banner. Se agregó una capa de tinta sobre fotografía (`--sf-photo-*` + `.sf-on-photo`, aplicada por nodo de texto para no apagar el botón translúcido ni la tarjeta del destacado) con letra clara y acentos aclarados por mezcla con blanco. La aserción antigua codificaba el defecto como expectativa y fue reemplazada; la verificación nueva (`sobre_el_cartel_la_letra_no_depende_del_tema`) exige luminancia alta y contraste ≥ 12:1 sobre el scrim.

**Contrato de validación corregido en el camino.** Fastify monta AJV con `removeAdditional: true`, así que `additionalProperties: false` **elimina** el campo no declarado y devuelve 200; no produce el 400 que la certificación esperaba. La defensa real es el strip más la reconstrucción campo por campo en `setStorefrontTheme`/`publicTheme`, y ahora está afirmada por efecto (JSON público idéntico antes y después del PUT inyectado) más una prueba de servicio. Ninguna URL de imagen la aporta nunca el cliente: solo `POST .../storefront/banner` y el generador escriben en el bucket, y el servidor deriva `banner_url`.

**Limitaciones declaradas (no verificadas).**
- El bucket `comercio-assets` no existe en este ambiente: la subida responde 500 `ERROR_INTERNO` en vez de un 503 limpio. La gate registra la constancia (201 o ≥500) y no se vende como subida exitosa. **Falta autorización para crearlo.**
- El modelo gratuito (`image.pollinations.ai`, sin clave) devolvió un JPEG válido de 78.686 bytes en la prueba aislada; después su cuota gratuita respondió 402 y el módulo lo traduce a `IMAGEGEN_UNAVAILABLE`/502. Se documenta qué probó cada número: generador funcionando ≠ almacenamiento disponible.
- Regresión API completa: `node --test --test-concurrency=1 --test-timeout=120000 apps/api/test/*.test.js` → **1014 pruebas, 1010 pasan, 0 fallos de producto**, 2 canceladas. Las dos canceladas (`accounting-routes-contract.test.js`, `transport-tms-foundation.test.js`) son archivos que arrancan el servidor real y no terminan porque el lazo de eventos sigue ocupado con los cron de `apexControlPulse` y `extractReceivedInvoiceXml` —módulos de otros frentes—; el timeout impuesto para desatascar la corrida los corta. En la corrida concurrente anterior, `accounting-routes-contract` completó en verde en 19 s, así que se reporta como condición del arnés/ambiente, no como verificación de este cambio ni como defecto de Comercio. La corrida concurrente sin timeout se colgó en el mismo punto en dos intentos.

**Autorizaciones pendientes.** `git push origin desarrollo` (el pedido fue explícito: solo commit local), creación del bucket en el ambiente, y cualquier promoción a `develop`/`main` con su manifiesto de alcance. Ninguna de las tres se ejecutó.

## 13. Ronda 2 — revisión del diseño pedida por el dueño

Veredicto del dueño sobre la ronda 1: «la configuración ya tiene forma, pero siento que los colores no se ajustan bien y le faltan más medios de personalización como fondo, tonos de la página, etc.; ordena el módulo de configuraciones para que sea más profesional». Los tres reclamos eran reales y tenían causas distintas.

**«Los colores no se ajustan bien» — causa: la fórmula, no el gusto.** La derivación mezclaba RGB codificado en gamma (`mix(accent, white, 0.12)`), así que bajarle un 12 % de blanco a un verde lo dejaba lavado y mezclarlo con negro lo ensuciaba; y los niveles de letra salían de porcentajes fijos, no de contraste medido, con lo que un lima sobre fondo claro quedaba en ~2:1. El motor (`apps/web/components/comercio/storefront-theme.ts`) se reescribió sobre OKLCH: conversión lineal, gamut fit recortando **saturación** (nunca canal por canal, que vuelve violeta un azul), rampa de superficies en pasos uniformes de OKLab-L con compresión de margen e inversión de dirección cuando el fondo es gris medio, y la tinta resuelta por **búsqueda de la claridad más cercana que alcanza la razón WCAG objetivo** contra la superficie donde se pinta. El color de marca pedido se conserva verbatim en `--sf-*-t` (la ronda 1 mutaba el hex al round-trip).

**Defecto nuevo encontrado en esta ronda, con las pruebas ya en verde.** El tope de croma del tono se aplicaba **después** del factor (`min(factor × croma_acento, 0.075)`). Con un acento saturado, «suave» pedía 0.056 y «marcado» 0.102, y los dos se recortaban al mismo techo de sRGB de una superficie oscura: el comercio movía la perilla, guardaba y la vitrina salía idéntica. Se corrigió a `factor × min(croma_acento, 0.075)` —primero el tope, después el modo—, y la prueba ahora exige margen real (≥8 unidades de separación máximo−mínimo) sobre fondo negro **y** sobre fondo de color, no un `>` numérico que el recorte de gamut salvaba por 3 unidades.

**«Faltan más medios de personalización».** Cinco knobs nuevos, cableados de punta a punta (motor → CSS → marcado → esquema/validación del API → panel → vitrina): **tono de las superficies** (neutro/suave/marcado), **profundidad de las tarjetas** (plana/media/alta, que además manda en la opacidad de la sombra), **patrón de fondo** (ninguno/puntos/cuadrícula/diagonal, teñido con la línea del tema), **esquinas** (recto/suave/redondo) y **velo del cartel** (ligero/medio/fuerte). Sin columna nueva: viajan en `preferences_json.theme`. Las esquinas se resuelven con `.sf-root :is(.rounded-xl…)` porque Tailwind v3 emite `border-radius` literal, con la excepción de escritorio del cajón de carrito (`md:rounded-none`, `md:rounded-l-2xl`) conservada en su propio bloque `@media`.

**«Ordena el módulo de configuraciones».** El panel era un scroll de ~900 campos. Ahora son tres pestañas homólogas a la navegación de Compras —**Negocio**, **Vitrina**, **Apariencia**— con subsecciones de una sola responsabilidad, previa en vivo que usa las mismas clases `sf-*` y el mismo motor que la vitrina real (con conmutador escritorio/móvil), rampa de colores derivados con su razón de contraste medida, aviso AA honesto cuando el fondo pedido no da para el contraste, y marca de «cambios sin guardar» calculada por huella del tema. Cada endpoint conserva un solo formulario y una sola acción de guardado.

**Defensa.** Los modos se validan en tres capas: enum en el esquema AJV (400 antes de entrar al servicio), whitelist en `setStorefrontTheme` (`THEME_MODE_INVALID`, con escritura atómica: nada queda a medio escribir) y reconstrucción campo por campo en la lectura (`publicTheme`), de modo que un valor corrupto guardado por cualquier otra vía cae al default y nunca llega a la página. La certificación intenta además inyectar `url(...)` y comprueba que no aparece en el `background-image` pintado.

**Segundo defecto encontrado mirando la captura, no la gate.** En el tema claro, el nombre del producto destacado del cartel se leía sobre la fotografía: el pie de foto usa `--sf-grad-below`, que difumina hacia `--sf-base-t`, y su tramo casi opaco se cortaba en el 45 % de la altura —justo donde empieza el texto—. Con la plantilla antigua era invisible porque el fondo siempre fue negro y la letra blanca; al poder elegir fondo claro, la tinta pasó a casi negra y cayó sobre los píxeles de la foto. La rampa ahora llega al 0.97 hasta el 58 % y difumina solo el borde superior, y la certificación lo comprueba leyendo la rampa **que Chromium resolvió** (`el_pie_del_destacado_cubre_la_letra_*`) más el contraste de esa letra contra el fondo del tema (`la_letra_del_destacado_contra_el_fondo_*`) en los cuatro estados con cartel.

**Medición corregida en el propio arnés.** `el_precio_se_contra_su_superficie_en_navegador` comparaba el color del precio contra `#inicio article` (la primera tarjeta del riel), pero el precio que recogía era el de una ficha del hero: dos elementos que no están uno sobre el otro. Ahora el navegador sube por el DOM hasta el primer ancestro con fondo pintado y mide contra **esa** superficie.

**Tercer defecto: las rampas derivadas se congelaban al fallback de la hoja.** Al medir de verdad el pie de foto del tema claro, la rampa pintaba `rgb(10, 10, 10)` —el negro de la hoja— aunque el comercio pidiera `#f8fafc`. La causa no era el degradado sino **dónde** estaba declarado: una propiedad personalizada cuyo valor contiene `var()` se resuelve en el elemento donde se **declara** y luego se hereda ya sustituida. `--sf-grad-hero/-contact/-progress/-thumb/-below` y `--sf-shadow-accent` vivían en `:root`, donde las tripletas `--sf-*-t` todavía valen el fallback del CSS; las variables del tenant se inyectan en `#inicio`, más abajo. Alargar la rampa no arreglaba nada: se arregla declarándolas en `.sf-root`, el mismo nodo que recibe el tema. La prueba `las rampas se declaran donde vive el tema, no en :root` extrae los dos bloques de la hoja y lo exige, porque el síntoma (letra ilegible) vuelve cada vez que alguien «ordena» las variables de nuevo en `:root`.

**Ortografía de la interfaz.** El panel se escribió sin tildes («Configuracion», «pagina», «Campanas», «Titulos») mientras el resto del dashboard las lleva. No es cosmético: un panel que dice «Configuración del comercio» al lado de «Vitrina publica» se lee como borrador. Las 57 cadenas visibles quedaron en español correcto y `la prosa visible del panel escribe el español con sus tildes` vigila las que quedan, con su propio autochequeo para que el guardado no pueda volverse decorativo. Los comentarios del repositorio conservan la convención sin tilde.

**Evidencia de la ronda 2.** `apps/web/test/comercio-storefront-theme.test.mjs` **20/20**, `apps/api/test/comercio-storefront-theme.test.js` **21/21**, subset de Comercio del API en verde, `typecheck` y `eslint` de los archivos tocados limpios, y certificación navegador `npm run certify:comercio-storefront-theme:local` **70/70 en verde** (`fallidos: []`) con seis capturas (sin tema, tema propio con banner, tonos+patrón+esquinas, recto sin patrón, tema claro, panel). Las dos capturas de la ronda 1 que duplicaban los estados «tema claro» y «panel» (`03-vitrina-tema-claro.png`, `04-panel-apariencia-guardando.png`) se retiran del directorio de evidencia: quedan reemplazadas por `05-` y `06-` dentro de la numeración nueva. Arnés: el `shot()` ahora escribe sobre un PNG fresco y reintenta, porque Windows mantenía bloqueado el archivo de la corrida anterior y la gate moría con un error de sistema de archivos en vez de fallar por producto; y las paradas del degradado se leen como Chromium las serializa (`rgb(11, 18, 32)` / `rgba(11, 18, 32, 0.97) 58%`), no como la sintaxis `color / alfa` que escribió el humano que armó la prueba.

## 14. Ronda 3 — «la subida de los banners genera un error interno»

Veredicto del dueño sobre la ronda 2: «valida la subida de los banners, ya que genera un error interno al intentar subirlo». Tenía razón y la ronda 2 había ayudado a ocultarlo: la gate de la ronda 1 daba por buena la subida con `status === 201 || status >= 500` y el cierre vendía el 500 como «limitación del ambiente (no hay bucket)». Un check que acepta un 5xx nunca puede fallar, y mientras estuvo verde nadie miró la respuesta.

**Tres defectos de producto, cada uno detrás del anterior.** Ninguno era «falta de ambiente»:

1. **Causa raíz (`comercio/storage.js`).** `storageRequest` hacía `fetch` contra el Supabase local (`http://localhost:54321`), que en este puesto no corre. El `fetch` lanza `TypeError: fetch failed` con `cause.code = "ECONNREFUSED"`, un error **sin `statusCode`**, así que caía en el 500 genérico. El comercio veía «Error interno» y el log guardaba una pila sin dirección accionable.
2. **El handler se tragaba los fallos declarados.** `setErrorHandler` conservaba el `code` solo en 503; un 502 o 504 con código propio (p. ej. `IMAGEGEN_UNAVAILABLE`) terminaba en `ERROR_INTERNO`. La tabla de traducción vive ahora en `apps/api/src/core/api-error.js` (`mapApiError`) y la cláusula de dependencia abarca `[502, 503, 504]` con código. Se extrajo como función pura porque levantar la app dentro de un test deja el runner colgado (`exit=124`, «Root plugin has already booted» en el segundo `build()`), así que el contrato se prueba sin servidor: `apps/api/test/api-error-mapping.test.js` (5/5).
3. **La CSP bloqueaba la imagen aunque subiera.** `img-src 'self' data: blob: https:` no deja cargar `http://localhost:9000`: el banner quedaba roto en la vitrina y en la previa del panel. `configuredImageOrigins` (`apps/web/lib/security/csp.ts:43`) añade orígenes de `NEXT_PUBLIC_IMAGE_ORIGINS` **solo** con `NODE_ENV=development`, **solo** loopback (`localhost`/`127.0.0.1`/`::1`), sin credenciales y con path raíz (`apps/web/next.config.ts:26,50`). En producción la directiva queda byte a byte como estaba.

**El almacén local existe y no se usaba.** El compose del repo levanta MinIO en `localhost:9000`, y Transporte ya lo usa con un conductor explícito. Comercio era Supabase-only, con una caída de red traducida a 500. Se sigue el mismo precedente: `COMERCIO_STORAGE_DRIVER` (`supabase` por defecto, `minio` opcional, valor inválido → 503 `ALMACENAMIENTO_DRIVER_INVALIDO` con los valores admitidos en el mensaje) —nunca un fallback implícito que cambie de almacén según lo que responda la red (`storage.js:62`).

**Cómo se ve ahora un almacén caído.** `storageError` (`storage.js:87`) traduce por familia: DNS no resuelve → «no se resuelve desde este ambiente (DNS)»; conexión rechazada/reset → «está apagado o la URL apunta a otro lado. Sube el almacén local o corrige su configuración»; agotado el reloj → «tardó más de 15s en responder»; lo demás → el mensaje de la causa truncado. Todos 502 `ALMACEN_NO_RESPONDE`, y toda llamada al almacén está acotada por `STORAGE_TIMEOUT_MS` (15 s) para que un almacén colgado no deje la petición colgada. La lectura de la vitrina (`publicViewUrl`, `storage.js:268`) **no lanza**: devuelve `null` y la página pinta el degradado del tema, porque un banner que no carga no puede tumbar un catálogo público.

**Lectura anónima, y solo donde es local.** La vitrina es una página pública y una URL firmada caduca a los 10 minutos, así que el objeto se sirve por URL pública. En MinIO, `ensureMinioBucket` (`storage.js:202`) crea el bucket con la política `s3:GetObject` anónima **únicamente** si el endpoint es loopback; fuera del puesto de desarrollo la ausencia de bucket es 503 `ALMACEN_BUCKET_FALTA` con la instrucción de crearlo —no se abre lectura pública a un almacén nube por detrás del usuario.

**Inventario exacto de la ronda 3.**

| Estado | Archivo | Qué cambia |
|---|---|---|
| A | `apps/api/src/core/api-error.js` | Contrato de traducción error→respuesta, extraído para poder probarse |
| A | `apps/api/test/api-error-mapping.test.js` | 5 pruebas puras del contrato (502/503/504 con código conservado, 500 solo si no hay código, 4xx con `details`, P2002/P2025) |
| M | `apps/api/src/modules/comercio/storage.js` | Conductor explícito `supabase`/`minio`, errores de almacén legibles con código, timeout de 15 s, bucket público solo en loopback, `publicViewUrl` sin excepción |
| M | `apps/api/src/modules/comercio/imagegen.js` | El 402 del nivel gratuito se traduce a 502 con la causa y la salida («Puedes subir tu propia imagen») |
| M | `apps/api/src/modules/comercio/routes.js` | `generate-image` responde 201 (antes heredaba el 200) |
| M | `apps/api/server.js` | El handler global delega en `mapApiError` (6 líneas) |
| M | `apps/api/test/comercio-storage.test.js` | 10 pruebas con módulo recargado por caso: conductor por defecto, inválido, ECONNREFUSED/ENOTFOUND→502 legible, señal de abort viva, URL pública con `COMERCIO_STORAGE_PUBLIC_URL`, misconfig→`null` |
| M | `apps/web/lib/security/csp.ts` | `configuredImageOrigins`: desarrollo + loopback + sin credenciales |
| M | `apps/web/next.config.ts` | `img-src` ampliado con esos orígenes solo en desarrollo |
| M | `apps/web/test/offline-csp.test.mjs` | 5 pruebas: se añade en dev, se ignora en prod, rechaza no-loopback/path/credenciales/`javascript:`, deduplica |
| M | `scripts/certifications/comercio-storefront-theme-local.js` | El `status >= 500` tolerante sale de la gate; 8 verificaciones nuevas de la subida real |
| M | `.env.example` | `COMERCIO_STORAGE_DRIVER`, `COMERCIO_STORAGE_PUBLIC_URL` y `NEXT_PUBLIC_IMAGE_ORIGINS` documentados |
| A | `docs/qa/evidence/vitrina-comercio-banner-upload-20261106/` | 77 checks en verde, `fallidos: []`, y la captura 07 con el banner pintado |

**La gate nueva no puede volver a mentir.** `la_subida_del_banner_devuelve_201` exige 201 sin condiciones; `el_objeto_se_lee_sin_credenciales` hace un `GET` anónimo al almacén (200 + `image/jpeg`); `el_objeto_devuelve_los_mismos_bytes` compara 66.171 bytes esperados contra los leídos; `la_vitrina_pide_el_banner_subido_al_almacen` escucha la red de Chromium y afirma que el objeto se pidió y respondió 200; `el_banner_de_la_vitrina_es_el_recien_subido` compara el `src` pintado con la URL devuelta por el servidor; `el_banner_se_decodifica_en_el_navegador` verifica `naturalWidth > 0` (un 200 con imagen corrupta ya no pasa); se borra el objeto al final; y `la_generacion_no_devuelve_error_interno` acepta 201 o un 502 con código `IMAGEGEN_*`, nunca un 500. La corrida dejó los dos caminos de storage ejercitados: el banner subido (`status: 201`) y la generación gratuita devolviendo bytes y guardándose (`status: 201`).

**Evidencia de la ronda 3.** `npm run certify:comercio-storefront-theme:local` → **77/77, `fallidos: []`**, con `07-vitrina-con-banner-subido.png` donde se ve la fotografía del banner detrás del titular (la captura es la verificación: el verde de la gate no se aceptó solo). Suites: `apps/api/test/comercio-storage.test.js` + `api-error-mapping` + subset Comercio del API **36/36**; subset web (CSP, tema de vitrina, offline) **36/36**; `typecheck` de `apps/web` limpio.

## 15. Documentación, agentes y publicación de la ronda 3

- **Preflight**: ejecutado 2026-11-06 sobre las 22 rutas del inventario (más `agents/**` y `.qoder/skills/**`) → Veredicto `OK_CON_ADVERTENCIAS`; sin `INTEGRAR_REMOTO` ni `CONFLICTO` (los seis agentes bumpados siguen `local-ahead` porque el commit de la ronda 2 no se publicó). Ruteo: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`. Advertencia asumida: `apps/api/server.js` y `.env.example` no tienen dueño asignado por ruta y los cubre `equipo-apexos`.
- **Agentes consultados**: los siete anteriores, con sus lecturas obligatorias.
- **Agentes actualizados**: `apexos-backend` 2.6.0 → **2.7.0** (reglas 22 y 23 — almacén con conductor explícito y contrato de fallo de dependencia con reloj — , controles `almacen-driver-configurado`, `fallo-dependencia-conserva-codigo`); `apexos-seguridad` 2.10.0 → **2.11.0** (reglas 23 y 24 — relajar una cabecera exige guarda de ambiente + prueba de rechazo, y la lectura anónima de un bucket solo es automática en loopback — , controles `csp-img-solo-loopback-dev`, `lectura-anonima-solo-almacen-local`); `apexos-frontend` 2.5.0 → **2.6.0** (regla 17, `imagen-se-certifica-cargada`); `apexos-qa` 2.12.0 → **2.13.0** (regla 28, `check-no-legaliza-un-5xx`); `apexos-brief` 2.11.0 → **2.12.0** (regla 25, `limitacion-ambiental-reproducida`); `equipo-apexos` 2.8.0 → **2.9.0** (regla 21, `limitacion-de-ambiente-no-cubre-5xx`). Espejos y `agents/registry.json` regenerados con `agents:sync`.
- **Gates**: `agents:sync` (11 agentes y 11 documentos sincronizados) → `agents:check` (OK) → `test:agents` (42/42) → `agents:preflight` (`OK_CON_ADVERTENCIAS`) → `agents:coverage` (OK para todas las rutas). En verde los cinco.
- **Qué no se hace en esta ronda**: no se crea el bucket `comercio-assets` en el Supabase nube (infraestructura, pide autorización independiente), no se fija la imagen de `pgbouncer` en `infra/docker-compose.yml` (el `bitnami/pgbouncer:latest` retirado bloquea levantar el stack desde cero), no se toca `services/evidenceUploads.js` ni `transport/vehicle-document-storage.js` (arrastran la misma forma «Solo Supabase + red caída → 500» y merecen su propia intervención con su certificación), y no se promueve a `develop`.
- **Publicación**: **NO** se ejecuta `git push origin desarrollo`. El pedido del dueño para este frente sigue en pie: «solo commitea localmente los cambios a evaluar». Commit local en `desarrollo` al cierre.
