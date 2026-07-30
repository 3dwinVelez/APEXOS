# APEXOS UI Remediation Report

Fecha: 2026-07-29

## Resumen ejecutivo

La remediación se detuvo de forma controlada después del primer piloto Desktop. El inventario confirmó que las primitivas nuevas no fueron adoptadas por ninguna de las 58 pantallas. Se eliminaron cuatro familias de componentes sin consumidores, pero no afectaban el bundle porque tree shaking ya las excluía.

El piloto de Administración retiró JSX inalcanzable y corrigió un temporizador creado durante render. El build permaneció en 23 kB para la ruta y 179 kB First Load JS. Al no existir mejora medible, el cambio de pantalla se revirtió y no se iniciaron los demás pilotos.

## Causa raíz

1. Se documentó y creó el Design System sin plan de adopción por consumidores.
2. Las primitivas nuevas coexistían como archivos, pero tenían cero imports.
3. Los tokens globales cambiaron apariencia sin cambiar arquitectura de pantallas.
4. Administración, Servicios y WMS siguen siendo componentes cliente monolíticos.
5. La candidata mezcla UI con Offline First, seguridad y almacenamiento, dificultando atribución.
6. La primera limpieza de código muerto no redujo el bundle porque el compilador ya la eliminaba.

## Fase 0

- `main`: `4594572ad2c476cdccf23bfb6c661566274ab3a8`.
- `develop` inicial: `4ef234c8c2da01eae58d5af09b44dfcd0bbe0776`.
- Rama: `codex/perf-ui-remediation`.
- `main` permaneció intacta.
- Se conservó la metodología de la auditoría anterior.
- Node disponible: 24.14.0; engine requerido: 22.x.

## Fase 1 — Inventario

- 58 rutas inventariadas.
- 57 no migradas.
- 1 placeholder excluido.
- 0 consumidores de `Card`.
- 0 consumidores de `DataTable`.
- 0 consumidores de feedback nuevo.
- 0 consumidores de controles de formulario nuevos.

Evidencia: `APEXOS_UI_ADOPTION_INVENTORY.md`.

## Fase 2 — Depuración

Componentes eliminados:

- `card.tsx`
- `data-table.tsx`
- `feedback.tsx`
- `form-controls.tsx`

Motivo: cero adopción y ausencia de beneficio medido. Se eliminaron 120 líneas de superficie muerta. No se eliminaron dependencias porque estas primitivas no introducían una dependencia exclusiva.

Componentes conservados:

- `Button`, con cuatro consumidores reales.
- `ModalFrame`, utilizado transversalmente.
- `ActionCard`, anterior a esta actualización.

## Piloto Desktop 1 — Administración

### Antes

| Métrica | Valor |
| --- | ---: |
| JavaScript de ruta | 23 kB |
| First Load JS | 179 kB |
| JavaScript compartido | 103 kB |

### Intento

- Retirada de 56 líneas de JSX bajo `{false && ...}`.
- Retirada de tres imports de iconos asociados.
- Traslado de un temporizador creado durante render a `useEffect` con cleanup.

### Después

| Métrica | Valor |
| --- | ---: |
| JavaScript de ruta | 23 kB |
| First Load JS | 179 kB |
| JavaScript compartido | 103 kB |

### Decisión

Rechazado y revertido. El compilador ya eliminaba el árbol inalcanzable y no hubo mejora de bundle. Sin sesión autenticada equivalente tampoco existía evidencia suficiente de DOM o renders para justificar aceptación.

## Pilotos no iniciados

- Proveedores: detenido por fallo del primer piloto.
- Servicios Desktop: detenido por fallo del primer piloto.
- Listado Mobile: detenido.
- Detalle Mobile: detenido.
- Checklist/evidencia: detenido.

Esto cumple la regla de no avanzar si una pantalla no demuestra mejora.

## Servicios

Servicios permanece en 16,8 kB frente a 15,5 kB en `main`, una regresión de 8,39 %. No se intervino porque el piloto anterior no fue aprobado. El crecimiento mezcla filtro por técnico y Offline First; requiere separación arquitectónica e instrumentación antes de modificar.

## Resultados Desktop

No existe un piloto Desktop aprobado. Administración no cambió métricas de bundle y fue revertida.

## Resultados Mobile

No se modificó Mobile ni Offline First. No existe un piloto Mobile aprobado.

## CSS y dependencias

- CSS no modificado durante la remediación.
- Dependencias no modificadas.
- Los componentes eliminados estaban fuera del bundle; su retirada mejora mantenibilidad, no transferencia.

## Validaciones

- TypeScript: pasa.
- ESLint: pasa en base; el intento rechazado mostró una función anterior sin uso y fue revertido.
- Build productivo: pasa, 64 rutas.
- Suite de política administrativa: previamente en verde.
- Offline Storage: baseline conocida de 13 correctas y 9 fallidas por fixtures temporales.
- Lighthouse, React profiling y E2E autenticado: no concluyentes por ausencia de sesión equivalente y runtime Node fuera de especificación.

## Regresiones

No se introdujeron regresiones porque el único cambio de pantalla fue revertido. Las regresiones existentes de bundle y Servicios permanecen.

## Limitaciones

- Node 24 frente a Node 22 requerido.
- Next.js distinto entre `main` y `develop`.
- Sin sesión QA equivalente para ambos hosts locales.
- Candidata no aislada a UI.
- Sin perfiles React autenticados.

## Riesgos

1. Extraer componentes sin separar estado puede aumentar props y renders.
2. Adoptar wrappers de formulario puede aumentar DOM.
3. Mantener una tabla y una lista Mobile ocultas puede duplicar DOM.
4. Intervenir Servicios sin aislar Offline First puede romper operación de campo.
5. Medir solo bundle puede ocultar mejoras o regresiones de interacción.

## Recomendación

No continuar la estrategia de “adoptar componentes” como objetivo primario. La próxima propuesta debe:

1. aislar una sección de Administración mediante un límite de carga diferida;
2. mantener estado cerca del consumidor;
3. medir DOM y renders con sesión QA;
4. demostrar reducción antes de migrar otra pantalla;
5. alinear Node y Next para una comparación válida.

No se recomienda merge a `main`.

## Dictamen

# NO APROBADO — SIN MEJORA SUFICIENTE

La remediación retiró código fuente sin adopción, pero no produjo una mejora medible en el primer piloto. Conforme a la regla de escalamiento, la migración se detiene para revisión.

