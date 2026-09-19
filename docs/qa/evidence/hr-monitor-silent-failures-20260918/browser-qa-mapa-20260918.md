# Verificación en navegador — Mapa de control operativo GPS (QA)

- **Cambio:** hr-monitor-silent-failures-20260918 (bounds-fit del mapa + fixes de notas/409/telemetría)
- **Ambiente:** QA (https://apexos-web-qa-production.up.railway.app, API commit `aa4b95b18ae9`)
- **Fecha:** 2026-09-18
- **Usuario:** SCJ QA (`scj@apexos.qa`)

## Procedimiento

1. Login en el portal web QA con credenciales SCJ QA — sesión creada correctamente (Supabase auth + company-session).
2. Navegación a `/dashboard/talento-humano/mapa` (Mapa en vivo de rutas y marcaciones).
3. Inspección estructural del mapa por DOM (superficie visual del navegador headless no disponible).

## Resultados

| Control | Resultado | Evidencia |
|---|---|---|
| Página del mapa carga con datos reales | OK | Ruta 72 "Sin vehiculo - Horario 72", 25 personas, 11 con señal, 14 sin GPS |
| Todos los marcadores dentro del contenedor visible | OK | **15/15 marcadores** (11 personas YA/JD/WH/FM/YO/MA/DA/LM/GR/JM + 4 marcaciones I/I/I/A) con `getBoundingClientRect()` dentro del contenedor del mapa (491x311 px). Antes del fix: offsets de hasta +9617 px fuera del viewBox 2000x1200. |
| Zoom auto-ajustado por bounds | OK | Zoom 8 (rango permitido 8-18) con centro 7.01163, -75.24349 — encuadre calculado sobre las posiciones GPS dispersas |
| Errores de consola | OK | 0 mensajes de consola (sin fallos silenciosos) |
| Controles del monitor (filtros, KPIs, lista de personas) | OK | KPIs: 1 ruta, 25 equipo, 0 online, 14 sin GPS; filtros por ruta/usuario presentes |

## Veredicto

Verificación de navegador aprobada: el mapa encuadra por bounds todas las posiciones con señal del tenant SCJ y ningún marcador queda fuera del área visible. El defecto "promedio de posiciones cae en terreno vacío y todos los marcadores quedan fuera del viewport" queda corregido en el ambiente QA.
