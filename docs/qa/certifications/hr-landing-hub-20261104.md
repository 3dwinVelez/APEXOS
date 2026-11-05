# Talento Humano como hub de tarjetas de tarea

Fecha local: 2026-11-04 (America/Bogota). Implementacion y certificacion en `desarrollo`, rumbo a `develop` para QA funcional.

## Alcance del cambio

`M-17 · Talento Humano` era la unica portada de modulo con pantalla propia que no usaba el patron de tarjetas ya adoptado por Ventas, Compras, Inventario, Facturacion, Contabilidad, Transporte y Gastos Menores. Sus accesos estaban repartidos entre el boton del hero (`/mallas`), un panel de "Areas de trabajo" y un panel lateral de Nomina rotulado *Disponible proximamente*, aunque `/nomina` ya era funcional y estaba enlazado dentro del propio panel.

- `apps/web/app/dashboard/talento-humano/page.tsx` pasa a encabezado `apex-section-card` (eyebrow `M-17 · Talento Humano`) mas seccion `apex-dense-actions` con quince tarjetas `ActionCard`, una por pantalla real del modulo, en orden de trabajo: planeacion, monitoreo, marcacion, novedades, mapa, maestros, configuracion y liquidaciones.
- El acceso a Nomina deja de anunciarse como pendiente y queda como tarjeta funcional al mismo nivel que las demas.
- `/mallas` obtiene su propia tarjeta; antes solo era alcanzable desde el boton del hero.
- No cambian rutas, permisos, API ni esquema. El hub no filtra por RBAC ni por modulo activo, igual que los otros siete hubs del producto.

## Certificacion de navegador (extremo a extremo)

```text
node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-landing-hub-local.js
```

Resultado: `status=passed`, `exit_code=0`, `unexpected_5xx=[]`, base aislada `apexos_cert_hr_assoc_1793853635684`, ejecucion 2026-11-05T04:41:08Z a 2026-11-05T04:49:17Z sobre el commit `1403e617`. Cinco grupos aprobados con API real, PostgreSQL real y Chrome headless, sin respuestas simuladas:

1. El hub renderiza el encabezado del modulo y una tarjeta por cada acceso. SSR verificado: seccion presente, los quince `href` en el HTML, 40522 bytes, sin esqueleto de guardia. En DOM: 15 tarjetas con titulo, detalle e icono, sin duplicados y en el orden declarado.
2. El navegador arranca sin cache de service worker que pueda enmascarar el bundle fresco: se desregistraron 1 service worker y 1 `cacheStorage` y se certifica el estado limpio despues del barrido.
3. Las quince tarjetas abren su propia pantalla con clic confiable (no sintetico) y verificando `location.pathname` destino a destino. Los quince titulos visibles son distintos y reales: Asignar horarios, Monitor de mallas horarias, Mi jornada, Novedades de jornada, Mapa en vivo de rutas y marcaciones, Maestro de empleados, Entidades y afiliaciones, Configuracion laboral, Liquidacion de nomina, Provisionar prestaciones sociales, Aportes sociales, Pago de prestaciones sociales, Libranzas y deducciones recurrentes, Liquidacion de trabajador y Horas laboradas y trazabilidad. Ninguna muestra marcador de ruptura.
4. Cada uno de los quince destinos ofrece enlace de regreso al hub y el regreso vuelve a mostrar las quince tarjetas. El clic de regreso se ejecuta sobre el enlace visible dentro de `main` (el shell tiene tres anclas hacia `/dashboard/talento-humano`).
5. Sin errores no capturados de pagina y sin peticion rota durante todo el recorrido: 79 navegaciones, 228 peticiones GET de Talento Humano ejercitadas, cero peticiones inesperadas por encima de 400 y cero `pageerror`.

## Regresion del modulo

`node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-employee-user-link-local.js` -> `passed`, `exit_code=0`, `unexpected_5xx=[]` (2026-11-05T04:38:51Z a 04:40:19Z, base `apexos_cert_hr_assoc_1793853501044`). Diez grupos, incluidos dos recorridos de navegador, y coberturan las capacidades protegidas: autenticacion, 401 anonimo, 403 sin escritura, 404 y 409 de inquilino ajeno o vinculo ocupado, conservacion salarial y contractual, `rbac` y aislamiento multi-tenant.

Pruebas automatizadas del modulo, todas en verde:

```text
node scripts/certifications/hr-workday-novelties-local.js     (19/19, contratos y politicas API, sintaxis de servicio, rutas y esquema)
node --test apps/web/test/hr-landing-information-architecture.test.mjs apps/web/test/hr-workday-novelties-ui.test.mjs
npx tsc --noEmit --project apps/web/tsconfig.json --incremental false     (exit 0, sin salida)
```

## Contrato QA de la portada, actualizado

`apps/api/scripts/certifications/hr-landing-qa.js` afirmaba la portada anterior (`Mallas horarias`, `Crear y asignar horarios`, `Marcaciones y jornadas`, `Monitor de jornada`, `Disponible proximamente`) y habria fallado contra el nuevo hub. Se reescribio al contrato vigente: identifica `M-17 · Talento Humano`, la seccion `Herramientas activas de talento humano`, los quince accesos, el orden de las quince tarjetas y la prohibicion explicita del marcador *Disponible proximamente* y de mezclar `Gestionar vehiculos`. Las sesiones Nyvora autorizada/limitada, el 401 anonimo y el commit desplegado se conservan sin cambios. El contrato se valido contra el HTML SSR real local antes de fijarlo.

## Hallazgos registrados durante la certificacion

- El corredor aislado generaba la copia de esquema sin la columna `TimeRoute.kind`, por lo que `/api/v1/hr/routes` y `/api/v1/hr/operations-map` respondian 500 y la pantalla de rutas mostraba su banner de fallo tecnico. La base local compartida si tenia esa migracion aplicada en QA, pero no en el volcado local. Se corrigio el corredor para alinear la copia aislada con el esquema Prisma de forma declarativa (aplica `20260919110000_time_route_kind_descanso` solo cuando la columna falta), sin tocar la base fuente. Tras eso, cero respuestas 5xx.
- Seis respuestas `403 MODULO_NO_HABILITADO` de `/api/v1/transport/vehicles` desde las pantallas de jornada: es el bloqueo de modulo que el tenant del fixture no tiene contratado, no una peticion rota. La certificacion lo clasifica y lo registra por separado (`expected_foreign_module_gating`) porque el hub, por diseno compartido con los otros siete modulos, no filtra accesos por modulo activo.
- Tres respuestas `409` de `/api/v1/hr/self*`: estado vacio esperado, la sesion QA del fixture no tiene empleado vinculado. Tambien quedan registradas como `expected_empty_states`.
- El navegador del certificador bloquea peticiones fuera de `127.0.0.1`, por lo que los teselos de OpenStreetMap del mapa operativo no cargan. Se certifica la pantalla y su datos, no la cartografia externa.

## Entorno y efectos secundarios

- PostgreSQL local en contenedor (`infra-postgres-1`, `127.0.0.1:55432`). Todo el trabajo ocurre sobre una copia de esquema vacio creada por el corredor; no escribe en la base fuente ni en QA o produccion y no ejecuta migraciones remotas.
- Frontend local en `http://127.0.0.1:3317` con `next dev --webpack` y distribucion `.next-hr-user-association`; API local efimera en puerto dinamico con `DISABLE_REDIS` y `WORKERS_DISABLED`.
- Las bases de certificacion `apexos_cert_hr_assoc_*` y los artefactos crudos (`certification.json`, `isolated-certification.json`, `certification.log` y capturas en `.local/hr-landing-hub/` y `.local/hr-employee-user-association/`) se conservan para inspeccion local y no se commitean, siguiendo la convencion del modulo.

## Trazabilidad y estado de la promocion

La certificacion evalua los archivos del arbol de trabajo sobre `1403e617`; el commit funcional certificado guarda exactamente esos blobs mas esta evidencia. `desarrollo` no es ancestro de `develop` y trae ademas trabajo de identidad movil de marcacion, por lo que una fusion de rama completa borraria archivos de `develop`. Con autorizacion expresa del propietario se reconstruye un candidato aislado `codex/qa-hr-landing-hub-20261104` desde `origin/develop`, que contiene exclusivamente las nueve rutas del manifiesto de alcance.

Este cambio permanece en `desarrollo`. No se hizo push, promocion, despliegue ni migracion remota; `develop` y `main` no se modificaron en esta intervencion. QA funcional remota sigue pendiente: la autorizacion pre-QA cubre exclusivamente desplegar el candidato en QA para probarlo.
