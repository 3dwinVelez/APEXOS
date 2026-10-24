# Transporte: coherencia de temas claro y oscuro

## Intervención

- Rama: `desarrollo`, solo ambiente local. HEAD inicial/final: `85fdbe81ee293e866ac8a6d06c5ff22d264c8874`, cambios sin commit.
- Skills utilizadas: orquestación, frontend y QA de APEXOS.
- Se conservaron los cambios locales previos de buscadores de Transporte.
- No se modificaron APIs, base de datos, permisos, infraestructura, secretos ni dependencias. No se hicieron commits, push, promociones o despliegues.

## Causas y correcciones

1. `SettlementDialog.module.css` y `RateCostDesigner.module.css` redefinían los tokens globales con una paleta clara y declaraban `color-scheme: light`. Se retiraron estas definiciones para heredar la paleta activa, también al renderizar mediante portales.
2. Planeación forzaba fondos y textos claros mediante variantes arbitrarias `!important` y reglas específicas de `html.dark` en `globals.css`. Se retiraron esas excepciones limitadas a Transporte.
3. Los componentes y pantallas usaban fondos blancos y textos neutrales fijos que dependían de parches globales. Ahora usan `surface`, `surface-soft`, `surface-muted`, `content-strong`, `content-body`, `content-muted`, `content-subtle` y `line`.
4. El diseñador de costos tenía colores hexadecimales en paneles, resumen, bordes y controles. Se sustituyeron por tokens. El título del resumen y el texto del método seleccionado también siguen la paleta activa.
5. Se retiraron las variantes `dark:` del diseñador que dependían del tema del sistema operativo en lugar de la selección de la aplicación.
6. Los controles, atribución, tooltips y popups de Leaflet siguen los tokens mediante `.transport-map.leaflet-container`, con especificidad suficiente frente a la hoja de Leaflet. Se conserva la paleta cartográfica y el lienzo 3D de carga.
7. En la validación se detectó que la compilación local convertía `color-scheme: inherit` en `normal`; se eliminó la declaración de los módulos CSS y se comprobó en navegador la herencia real del esquema oscuro/claro, incluidos calendarios y listas en portal.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| `node scripts/certifications/transport-theme-local.cjs` | **passed: 77 comprobaciones** |
| `npm --workspace apps/web run typecheck` | **passed** |
| ESLint de pruebas de tema, prueba ajustada del resumen y buscador | **passed**, sin advertencias |
| `node --test --test-reporter=spec apps/web/test/transport-*.test.mjs` | **92 passed, 2 failed**, 94 pruebas |
| `git diff --check` | **passed** |

La certificación navega por 14 rutas locales: inicio, flota, órdenes, operación, planeación, tarifas, liquidaciones, cubicaje, monitoreo, POD, PYG, notificaciones, configuración y maestros. Comprueba claro y oscuro en las 12 rutas propias de Transporte y confirma las redirecciones existentes de PYG a Contabilidad y maestros a Administración.

Abre el formulario real de nuevo paquete, alterna oscuro → claro → oscuro y verifica que el desplegable en portal tenga la misma superficie y esquema que el diálogo. Recorre los cuatro pasos de un tarifario sin guardarlo y comprueba modal, resumen y título en ambos temas. Captura escritorio de 1440 px y móvil de 390 px. Todas las solicitudes HTTP externas del navegador están bloqueadas; no se guarda ninguna entidad ni se evalúan/crean planes.

Evidencia JSON y capturas fuera del repositorio:

`C:/Users/mq1/AppData/Local/Temp/apex-transport-theme-sr1tUk/evidence.json`

En el mismo directorio: `tariff-light.png`, `tariff-dark.png`, `tariff-mobile-light.png`, `tariff-mobile-dark.png`, `settlement-light.png`, `settlement-dark.png`, `settlement-mobile-light.png` y `settlement-mobile-dark.png`. Se inspeccionaron visualmente las capturas de tarifas y liquidaciones en ambos tamaños/temas. Regresión: `%TEMP%/transport-theme-regression.txt`.

Se añadieron tres pruebas preventivas que impiden reintroducir paletas claras dentro de los diálogos, excepciones oscuras de planeación y colores neutrales fijos/variantes dependientes del sistema operativo. Se actualizó la expectativa antigua del total verde fijo para exigir el color `apex` del tema activo.

## Límites y dictamen

Persisten los dos fallos de regresión documentados antes de esta intervención: expectativa del literal `idempotente` en Liquidaciones y llamada literal sin parámetros a `organization-tree` en la ficha vehicular. No se debilitaron estas pruebas ni se modificó su lógica ajena al tema.

La certificación cubre presentación y alternancia de temas; no certifica crear, contabilizar, liquidar o despachar entidades. El monitor de escenarios de planeación se revisó en código y con pruebas preventivas; no se generaron escenarios nuevos para abrirlo durante esta prueba. Los mapas externos no se descargaron en la certificación.

**Gate visual local: APTO CON OBSERVACIONES. Certificación integral/publicación: NO APTO**, por los fallos previos y la certificación funcional integral pendiente. Promoción no solicitada y bloqueada; no se ejecutaron ni sustituyeron los gates de `desarrollo -> develop -> main`.

Siguiente acción autorizada: evaluación local del usuario y ajustes en `desarrollo`.
