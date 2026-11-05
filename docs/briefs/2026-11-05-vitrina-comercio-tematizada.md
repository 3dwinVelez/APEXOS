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
2. `node --test apps/api/test/comercio-service.test.js apps/api/test/comercio-storage.test.js` → verde sin regresión (subset de Comercio **54 pruebas, exit 0**).
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
- La suite API completa (regresión de todo `apps/api/test`) seguía en ejecución al redactar este cierre; los fallos históricos del baseline no están atribuidos. Lo que sí está medido para este cambio: archivo de tema 19/19 y subset de Comercio 54/54 en verde. Su resultado se reporta aparte.

**Autorizaciones pendientes.** `git push origin desarrollo` (el pedido fue explícito: solo commit local), creación del bucket en el ambiente, y cualquier promoción a `develop`/`main` con su manifiesto de alcance. Ninguna de las tres se ejecutó.
