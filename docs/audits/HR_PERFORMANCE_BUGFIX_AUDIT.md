# Auditoria de rendimiento y correccion de bugs - Talento Humano

## Resumen ejecutivo

- Fecha de revision: 2026-07-08
- Rama base: `main`
- Modulos auditados: page.tsx (dashboard), marcacion, rutas, mapa, reportes, nomina, `apps/api/src/modules/hr/service.js`

Revision profunda de las 6 pantallas del modulo Talento Humano y su backend. Se encontraron 3 bugs activos que degradaban la experiencia y 4 cuellos de botella de rendimiento.

## Bugs corregidos

| ID | Modulo | Severidad | Hallazgo | Correccion |
| --- | --- | --- | --- | --- |
| HR-PERF-001 | Marcacion (GPS) | **Alta** | El `useEffect` del GPS tenia `gps` en el array de dependencias, pero `setGps(fix)` se ejecutaba dentro del intervalo, generando un nuevo objeto `{...}` en cada tick. Esto causaba que el efecto se reinstalara constantemente, acumulando intervalos simultaneos y duplicando pings GPS cada 30s. | Se removio `gps` del array de dependencias. El intervalo ahora vive independiente de la ultima posicion GPS. |
| HR-PERF-002 | Mapa (isOnline) | **Alta** | `filteredPeople` dependia de `now` (Date.now actualizado cada 1s via setInterval). Con 648 personas en el mapa, el useMemo se recalculaba 60 veces por minuto aunque el dataset no hubiera cambiado, causando renderizado continuo de todos los puntos en SVG/HTML. | Se extrajo `isOnline` a funcion pura fuera del componente usando `person.age_seconds` del backend, eliminando la dependencia de `now`. El filtro solo se recalcula cuando cambian `people`, `routeId`, `userName`, `status` o `activeWindowSeconds`. |
| HR-PERF-003 | Mapa (evidence) | Media | `activity.evidence` se pasaba como `undefined` al metadata del `selectedMark`, causando error al renderizar `selectedMark.metadata?.evidence[0]?.base64_data` cuando se abria el panel de una actividad. | Se agrego `|| []` para garantizar que evidence sea siempre un array. |

## Optimizaciones de rendimiento

| ID | Modulo | Impacto | Cambio |
| --- | --- | --- | --- |
| HR-OPT-001 | page.tsx / rutas/page.tsx | Alto | `monitorRoutes` y `selectedRoute` se envolvieron en `useMemo` para evitar recalculos en cada render. Antes vivian como valores directos, forzando a React a reprocesar la timeline y el panel lateral en cada cambio de estado no relacionado. |
| HR-OPT-002 | Marcacion (GPS ping) | Medio | Se agrego `if (document.hidden) return;` al intervalo de GPS ping. Cuando el usuario cambia de pestana, se evitan pings GPS y POSTs innecesarios al backend. |
| HR-OPT-003 | Backend getOperationsMap | **Alto** | Se eliminaron 2 consultas SQL redundantes en modo en vivo: `lastFootprints` (huella extendida de 14-30 dias) y `workActivity` con evidencia completa. En modo historico, `lastFootprints` se limita a 1000 registros. En modo vivo, los pings del dia reemplazan la huella extendida. Se redujo `pingLimit` de 1000 a 300, `punchLimit` de 1000 a 300, `activityLimit` de 1000 a 100 en modo vivo. |
| HR-OPT-004 | Marcacion (GPS interval) | Medio | Se corrigio el ciclo de reinicio constante del intervalo. Antes se reinstalaba cada vez que `gps` cambiaba (cada 30s), ahora el intervalo es estable y solo depende de `employee`/`userName`/`route?.id`/`vehiclePlate`. |

## Pruebas ejecutadas

| Prueba | Resultado |
| --- | --- |
| `next lint` | Sin errores (1 warning preexistente `normalizeUsernameEmail`) |
| `tsc --noEmit` | Sin errores |
| `node --check apps/api/src/modules/hr/service.js` | Sin errores |
| `next build` | Compilacion exitosa en 11.9s, 57/57 paginas generadas |

## Archivos modificados

- `apps/web/app/dashboard/talento-humano/page.tsx`
- `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`
- `apps/web/app/dashboard/talento-humano/mapa/page.tsx`
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`
- `apps/api/src/modules/hr/service.js`
- `docs/audits/HR_PERFORMANCE_BUGFIX_AUDIT.md`
