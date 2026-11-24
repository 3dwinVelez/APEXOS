# Certificación — Secuela del enmudecimiento: validación en línea y reporte sin sesión (2026-11-19)

- **Rama certificada:** `desarrollo` (corte `9838f6af`) y, después, el **candidato a `develop`** replayado punta a punta sobre `e3d82190` (commit `c9c1b2fa` del candidato), el **candidato a `main`** replayado sobre `f207140d` (`6b749418`, aterrizado en `main` como el merge puntual `34674cac`) y el **corte de cero ventanillas** `bede369c` en `desarrollo` (§2.5)
- **Ambiente:** puesto local, `next start` de producción sobre `apps/web/.next` con la API deliberadamente apagada; más la verificación por sonda sobre los ambientes servidos (QA y Producción)
- **Artefacto de evidencia citable para la promoción:** `docs/qa/evidence/technical-alert-silence-20261119/candidato-develop/` (corrida sobre el árbol del candidato, **78/78**, `BUILD_ID k4ilir5kgOYCDKebn_aA7`). La corrida homóloga sobre el build de `desarrollo` quedó en `docs/qa/evidence/technical-alert-silence-20261119/validacion-build-final/` (76/76) y se conserva como antecedente; la repetición del arnés nuevo contra ese mismo build de `desarrollo` está en `.../mismo-arnes-build-desarrollo/` (78/78). El **después en el ambiente servido** está en `.../qa-despues-secuela/` (**174/174** sobre `7e02008a555b`, §2.1), la prueba del buzón anónimo encendido en `.../qa-buzon-sonda.txt` (§2.2) y la **pata main** —replay, equivalencia por blob, suites y certificación en navegador sobre su propio build— en `.../main-20261120/` (§2.3), y **Producción después del despliegue** en `.../prod-20261120/` (§2.4); el **corte de cero ventanillas** sobre su propio build está en `.../cero-ventanillas-empleados/` (**79/79**, §2.5).
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
| **Suite web completa sobre el árbol del candidato** | — | **834 de 836**; los dos rojos son ajenos y están atribuidos en §6 |
| Suites API apuntadas sobre el árbol del candidato | — | **29/29** (6 de la boca pública + 23 de RBAC administrativo del módulo `admin`) |
| **QA desplegado, misma tanda de controles** | **167/173: 6 rojos, todos de producto** | **174/174 en verde** sobre el ambiente que ya corre `7e02008a555b` |
| **Certificación local sobre el build de la pata main** | no medible: el arnés solo había corrido sobre `desarrollo` y sobre el candidato de `develop` | **78/78** (`.../main-20261120/`, `BUILD_ID GWiQsW-qSguoj2peqeCoA`) |
| **Producción servida, columna del después** | no medido sobre el ambiente | **`health.commit 34674cac29b3`**, `apex:alert` en **0 de 10** chunks, buzón anónimo `202 recorded:true` con la fila de sondeo escrita en el tenant de la plataforma y borrada (`.../prod-20261120/`) |
| **Certificación local sobre el corte de cero ventanillas (`bede369c`)** | el barrido del arnés solo miraba `alert` | **79/79** (`.../cero-ventanillas-empleados/`, `BUILD_ID L2qD4tF_hhOtd5lXKIqgF`), con el control de contraste que exige ver `confirm` y `prompt` donde existen |

La columna del antes en QA (`docs/qa/evidence/technical-alert-silence-20261119/qa-antes-secuela/`) se tomó contra lo que el ambiente sirve hoy (API `9953527a78bd`, cero chunks con `apex:alert`), así que mide **los huecos de esta secuela** y no los de la fase previa. Los seis rojos son `nyvora_admin_validacion_motivo_en_el_campo`, `..._campo_marcado_como_invalido` y `..._sin_ventanilla_nativa` —la evidencia registra el `alert` «Completa nombres y apellidos para generar el nombre completo.» con `invalidFields: 0`— y `la_boca_publica_existe_en_qa`, `la_boca_publica_responde_honesto`, `el_buzon_publico_pide_configuracion_sin_fingir_exito`, porque QA responde `404 Route POST:/api/v1/public/telemetry/client-logs not found`.

Antes de esa corrida citable hubo una primera pasada con **12 rojos** (`.../qa-antes-marcador-viejo/`): seis de ellos eran del instrumento, no del producto. `*_rutas_pantalla_viva` exigía las leyendas «Asignar horarios»/«Consulta de horarios» de `desarrollo`/`main` (blob `dff6265f`) sobre un `develop` desplegado que pinta «Horarios y mallas»/«Programación de jornadas» (blob `2e95b48c`), con la pantalla efectivamente montada. El marcador acepta hoy las cuatro leyendas y **el poder discriminatorio quedó medido, no afirmado** (§3.1); la diferencia entre las dos pasadas (12 → 6, solo los de producto) es la prueba de que el cambio de marcador no tapó nada.

### 2.1 El después en QA: 174/174 sobre el ambiente que ya corre el corte

Promocionado el corte a `develop` (merge `7e02008a`, PR #102) y re-desplegados los dos servicios de QA, la misma tanda de controles se repitió contra el ambiente servido:

```
node scripts/certifications/technical-alert-silence-browser-qa.js \
  --output docs/qa/evidence/technical-alert-silence-20261119/qa-despues-secuela \
  --expected-commit 7e02008a --env-file <config/qa.env del puesto>
VEREDICTO QA 174/174 · CERTIFICACION QA APROBADA: el fallo tecnico no es ventana en NYVORA ni en Diana vargas
```

- **`build_desplegado_es_el_evaluado` en verde** (`/health` = `7e02008a555b`): es el control extra que hace que el total pase de 173 a 174, y existe para que nadie vuelva a medir QA creyendo medir otra cosa.
- Los seis rojos del antes están verdes: `nyvora_admin_validacion_motivo_en_el_campo`, `..._campo_marcado_como_invalido` y `..._sin_ventanilla_nativa` (la validación se pinta en el campo y ninguna ventanilla nativa se levantó en las 12 visitas con la tormenta puesta) y `la_boca_publica_existe_en_qa`, `la_boca_publica_responde_honesto`, `el_buzon_publico_pide_configuracion_sin_fingir_exito` (`202 {"recorded":false,"reason":"BUZON_TELEMETRIA_NO_CONFIGURADO"}`).
- Los tres usuarios efímeros de la corrida (`qa.silence.*.20261120045242@silence-qa.test`) quedaron desactivados por el propio arnés. De la boca pública **no se escribió ninguna fila** en esta corrida (el despliegue aún no tenía buzón), y el canal autenticado dejó sus 75 registros de siempre en `platform_logs` de la empresa modelo: la ausencia de ventanas no cambió nada del registro técnico.

### 2.2 El buzón anónimo encendido en QA: se escribió, no usó el tenant del cuerpo y se borró

Configurado `APEXOS_TELEMETRY_TENANT_ID = e8fac747-e410-41dd-8784-2c0ca71660e8` (Empresa Demo APEX-OS, el tenant de la plataforma en QA) en el servicio `apexos-api-qa` y re-desplegado, la sonda de artefacto volvió a POSTear a la ruta pública **con llaves hostiles en el cuerpo** (`tenant_id` de otra empresa, `user_email`, `authorization`) y leyó el registro por base:

```
sonda_publica: { "status": 202, "payload": { "recorded": true } }
registro:      { "encontrada": true,
                 "tenant_registrado": "e8fac747-e410-41dd-8784-2c0ca71660e8",
                 "lleve_llaves_hostiles": false, "borrada": 1 }
```

Es la mitad que el contrato de `node --test` no puede medir sola: que el `recorded:true` se corresponde con una fila real en el buzón del despliegue, que esa fila **no** quedó en el tenant que el atacante puso en el cuerpo y que el `user_email` sembrado no viajó dentro del `new_value`. La fila de la sonda se elimina después de leerla (`borrada: 1`), así que la prueba no deja basura técnica en QA. Salida completa en `docs/qa/evidence/technical-alert-silence-20261119/qa-buzon-sonda.txt`.

La verificación por haz sigue barrida en la misma sonda: `apex_alert_chunks: []` sobre los 10 chunks que `/login` referencia. Se declara su límite para que la evidencia se lea bien —el barrido de `apex:alert` es válido porque esa cadena vive en el canal de alertas que el login sí importa, pero `CLIENT_LOG_PUBLIC_ENDPOINT` está en un chunk del árbol de dashboard que `/login` no carga, así que la presencia de la boca pública se prueba con el `POST` anterior y no con el barrido.

### 2.3 La pata main: el mismo arnés corrido sobre el binario que se despliega

`main` no recibe un merge de `develop`: `main..develop` trae frentes ajenos (el maestro de bancos y la portada de Talento Humano). El candidato es el replay puntual del corte certificado sobre el tip vigente de `main` (`f207140d`), en su propia worktree, y la equivalencia quedó medida blob por blob en `docs/qa/evidence/technical-alert-silence-20261119/main-20261120/equivalencia-blob-main-develop.txt`:

- **63 de las 69 rutas son idénticas a `origin/develop`**, o sea al árbol que QA midió 174/174.
- Las cinco de documentación y evidencia distintas son posteriores a la fusión `7e02008a` (el «después» en QA y la sonda del buzón): no tienen contraparte que equivaler en `develop`.
- La única ruta de **código** distinta es `empleados/page.tsx`, y no lo es por este corte: el hunkeo es exactamente el mismo en las dos patas (44 líneas agregadas / 28 retiradas, conjuntos de líneas `+`/`-` idénticos, cero líneas aportadas solo por el lado de main). Lo que falta son 21 líneas del maestro de bancos, de otro frente, que no viajan.
- Control en el sentido contrario: de la tajada certificada en `develop` solo quedan fuera del inventario los dos manifiestos de la puerta a `develop`, que son el contrato de esa promoción y no de esta.

Y sobre ese árbol —no sobre el de origen— se volvió a medir todo, con el sustrato declarado en `.../main-20261120/soporte.txt`:

```
next build --webpack .................................................... verde, BUILD_ID GWiQsW-qSguoj2peqeCoA
certify:technical-alerts-silence:local (next start, API apagada) ........ 78/78
apps/web/test/technical-alert-silence.test.mjs + hr-monitor-refresh ..... 17/17
apps/api: boca pública + 4 suites de RBAC administrativo ............... 29/29
node --test apps/web/test/*.test.mjs (desde apps/web) .................. 831 de 832
```

El rojo de la suite web es el autocontrol `react y react-dom/server salen de la misma instalacion de node_modules`, que solo puede fallar donde los paquetes llegan por junction como este worktree; en el puesto pasa. La certificación local 78/78 cierra la deuda que la intervención del 2026-11-19 había declarado de medir el arnés sobre el árbol de `main`: el binario que se despliega es el que se midió, no uno equivalente por construcción.

### 2.4 El después en Producción: qué sirve el ambiente, medido sobre el ambiente

`main` corre `34674cac` y Railway desplegó las dos servicios (`apexos-web-prod` `2f39a480-eb81-49a0-adf7-b265b4cefc09`, `apexos-api-prod` `7375dfb6-6bfe-46d9-84b4-aee703e5f99d`). El CI de la rama cerró `completed / success` sobre ese mismo SHA, incluido el `Git Governance Guard`. La verificación posterior al despliegue está en `docs/qa/evidence/technical-alert-silence-20261119/prod-20261120/` y se corrió **dos veces con el mismo resultado** (sondeos `20261120053956` y `20261120054105`):

```
health.commit ................................................... 34674cac29b3   (no es inferencia: lo dice el servicio)
apex:alert en los chunks servidos ............................... 0 de 10 (629,263 bytes leidos)
apex:diagnostic en los chunks servidos .......................... presente (el opt-in sigue publicado)
POST /api/v1/public/telemetry/client-logs sin sesion ............ 202 { recorded: true }
tenant donde cae la fila de sondeo .............................. 52db0658-a184-4fa1-a47b-c90b184914c3 (APEXOS Platform)
fila de sondeo borrada al salir .................................. 1
llaves hostiles en el registro (tenant_id/user_email/authorization) false
```

Tres lecturas que vale la pena separar. Que `apex:alert` no aparezca en ningún chunk publicado distingue esto de un simple ocultado en pantalla: la ventana ya no está en el binario. Que `apex:diagnostic` sí aparezca prueba lo contrario de un borrado: el camino de diagnóstico sigue servido y se activa con `localStorage.apexos_diagnostics = "1"`. Y que el reporte anónimo responda `202 recorded:true` con la fila cayendo en el buzón de la plataforma y no en el de un cliente es la mitad que en QA se había medido contra el tenant demo (§2.2) y que aquí se mide contra el ambiente real, con la misma sonda autolimpiable.

El límite de esta columna se declara para que no se confunda con una certificación de navegador: **no se corrió la tanda de 174 controles contra Producción**, porque eso exige iniciar sesión y manipular el expediente de clientes reales. Esa tanda se corrió contra el ambiente QA (`7e02008a555b`, 174/174 con la empresa modelo NYVORA) y contra el binario de la pata `main` en puesto local (78/78).

### 2.5 El corte de cero ventanillas, medido sobre su propio binario

El corte que retiró las dos ventanillas que quedaban en Empleados (el `prompt` de fecha del cierre de
afiliación y el `confirm` de restablecer huella) se certificó sobre su propio árbol, no de rebote sobre
otro: `bede369c` en `desarrollo`, `npm run build` y `next start`, veredicto **79/79** con 0 ventanillas
nativas en toda la corrida y 78 reportes de telemetría salientes. Que el binario servido era el del corte
se comprueba por artefacto y no por fe: el chunk `.next/static/chunks/2hwtl1y4-wxrq.js` contiene la cadena
`Fecha final de vigencia` y tiene **0** coincidencias de `window.prompt` / `window.confirm`.

El arnés también cambió, y ese es el motivo del 79. La comprobación de código sobre la pantalla barría solo
`alert(` —justo la función que este corte no tocaba: aquí las que se fueron fueron `prompt` y `confirm`—, así
que podía seguir verde aunque volviera un cuadro de pregunta. Ahora barre las tres ventanillas
(`alert|confirm|prompt`, con y sin prefijo `window.`/`globalThis.`) y **se auto-verifica** contra un fixture
que sí las contiene (`el_barrido_del_arnes_detecta_las_ventanillas_que_dice_detectar`), que es la misma
disciplina que ya costó dos controles podridos en esta familia (§3.1). El chequeo nuevo añade una
comprobación, no cambia comportamiento: por eso la cuenta pasa de 78 a 79 y el resto de la tanda queda
comparable con las corridas anteriores.

Sustrato y límite, declarados en `docs/qa/evidence/technical-alert-silence-20261119/cero-ventanillas-empleados/lectura.txt`:

- El build corrió en el árbol principal y no en una worktree puntual porque **la worktree causó un incidente
  durante esta corrida**: al copiar `node_modules` para aislar el corte, los enlaces `@apex-os/{web,api,types}`
  —que llevan ruta absoluta al árbol principal— fueron seguidos por `git worktree remove --force` y barreron
  **1.173 archivos rastreados** más tres paquetes vaciados. Todo volvió: `git checkout HEAD -- apps packages`
  devolvió los 1.173 byte a byte (estaban limpios), los paquetes se restauraron con `npm pack` + `tar -xzf` en
  sus versiones exactas del lockfile y la verificación final quedó en 0 paquetes sin `package.json` sobre 814
  inspeccionados. Antes de construir se volvió a comprobar que el árbol era el del commit (`--deleted` = 0,
  `--untracked-files=no` = 0). Este evento es además la causa que faltaba del barrido del 2026-11-18
  (1.161 archivos, registrado como «causa nunca identificada»); la lección quedó versionada en la regla 40 de
  `apexos-git-guardian`.
- Lo que esta corrida **no** ejercitó: el cierre de vigencia y el restablecimiento de huella como flujos
  completos. El arnés local corre con la API caída por diseño y no fabrica una afiliación activa ni un
  empleado con huella registrada, así que no hay fila sobre la cual escribir la fecha. Lo medido es la
  ausencia de ventanillas y el contrato de código; la columna en navegador de esos dos controles se toma con
  la promoción en QA, donde el dato real existe.

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

- **La tanda completa de controles de navegador sobre Producción, no —y por diseño.** Correrla exigiría iniciar sesión y manipular expedientes de clientes reales. Lo que sí se tomó sobre el ambiente servido es la verificación que el despliegue puede cambiar y el arnés local no ve: qué chunks publicaba Railway y en qué tenant escribía la boca anónima (§2.4: `health.commit 34674cac29b3`, `apex:alert` en 0 de 10 chunks, `202 recorded:true` con la fila de sondeo borrada al salir). La tanda de 174 controles se corrió contra QA y la de 78 contra el binario de la pata `main`.
- **Un `window.confirm` y un `window.prompt`** que siguen en la misma pantalla (`page.tsx:852` restablecer huella, `page.tsx:549` fecha de cierre de afiliación). Son preguntas deliberadas del usuario, no avisos de fallo, y su conversión en modales de la casa quedó como pregunta de alcance en `docs/briefs/2026-11-19-fase-3-causas-del-fallo-tecnico.md` §9.
  *(Cerrado el 2026-11-20 con `bede369c`: ninguno se convirtió en modal de la casa —la promesa era dejar de tapar la pantalla—; la fecha se escribe en un control de fecha dentro de la propia fila y la huella se confirma en dos clics. Lo que sigue sin cubrir esta certificación es el flujo en navegador de esos dos controles, porque el arnés local corre con la API caída y no fabrica afiliaciones ni huellas: ver §2.5 y el veredicto **79/79** en `.../cero-ventanillas-empleados/`.)*
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
