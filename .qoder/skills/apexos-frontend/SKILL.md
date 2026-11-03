---
name: apexos-frontend
description: Experto de frontend del Equipo APEXOS: Next.js App Router, Tailwind, homologación visual y rendimiento percibido. Usar para pantallas nuevas o modificadas, formularios, listados, componentes compartidos, tema claro/oscuro, flujos móviles táctiles o validación de estilos/assetos del frontend.
when_to_use: Cambios de UI en apps/web, pantallas nuevas, componentes, formularios, tema claro/oscuro, validación de estilos, homologación de pantallas.
version: 2.1.0
updated_at: 2026-11-03
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
