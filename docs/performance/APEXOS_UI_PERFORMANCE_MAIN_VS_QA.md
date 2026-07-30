# Auditoría comparativa de rendimiento UI — APEXOS

Fecha: 2026-07-29

## 1. Resumen ejecutivo

La rama candidata **no demuestra todavía una mejora integral de rendimiento, productividad o experiencia operativa suficiente para promoverse a producción como “APEXOS Performance UI Update v2.0”**.

Los cambios implementados crean tokens y primitivas visuales, pero la migración de pantallas no ocurrió: `Card`, `DataTable`, feedback y controles de formulario nuevos tienen **cero importaciones desde las 58 páginas**. Por ello no hay reducción comprobable de clics, pasos, renderizados, solicitudes o complejidad estructural en los flujos operativos.

El bundle compartido permanece en 103 kB. El total de JavaScript estático aumenta 5,08 %, el CSS aumenta 2,11 % y aparecen cinco archivos JavaScript adicionales. Parte de este crecimiento pertenece a Offline First y seguridad, no al diseño, porque `develop` no contiene un cambio UI aislado.

La única reducción DOM medida en una pantalla comparable sin autenticación fue de 144 a 143 nodos en login (-0,69 %), sin cambios en botones, inputs, elementos interactivos, cards, sombras ni backdrop. Está dentro de la variabilidad irrelevante.

**Dictamen: NO APROBADO — CAMBIO PRINCIPALMENTE ESTÉTICO.**

## 2. Alcance

Se compararon copias aisladas de:

- Base `main`: `4594572ad2c476cdccf23bfb6c661566274ab3a8`.
- Candidata `develop`: `e8a776bda798a293a1bf9507700d7d98b95161cb`.

No se modificó `main`, no se hizo merge, no se desplegó y no se alteraron datos remotos.

## 3. Commits evaluados

| Versión | Commit | Framework observado |
| --- | --- | --- |
| `main` | `4594572ad2c476cdccf23bfb6c661566274ab3a8` | Next.js 15.5.18 |
| `develop` | `e8a776bda798a293a1bf9507700d7d98b95161cb` | Next.js 15.5.22 |

## 4. Ambiente y limitaciones

- Mismo equipo Windows.
- Mismo archivo `.env`, copiado a ambos worktrees aislados.
- Mismo navegador Chromium integrado.
- Servidores de producción locales en puertos 3101 y 3102.
- Cinco repeticiones HTTP más una ejecución de calentamiento excluida.
- `Cache-Control: no-cache`.

Limitaciones que impiden certificar todos los escenarios solicitados:

1. El runtime disponible fue Node.js 24.14.0, mientras el repositorio exige Node.js 22.x.
2. Las versiones de Next.js no son idénticas.
3. No había una sesión QA autenticada equivalente para ambos orígenes locales. No se inventaron credenciales ni se copiaron tokens.
4. `develop` difiere de `main` en 161 archivos, 13.287 inserciones y 226 eliminaciones.
5. La candidata agrega Offline First, seguridad, almacenamiento de evidencias, API y Prisma. No es posible atribuir todos los cambios de bundle o comportamiento al Design System.
6. FCP, LCP, INP, CLS, TBT, perfil React, tareas autenticadas y red móvil completa quedan no concluyentes hasta ejecutar un benchmark instrumentado con Node 22 y usuarios QA equivalentes.

Estas limitaciones no convierten resultados ausentes en aprobaciones.

## 5. Datos utilizados

- HTML público de login e inicio.
- Artefactos `.next/static` generados por cada commit.
- Manifiestos de build de las 64 rutas.
- Código de las 58 páginas y componentes frontend.
- Pruebas disponibles en cada commit.
- No se realizaron escrituras funcionales contra QA.

## 6. Metodología

1. Se registraron los commits exactos.
2. Se crearon worktrees detached separados.
3. Se aplicó el mismo `.env`.
4. Se ejecutó `npm ci` en cada copia.
5. Se ejecutaron typecheck, ESLint y build.
6. Se levantó cada build en modo producción.
7. Se ejecutó una solicitud de calentamiento y cinco mediciones por URL.
8. Se tomó la mediana como valor principal.
9. Se inspeccionó DOM y controles con el mismo navegador.
10. Se contaron assets, patrones visuales, controles y adopción de componentes.

## 7. Herramientas

- Git y worktrees.
- npm.
- Next.js production build.
- TypeScript.
- ESLint.
- `curl` para TTFB, tiempo total y bytes.
- Chromium integrado para DOM y estructura interactiva.
- `rg` y PowerShell para inventario estático.

## 8. Escenarios ejecutados

| Escenario | Estado |
| --- | --- |
| Build productivo | Completo |
| Login público | Completo, cinco repeticiones |
| Inicio público | Completo, cinco repeticiones |
| Complejidad DOM de login | Completo |
| Bundle y chunks | Completo |
| Adopción del Design System | Completo |
| Dashboard autenticado | No concluyente: falta sesión equivalente |
| Usuarios y roles | No concluyente: falta sesión equivalente |
| Servicios y detalle | Bundle comparado; interacción no concluyente |
| Flujos Mobile | No concluyente: falta sesión equivalente |
| Red 4G/Slow 4G | No concluyente |
| Perfil React | No concluyente |
| Tareas destructivas o de escritura | No ejecutadas por seguridad |

## 9. Resultados brutos

Los resultados completos están en `docs/performance/APEXOS_UI_PERFORMANCE_RAW_RESULTS.json`.

## 10. Medianas y dispersión

| Escenario | Métrica | `main` | Candidata | Diferencia | Resultado |
| --- | ---: | ---: | ---: | ---: | --- |
| Login | TTFB mediana | 11,187 ms | 6,345 ms | -4,842 ms (-43,28 %) | No concluyente: escala local y outlier de 30 ms |
| Login | Tiempo total mediana | 13,374 ms | 9,612 ms | -3,762 ms (-28,13 %) | No concluyente: diferencia absoluta <4 ms |
| Inicio público | TTFB mediana | 6,731 ms | 6,152 ms | -0,579 ms (-8,60 %) | Sin cambio relevante en términos operativos |
| Inicio público | Tiempo total mediana | 7,193 ms | 6,280 ms | -0,913 ms (-12,69 %) | Sin cambio relevante; diferencia absoluta <1 ms |
| Login | Bytes HTML | 17.118 | 17.061 | -57 (-0,33 %) | Sin cambio relevante |
| Inicio público | Bytes HTML | 16.068 | 15.833 | -235 (-1,46 %) | Sin cambio relevante |

No se reporta p95 con cinco muestras como evidencia fuerte: con este tamaño coincide prácticamente con el máximo y es muy sensible a outliers. Los cinco valores se conservan en JSON.

## 11. Matriz comparativa obligatoria

| Escenario | Métrica | `main` | Rama candidata | Diferencia absoluta | Diferencia porcentual | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Dashboard Desktop | First Load JS | 263 kB | 262 kB | -1 kB | -0,38 % | Sin cambio relevante |
| Servicios Desktop | Tamaño de ruta | 15,5 kB | 16,8 kB | +1,3 kB | +8,39 % | Regresión menor |
| Servicios Desktop | First Load JS | 155 kB | 155 kB | 0 | 0 % | Sin cambio |
| Listado de órdenes | Solicitudes de red | N/D | N/D | N/D | N/D | No concluyente |
| Tabla de usuarios | Renderizados | N/D | N/D | N/D | N/D | No concluyente |
| Panel técnico Mobile | Tiempo hasta interacción | N/D | N/D | N/D | N/D | No concluyente |
| Orden móvil | Cantidad de toques | N/D | N/D | N/D | N/D | No concluyente |
| Bundle compartido | JavaScript inicial | 103 kB | 103 kB | 0 | 0 % | Sin cambio |
| Assets estáticos | JavaScript total | 2.660.358 B | 2.795.622 B | +135.264 B | +5,08 % | Regresión menor/confundida |
| Assets estáticos | CSS total | 85.318 B | 87.114 B | +1.796 B | +2,11 % | Sin mejora |
| Assets estáticos | Chunks JS | 97 | 102 | +5 | +5,15 % | Regresión menor/confundida |
| Layout login | Nodos DOM | 144 | 143 | -1 | -0,69 % | Sin cambio relevante |
| Login | Elementos interactivos | 3 | 3 | 0 | 0 % | Sin cambio |
| Frontend | Patrones blur/gradiente/sombra | 169 | 163 | -6 | -3,55 % | Sin cambio relevante |
| Frontend | Controles nativos declarados | 889 | 895 | +6 | +0,67 % | Sin migración estructural |

## 12. Hallazgos Desktop

- No existe evidencia de migración pantalla por pantalla.
- Las nuevas primitivas `Card`, `DataTable`, feedback y formularios no son importadas por páginas.
- El botón existente se usa únicamente en login, registro, onboarding y Administración, igual que en `main`.
- Las tablas, formularios y filtros continúan definidos localmente.
- No se verificó reducción de scroll, clics, campos o acciones.
- Servicios aumenta 8,39 % en tamaño de ruta por funcionalidad adicional, no por una optimización visual.

## 13. Hallazgos Mobile

- La candidata incluye una implementación Offline First y un panel técnico nuevo, pero este cambio no pertenece exclusivamente al Design System.
- No hay evidencia comparable de reducción de toques o tiempo de tarea contra `main`.
- No se pudo ejecutar una sesión móvil QA idéntica en ambos orígenes.
- Por tanto, la experiencia Mobile no está certificada por esta auditoría.

## 14. Hallazgos de red

- Las páginas públicas transfieren casi el mismo HTML.
- Las diferencias locales de TTFB son de pocos milisegundos absolutos y no prueban una mejora de usuario.
- No se midieron endpoints autenticados bajo datasets equivalentes.
- No existe evidencia de menos solicitudes, menos cascadas o menor payload operativo atribuible al cambio visual.

## 15. Hallazgos React

- No se incorporó instrumentación React Profiler.
- Los nuevos componentes base no están adoptados en las pantallas, por lo cual no pueden haber reducido renderizados de esas pantallas.
- No se detectaron cambios de arquitectura de estado o memoización atribuibles al Design System.
- Resultado: no concluyente cuantitativamente y sin evidencia de mejora estructural.

## 16. Hallazgos de bundle

- JavaScript compartido: 103 kB en ambas versiones.
- JavaScript estático total: +5,08 % en la candidata.
- CSS: +2,11 %.
- Chunks: +5.
- La candidata agrega dos dependencias frontend frente a la base, asociadas principalmente a Offline First.
- No se cumple el umbral propuesto de -15 % en JavaScript inicial.

## 17. Hallazgos funcionales

| Validación | `main` | Candidata |
| --- | --- | --- |
| TypeScript | Pasa | Pasa |
| ESLint | Pasa | Pasa |
| Build | Pasa | Pasa |
| Rutas generadas | 64 | 64 |
| Prueba de política admin | No existe | 2/2 pasan |

La suite Offline Storage candidata obtuvo 13 pruebas correctas y 9 fallidas. Los fallos muestran fixtures temporales evaluados como expirados en la fecha de auditoría. No se atribuyen al Design System, pero impiden declarar toda la estabilidad funcional en verde.

## 18. Regresiones

1. Tamaño de la ruta Servicios: +8,39 %.
2. JavaScript estático total: +5,08 %.
3. CSS total: +2,11 %.
4. Cinco archivos JavaScript adicionales.
5. Nueve pruebas Offline Storage fallidas por datos temporales no deterministas.

## 19. Mejoras comprobadas

- Build y validación estática siguen funcionando.
- La política de acceso administrativo cuenta con pruebas nuevas.
- Se eliminaron seis ocurrencias de patrones blur/gradiente/sombra en el inventario fuente (-3,55 %).
- Los tokens visuales oficiales quedaron definidos.

Ninguna de estas mejoras demuestra todavía mayor productividad de los flujos principales.

## 20. Cambios únicamente estéticos o fundacionales

- Paleta oficial.
- Fondo operativo.
- Tipografía y tokens.
- Radio, sombras y tratamiento de botones.
- Componentes base creados pero no adoptados.

El usuario sigue operando las mismas pantallas y controles en casi todos los módulos.

## 21. Recomendaciones priorizadas

### P0 — Benchmark no reproducible con la especificación

- Problema: runtime Node 24 frente a engine 22 y versiones Next distintas.
- Evidencia: warnings `EBADENGINE` y builds 15.5.18/15.5.22.
- Impacto: impide certificación estricta.
- Solución propuesta: fijar Node 22 y alinear Next antes del benchmark final.
- Riesgo: bajo.
- Esfuerzo: bajo.
- Archivos: `.nvmrc`, `package-lock.json`, `apps/web/package.json`.

### P0 — Suite Offline Storage no determinista

- Problema: 9 pruebas fallan por expiración temporal de fixtures.
- Evidencia: estados `EXPIRED_RETAINED` y snapshots vacíos.
- Impacto: no permite declarar estabilidad completa.
- Solución propuesta: congelar reloj o generar fechas relativas.
- Riesgo: bajo.
- Esfuerzo: medio.
- Archivos: `apps/web/test/offline-storage.test.mjs`.

### P1 — Componentes base sin adopción

- Problema: cuatro familias nuevas tienen cero imports desde páginas.
- Impacto: no reducen duplicación, DOM ni trabajo del usuario.
- Solución propuesta: migrar una pantalla piloto de bajo riesgo y medir antes/después.
- Riesgo: medio.
- Esfuerzo: medio.
- Archivos: `apps/web/components/ui/*` y pantalla piloto.

### P1 — Falta benchmark autenticado

- Problema: no hay cifras comparables para usuarios, roles, servicios o Mobile.
- Solución propuesta: dos despliegues QA aislados o hosts locales con el mismo usuario y dataset de prueba; automatizar cinco repeticiones.
- Riesgo: bajo si es read-only.
- Esfuerzo: alto.

### P2 — Servicios crece sin presupuesto documentado

- Problema: tamaño de ruta +8,39 %.
- Causa probable: filtro y funciones Offline.
- Solución propuesta: analizar chunks y lazy-load del panel Offline.
- Riesgo: medio.
- Esfuerzo: medio.
- Archivos: páginas de Servicios y `OfflineTechnicianPanel`.

### P3 — Deuda visual restante

- Problema: persisten 163 ocurrencias de sombras, blur o gradientes.
- Solución propuesta: eliminarlas gradualmente con medición visual y funcional.
- Riesgo: bajo.
- Esfuerzo: medio.

No se implementó ninguna recomendación durante esta auditoría.

## 22. Dictamen final

# NO APROBADO — CAMBIO PRINCIPALMENTE ESTÉTICO

La rama candidata define una base visual y reduce algunos patrones decorativos, pero no demuestra:

- reducción relevante del bundle inicial;
- reducción de renderizados;
- menos solicitudes;
- menos clics o pasos;
- menor complejidad estructural;
- mejora Desktop cuantificada;
- mejora Mobile cuantificada;
- estabilidad funcional total.

No se recomienda preparar el merge a `main` bajo la justificación de “actualización de rendimiento UI”. Debe completarse una pantalla piloto, corregir el benchmark y repetir la auditoría autenticada antes de reconsiderar el dictamen.

## 23. Evidencias y comandos reproducibles

```powershell
git rev-parse main
git rev-parse develop
git diff --stat main...develop
npm ci
npm --workspace apps/web run typecheck
npm --workspace apps/web run lint
npm --workspace apps/web run build
npx next start -p 3101
npx next start -p 3102
curl.exe -s -o NUL -H "Cache-Control: no-cache" -w "%{time_starttransfer},%{time_total},%{size_download},%{http_code}" http://localhost:3101/login
```

Para repetir correctamente la certificación final:

1. Usar Node.js 22.x.
2. Alinear dependencias.
3. Usar dos hosts con el mismo backend QA.
4. Crear usuarios QA equivalentes.
5. Ejecutar una pasada de calentamiento.
6. Ejecutar al menos cinco repeticiones.
7. Capturar Lighthouse, React Profiler, red y tareas operativas.

