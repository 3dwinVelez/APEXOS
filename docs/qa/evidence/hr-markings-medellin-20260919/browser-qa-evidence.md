# Réplica funcional desde el navegador — QA (release marcaciones Medellín + FM-01 v2)

- **Fecha:** 2026-09-19 (12:35–12:45 hora Bogotá)
- **Web QA:** https://apexos-web-qa-production.up.railway.app
- **API QA:** https://apexos-api-qa-production.up.railway.app — `/health` commit `5607ff62d19e` (= HEAD de develop)
- **Build web QA:** chunk CSS `_next/static/chunks/2cfpwpkr55vhk.css` (mismo hash servido en producción, el alcance no toca `apps/web`)
- **Fixture:** simulacro de Medellín corrida `20260919173138` (rutas 281–286, 10 marcadores concurrentes, 5 municipios del área metropolitana)
- **Navegador:** Chromium vía MCP browser-use, sesión real con credenciales del fixture

## Recorrido ejecutado

| # | Sesión | Acción | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | `qa.med.bello.A.20260919173138@scj.test` (rol Empleado marcaciones) | Login y apertura de *Mi jornada* | Horario 282 (06:00–14:00, SIMBLL01, GPS activo) en estado **Jornada cerrada**; las 4 marcas figuran *Registrado correctamente* y el botón *Registrar actividad* queda deshabilitado con "Horario cerrado." | `qa-06-marcacion-bello-a-jornada-cerrada.png` |
| 2 | misma sesión | Pestaña *Historial* | Inicio jornada 06:05, Salida almuerzo 10:00, Retorno almuerzo 10:45, **Fin jornada 16:30** (hora extra sobre el fin 14:00 + 15 min de tolerancia), timeline operativo 1–4 con placa SIMBLL01 | `qa-07-marcacion-bello-a-historial-4-marcas.png` |
| 3 | `qa.med.admin.20260919173138@scj.test` (admin) | Mapa → *Histórico* 2026-09-19 | 13 rutas, 48 personas, 22 online; las 10 personas del simulacro aparecen **Finalizó 16:30** (Bello y Envigado incluidos, que antes del arreglo respondían 500) | snapshot de accesibilidad + `qa-08`, `qa-09` |
| 4 | admin | Filtro de ruta `SIMBLL01 - Horario 282` | 2 personas, mapa centrado en 6.34500, -75.55300 (Bello) zoom 13; 8 marcadores de marcación (I/A/R/C ×2) + 2 pines de actividad "Cargue de mercancía en bodega 11:30"; polilinas por persona `stroke #16a34a` y `#f97316` con `stroke-dasharray 10 8` y **4 puntos cada una**, más el trail GPS `#0ea5e9` de 10 puntos | `qa-08-mapa-qa-ruta-282-bello-polilneas.png` |
| 5 | admin | Filtro de ruta `SIMENV01 - Horario 284` | Trazado equivalente en Envigado (6.17150, -75.59040 y alrededores), 4 puntos por persona en destinos distintos | `qa-09-mapa-qa-ruta-284-envigado-polilneas.png` |
| 6 | admin | Monitor de mallas → drawer del horario 282 | Drawer fijo al viewport (top=0, height=537, width=574), estado **Cerrado**, 8 marcaciones, 2 actividades, 6 evidencias, 2/2 en vivo, badges Entrada/Almuerzo/Retorno/Cierre por persona, coordenadas 6.35200,-75.54700 y 6.33000,-75.55000, trazabilidad cronológica | `qa-10-monitor-qa-horario-282-cerrado.png` |

## Errores silenciosos

- **Consola:** `list_console_messages` devolvió *sin mensajes* en la sesión del marcador y en la sesión del administrador (0 errores, 0 advertencias de aplicación).
- **Red:** 82 solicitudes registradas en la sesión del administrador; todas 200/204. Endpoints verificados sin fallo: `/api/v1/auth/me`, `/api/v1/hr/routes`, `/api/v1/hr/routes/event-summaries`, `/api/v1/hr/employees?active=true`, `/api/v1/transport/vehicles`, `/api/v1/admin/user-master-data`, `/api/v1/hr/operations-map?date=2026-09-19&minutes=30&footprint_days=30`, `/api/v1/hr/monitor-evidence/route/282`.
- **Marcaciones:** el cierre de jornada vehicular con kilometraje (rutas 282 Bello y 284 Envigado) respondió 200 y quedó visible en la UI del marcador, en el mapa y en el monitor. Antes del arreglo FM-01 v2 esas mismas salidas devolvían 500 `ERROR_INTERNO` en QA (`qa-certification-failed-prefix-f04add4.json`).

## Verificación de datos en QA (solo lectura)

`th_jornada_kilometrajes` pasó de 1 renglón (estado pre-arreglo) a 5, con 4 renglones activos nuevos del simulacro:

| id | route_id | employee_id | value | vehicle_plate | active |
|----|----------|-------------|-------|---------------|--------|
| 2 | 282 | 393 | 42.5 | SIMBLL01 | true |
| 3 | 284 | 397 | 38.2 | SIMENV01 | true |
| 4 | 282 | 392 | 42.5 | SIMBLL01 | true |
| 5 | 284 | 396 | 38.2 | SIMENV01 | true |

Un único renglón activo por (tenant, ruta, empleado), sin duplicados: la escritura ya no depende de la forma del índice parcial.

## Estado del fixture

El fixture del simulacro (admin + 10 marcadores + sonda de idempotencia, corrida `20260919173138`) queda **activo en QA** para inspección del release owner, igual que en releases anteriores; las credenciales están en `qa-fixture.json`. Se recomienda desactivarlo tras la aceptación (`active=false` en `User` para los correos `qa.med.*@scj.test`). El usuario de la certificación NYVORA sí se desactivó al terminar (`qa-nyvora-hr-monitor.json`).
