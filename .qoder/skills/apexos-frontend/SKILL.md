---
name: apexos-frontend
<<<<<<< HEAD
description: Experto de frontend del Equipo APEXOS: Next.js App Router, Tailwind, experiencia de usuario y rendimiento percibido. Usar para pantallas nuevas o modificadas, formularios, listados, componentes compartidos, tema claro/oscuro, flujos móviles táctiles o validación de estilos/assetos del frontend.
when_to_use: Cambios de UI en apps/web, pantallas nuevas, componentes, formularios, tema claro/oscuro, validación de estilos.
=======
description: Experto de frontend del Equipo APEXOS: Next.js App Router, Tailwind, homologación visual y rendimiento percibido. Usar para pantallas nuevas o modificadas, formularios, listados, componentes compartidos, tema claro/oscuro, flujos móviles táctiles o validación de estilos/assetos del frontend.
when_to_use: Cambios de UI en apps/web, pantallas nuevas, componentes, formularios, tema claro/oscuro, validación de estilos, homologación de pantallas.
version: 2.4.0
updated_at: 2026-11-05
contract: 2
>>>>>>> ba1fb1c1 (feat(comercio): vitrina publica tematizable por el cliente (colores, banner y textos))
---

# Experto de frontend — Equipo APEXOS

## Referencias clave

- `apps/web/` — app (`app/`), componentes (`components/`), estado (`store/`), cliente API (`lib/`)
- `docs/project/filosofia-producto-ui.md` — principios obligatorios de UX
- `docs/project/validacion-frontend-css.md` — validación de estilos y assets
- `docs/PERCEIVED_PERFORMANCE_STANDARD.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md`

## Reglas de experiencia

- Una pantalla, un propósito principal claro. Acciones secundarias en botones visibles, menús o ventanas emergentes.
- Creación y edición de registros en modales, paneles laterales o pantallas dedicadas; nunca incrustadas en listados o monitores.
- Los módulos abren con panel limpio: indicadores relevantes, acciones principales y accesos a subflujos. KPIs dinámicos desde datos reales del tenant, no vacíos si hay operación cargada.
- Los flujos operativos reconocen al usuario conectado: no pedir seleccionar operario/técnico cuando la acción corresponde al propio usuario autenticado.
- Acciones destructivas con confirmación explícita; preferir inactivar/suspender sobre eliminar en datos con historial.
- Móvil: botones táctiles grandes, lectura rápida, acciones de una mano. Compatibilidad legible entre tema claro y oscuro en todo componente nuevo.
- No sacrificar funcionalidad ni rendimiento por decoración. Mantener consistencia entre módulos (encabezados, KPIs compactos, `ActionCard`, tablas comparativas en escritorio y tarjetas táctiles en móvil).
- El perfil `Tecnico` usa shell operativo exclusivo sin menú modular; toda ruta fuera de Servicios lo devuelve a Servicios.

## Validación obligatoria

<<<<<<< HEAD
- `npm run lint`, `npm --workspace apps/web run typecheck` y build sin advertencias; una alerta silenciosa se corrige por causa raíz, no se oculta.
- Probar la funcionalidad en navegador (camino feliz y casos borde) antes de declarar éxito; si no se puede probar la UI, decirlo explícitamente.
- Revisar en navegador y en AMBOS temas (claro y oscuro): popups de `<select>`, estados de foco y estados vacíos/guías de campos obligatorios. En Windows el popup nativo lo pinta el SO con su tema e ignora el `color-scheme` de la página, así que `color-scheme` solo es mitigación parcial; la solución real es `appearance: base-select` + `::picker(select)` tematizado (clase `apex-select` en globals.css, degradación controlada en navegadores sin soporte). La variante `dark:` de Tailwind responde a `prefers-color-scheme` (darkMode: media por defecto en esta app), NO al tema de la app (`html.dark`): con SO en modo oscuro + app en tema claro, los `dark:` se activan por error — el foco de celdas debe acoplarse con clase propia (`apex-cell` + reglas `html.dark`). CDP no captura popups nativos del SO; con base-select sí se capturan, pero si la ventana del navegador está ocluida Chromium no los pinta.
- Verificar assets con `npm run verify:web-assets` cuando aplique.
=======
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
>>>>>>> ba1fb1c1 (feat(comercio): vitrina publica tematizable por el cliente (colores, banner y textos))
