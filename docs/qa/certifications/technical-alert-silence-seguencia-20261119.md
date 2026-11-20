# Certificación — Secuela del enmudecimiento: validación en línea y reporte sin sesión (2026-11-19)

- **Rama certificada:** `desarrollo` (corte `9838f6af`) y, después, el **candidato a `develop`** replayado punta a punta sobre `e3d82190` (commit `c9c1b2fa` del candidato)
- **Ambiente:** puesto local, `next start` de producción sobre `apps/web/.next` con la API deliberadamente apagada
- **Artefacto de evidencia citable para la promoción:** `docs/qa/evidence/technical-alert-silence-20261119/candidato-develop/` (corrida sobre el árbol del candidato, **78/78**, `BUILD_ID k4ilir5kgOYCDKebn_aA7`). La corrida homóloga sobre el build de `desarrollo` quedó en `docs/qa/evidence/technical-alert-silence-20261119/validacion-build-final/` (76/76) y se conserva como antecedente; la repetición del arnés nuevo contra ese mismo build de `desarrollo` está en `.../mismo-arnes-build-desarrollo/` (78/78).
- **Suite:** `npm run certify:technical-alerts-silence:local` (misma que certificó el enmudecimiento publicado en `main`)

## 1. Qué se prometió

Dos cosas que la intervención del 2026-11-18 dejó declaradas como deudas propias del mismo contrato («un fallo técnico no es una ventana»):

1. Que ninguna validación de formulario de Talento Humano → Empleados vuelva a interrumpir al operario con una ventanilla nativa del navegador.
2. Que el navegador de un visitante **sin sesión válida** pueda reportar el fallo que sufrió, sin abrir una boca que pueda escribir en el expediente de otra empresa.

## 2. Columna del antes / después

| Medida | Antes | Después |
|---|---|---|
| `window.alert` en `apps/web/app/dashboard/talento-humano/empleados/page.tsx` | 8 | 0 |
| Ventanillas nativas levantadas por la app durante la corrida completa | no medido (el arnés no las miraba) | **0** (`cero_ventanillas_nativas_en_toda_la_corrida`) |
| Comprobaciones del certificador local | 68 | **78** (76 de esta secuela + el control de contraste del marcador, en los dos temas) |
| Veredicto sobre `desarrollo` | 68/68 | **76/76** → **78/78** al repetir con el arnés blindado |
| **Veredicto sobre el árbol del candidato (develop + corte)** | no medible: el arnés local solo conocía las leyendas de `desarrollo` | **78/78** (`.../candidato-develop/`) |
| Reporte de fallo con `token` ausente | se descartaba en silencio (`if (!token) return;`) | viaja a `POST /api/v1/public/telemetry/client-logs` |
| Dónde cae el reporte anónimo | no había dónde | buzón del despliegue (`APEXOS_TELEMETRY_TENANT_ID`) o `202 recorded:false` |
| Suite web completa sobre el árbol del candidato | — | **834 de 836**; los dos rojos son ajenos y están atribuidos en §6 |
| Suites API apuntadas sobre el árbol del candidato | — | **29/29** (6 de la boca pública + 23 de RBAC administrativo del módulo `admin`) |
| **QA desplegado, misma tanda de controles** (173) | **167/173: 6 rojos, todos de producto** | se remide tras la promoción (#19) |

La columna del antes en QA (`docs/qa/evidence/technical-alert-silence-20261119/qa-antes-secuela/`) se tomó contra lo que el ambiente sirve hoy (API `9953527a78bd`, cero chunks con `apex:alert`), así que mide **los huecos de esta secuela** y no los de la fase previa. Los seis rojos son `nyvora_admin_validacion_motivo_en_el_campo`, `..._campo_marcado_como_invalido` y `..._sin_ventanilla_nativa` —la evidencia registra el `alert` «Completa nombres y apellidos para generar el nombre completo.» con `invalidFields: 0`— y `la_boca_publica_existe_en_qa`, `la_boca_publica_responde_honesto`, `el_buzon_publico_pide_configuracion_sin_fingir_exito`, porque QA responde `404 Route POST:/api/v1/public/telemetry/client-logs not found`.

Antes de esa corrida citable hubo una primera pasada con **12 rojos** (`.../qa-antes-marcador-viejo/`): seis de ellos eran del instrumento, no del producto. `*_rutas_pantalla_viva` exigía las leyendas «Asignar horarios»/«Consulta de horarios» de `desarrollo`/`main` (blob `dff6265f`) sobre un `develop` desplegado que pinta «Horarios y mallas»/«Programación de jornadas» (blob `2e95b48c`), con la pantalla efectivamente montada. El marcador acepta hoy las cuatro leyendas y **el poder discriminatorio quedó medido, no afirmado** (§3.1); la diferencia entre las dos pasadas (12 → 6, solo los de producto) es la prueba de que el cambio de marcador no tapó nada.

## 3. Cómo se midió la ausencia de ventanillas (y por qué el verde no era gratuito)

Chrome headless descarta un `window.alert` sin oyente y la página sigue corriendo: un arnés sin `page.on("dialog")` reporta «cero ventanas» igual que uno roto. Por eso la corrida exige primero `el_arnes_detecta_una_ventanilla_nativa`, que dispara un `alert` con prefijo `ARNES:` y se pone roja si el registrador no lo atrapa. Las ventanillas del arnés quedan en la evidencia y se excluyen del conteo del producto.

El flujo medido, con la tormenta de 500 puesta (API caída): abrir `/dashboard/talento-humano/empleados` → «Nuevo empleado» → «Crear empleado» con el formulario vacío. Lo que tiene que aparecer es el motivo **en el campo**, y así queda registrado en `certification.json`:

```
inline_alerts: [
  "Completa nombres y apellidos para generar el nombre completo.",
  "El numero de documento es obligatorio y no se puede repetir.",
  "No hay maestro contable disponible. Configura la estructura contable para habilitar el alta.",
  "Selecciona una sucursal y un centro de costo contable.",
  "No se pudieron consultar los usuarios. Intenta nuevamente antes de asociar una cuenta."
]
invalid_fields: 2   ·   overlay_cards: 0   ·   dialogs: []
```

### 3.1 El mismo artefacto apareció en el arnés local, y se cerró midiendo dónde vive la leyenda

La primera corrida del certificador local sobre el árbol del candidato se puso roja en
`rutas_light_pantalla_sigue_viva` y abortó: la lista local de leyendas solo conocía «Asignar horarios»/«Consulta de horarios», y `develop` pinta «Horarios y mallas»/«Programación de jornadas» en `apps/web/app/dashboard/talento-humano/rutas/page.tsx:1100` y `:1119`. Ampliar la lista, sin embargo, abre otro hueco peor: esas mismas cadenas también viven en `apps/web/lib/moduleFunctions.ts` (el catálogo de la paleta de comandos) y en `apps/web/components/brain/AiExperienceLayer.tsx`, así que una leyenda capturada por `document.body.innerText` podía estar afirmando «la pantalla se montó» leyendo el menú lateral.

Se cerró con dos cambios y una medición:

- El marcador busca dentro de `<main>` (y declara en `montado_en` si tuvo que retroceder al documento completo), que es la zona que el cascarón del shell no comparte con la pantalla.
- Control de contraste `light_marcador_discrimina_pantalla_no_cascaron` y `dark_...`: si en la zona de contenido de una pantalla aparece la leyenda de **otra**, la corrida se pone roja en lugar de dar un verde hueco. El lobby queda exento porque su trabajo es nombrar funciones, y la exención está declarada en el propio arnés.
- La medición que justifica el cambio quedó versionada en `docs/qa/evidence/technical-alert-silence-20261119/medicion-marcador/candidato-develop.json` (se reproduce con `CERT_MARCADOR_DIAG=1`): en `rutas` las dos leyendas de `develop` aparecen **en `main`**, y en `mapa`, `servicios` y `monitoreo` no aparece ninguna leyenda ajena. Cero violaciones en los dos temas.

El mismo arnés blindado corre **78/78 sobre los dos árboles** —el build de `desarrollo` (`.../mismo-arnes-build-desarrollo/`, `BUILD_ID yZoMVK729ogHQT7tUJ8sK`) y el del candidato (`.../candidato-develop/`, `BUILD_ID k4ilir5kgOYCDKebn_aA7`)—, así que el control no es un ajuste a la medida de una rama.

## 4. Contrato de la ruta pública (backend)

`node --test apps/api/test/telemetry-client-logs-public.test.js` → **6/6**. Cubre lo que importa de seguridad, no solo que la ruta exista:

- `tenant_id`, `user_email` y `authorization` enviados en el cuerpo **no llegan al servicio**: el schema con `additionalProperties: false` los descarta y el buzón es siempre el del despliegue.
- Sin `APEXOS_TELEMETRY_TENANT_ID`, la respuesta es `202 { recorded:false, reason:"BUZON_TELEMETRIA_NO_CONFIGURADO" }` y no se escribe nada: no hay `ok` fingido.
- Con buzón, el servicio recibe el tenant del ambiente y `user = null`.
- `message` obligatorio y acotado, `detail` ≤ 2 000, metadata restringida a `href`/`provider`, `bodyLimit` propio de 8 KB (413 antes de tocar el límite global de 25 MB).

Regresión del cliente: `node --test apps/web/test/technical-alert-silence.test.mjs apps/web/test/hr-monitor-refresh.test.mjs` → **17/17**. El archivo del enmudecimiento pasó de 9 a 12 contratos y tres de ellos son de esta secuela:

- `la validacion de empleados se pinta en el campo, no en una ventana` — prohíbe cualquier `alert(` en `empleados/page.tsx` y exige que el guardado entregue los motivos al formulario (`setFormErrors(errors)`), que el texto cuelgue del campo con `role="alert"` y que el campo se marque con `aria-invalid`.
- `corregir el dato limpia el motivo en linea` — exige que escribir el soporte ET 114-1 y desmarcar la casilla retiren el mensaje, para que el motivo no quede colgado sobre un dato ya corregido.
- `un visitante sin sesion tambien deja su fallo en el buzon` — prohíbe el `if (!token) return;` que callaba el reporte, y exige tanto la salida anónima a la ruta pública como el rebote desde la ruta autenticada cuando contesta 401/403.

Backend, conjunto apuntado (lo que esta secuela toca, sin arrastrar suites ajenas): `node --test test/telemetry-client-logs-public.test.js test/admin-role-capabilities.test.js test/admin-role-escalation.test.js test/admin-user-status-regression.test.js test/rbac-administrative-role.test.js` → **29/29** en verde, incluidos los 23 contratos de RBAC administrativo que comparten el módulo `admin` con la ruta nueva.

La suite API **completa** no cerró en este puesto: `node --test test/*.test.js` se quedó en 145 subpruebas sin resumen final, atascada en `apex-control/pulse.js` reintentando contra `localhost:54320` (base de datos local no levantada aquí). Es un fallo del arnés/ambiente, no del negocio, y queda declarado como deuda de medición: la certificación completa de la suite API se toma en el ambiente con base de datos arriba antes de cualquier promoción.

Suite web completa: `node --test apps/web/test/*.test.mjs` → **836 de 840**. Los cuatro rojos (`accounting-pyg-interactive`, `command-palette-module-functions`, `transport-master-access`, `transport-vehicle-master-catalogs`) leen páginas de Contabilidad, Transporte y Administración que están **idénticas a HEAD** en el árbol de trabajo; ninguno lee los archivos de este corte. Son deudas preexistentes de otros frentes, no regresión de este.

## 5. Lo que esta certificación no cubre

- **QA y Producción, columna del después.** El «antes» en QA ya está medido contra el build desplegado (§2: 167/173 con seis rojos de producto). Lo que falta es el «después»: requiere promocionar este corte a `develop`, desplegar QA y repetir la misma tanda de controles, y Producción se verifica por artefacto servido (cero chunks con `apex:alert` y el endpoint público presente en el haz), nunca con la carrera de navegador sobre datos de clientes.
- **La ruta nueva en ambiente servido.** Sin `APEXOS_TELEMETRY_TENANT_ID` en Railway, la ingesta pública responde `recorded:false` y el reporte anónimo no se guarda: la prueba de contrato está verde, la habilitación está pendiente de una autorización de infraestructura.
- **Un `window.confirm` y un `window.prompt`** que siguen en la misma pantalla (`page.tsx:852` restablecer huella, `page.tsx:549` fecha de cierre de afiliación). Son preguntas deliberadas del usuario, no avisos de fallo, y su conversión en modales de la casa quedó como pregunta de alcance en `docs/briefs/2026-11-19-fase-3-causas-del-fallo-tecnico.md` §9.
- **Las causas del 500.** Siguen vivas y acotadas en ese mismo brief; el enmudecimiento y esta secuela no curan ninguna.

## 6. Sustrato de la corrida

El `next build` de la corrida citable (`BUILD_ID yZoMVK729ogHQT7tUJ8sK`, `next start`, evidencia en `docs/qa/evidence/technical-alert-silence-20261119/validacion-build-final/`) **sí** incluye las dos ediciones que quedaron después de la primera corrida (`BUILD_ID jrcmrQ90lrqXCVofNF1ki`): retirar un `error?: string` que `SelectField` aceptaba pero ningún llamador pasaba, y limpiar el mensaje de soporte ET 114-1 al desmarcar la casilla. Esa segunda corrida volvió a dar **76/76**, así que los ocho retiros de ventanilla, el motivo dentro del campo y el reporte anónimo quedan ejercitados por el navegador y no solo por contrato.

Dos cosas se declaran para que la evidencia se lea bien:

- La primera re-intención abortó con `BLOQUEO: ventanasAntesDelFormulario is not defined` (`scripts/certifications/technical-alert-silence-browser-local.js:443-444`): el renombrado de los marcadores parejos quedó sin ajustar en el conteo de la validación de empleados. El abortó fue honesto —el arnés se puso rojo en lugar de fingir el verde—, pero `node --check` no ve una referencia inexistente, así que el arnés se corrigió y la corrida se repitió entera.
- `next build` sobre el árbol completo sigue expuesto a que un frente paralelo rompa el sustrato (ese fue el caso de `PHOTO_LOST_ESCALATION_NOTICE` sin definir en `apps/web/lib/hrOfflineMarking.ts` durante la mañana de la certificación). Esta corrida se tomó con el build ya verde.


## 6.1 Sustrato de la corrida sobre el árbol del candidato

El candidato no es `desarrollo`: es el corte replayado sobre el tip vigente de `develop` (`e3d82190` → `c9c1b2fa`), en su propio worktree. Para que la corrida significara algo sobre ese árbol y no sobre el de origen se hicieron tres cosas:

- **Dependencias:** el worktree no trae `node_modules`, así que se enlazaron los del puesto (`node_modules`, `apps/api/node_modules`, `apps/web/node_modules`) mediante junctions. Son rutas ignoradas por git y no forman parte del diff.
- **Build:** `next build --webpack` (el empaquetador predeterminado de Next 16, Turbopack, rechaza el enlace porque apunta fuera de la raíz del proyecto: `Symlink [project]/apps/web/node_modules is invalid`). Salió verde y dejó `BUILD_ID k4ilir5kgOYCDKebn_aA7`, del que se sirvió el `next start` que midió el arnés. El cambio de empaquetador no altera lo que se certifica aquí, que es el DOM servido, y queda declarado.
- **Medición:** `docs/qa/evidence/technical-alert-silence-20261119/candidato-develop/` — **78/78** con la tormenta de 500 puesta, los dos temas, el control de la ventanilla nativa (`ARNES:`), el motivo en el campo de Empleados y el control nuevo del marcador.

Los dos rojos de la suite web del candidato (`.../candidato-develop/suite-web.txt`) están atribuidos y no son de este corte:

- `la portada expone como acceso cada pantalla del modulo, incluida nomina` — le `apps/web/app/dashboard/talento-humano/page.tsx`, **blob idéntico entre `origin/develop` y el candidato**; lo que falta en `develop` es el acceso a `/dashboard/talento-humano/mallas`, deuda del frente de arquitectura de la portada, no de este.
- `react y react-dom/server salen de la misma instalacion de node_modules` — autocontrol de la instalación que solo puede fallar donde los paquetes llegan por junction, como este worktree. En el puesto (`desarrollo`) la misma prueba pasa.

Y una advertencia para quien repita la medición: `apps/web/test/ibc-nomina-ui.test.mjs` resuelve sus rutas contra `process.cwd()`. Correr la suite desde la raíz del repositorio —no desde `apps/web`, que es lo que hacen los scripts del manifiesto— puso roja esa familia completa (4 pruebas) y por poco se reporta como regresión de producto. La corrida versionada se tomó desde `apps/web`.

## 7. Rollback

Revert del commit de `desarrollo` (los seis archivos de producto y arnés). No hay migración, no hay cambio de esquema y no hay variable de ambiente obligatoria: al revertir, `reportClientFailure` vuelve a su comportamiento anterior (callado sin sesión) y la ruta pública deja de estar registrada.
