# Certificación — Secuela del enmudecimiento: validación en línea y reporte sin sesión (2026-11-19)

- **Rama certificada:** `desarrollo`
- **Ambiente:** puesto local, `next start` de producción sobre `apps/web/.next` con la API deliberadamente apagada
- **Artefacto de evidencia:** `docs/qa/evidence/technical-alert-silence-20261119/validacion-build-final/` (corrida citable, 76/76). La corrida homóloga sobre el build anterior quedó en `docs/qa/evidence/technical-alert-silence-20261119/formularios/` y se conserva como antecedente.
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
| Comprobaciones del certificador local | 68 | **76** |
| Veredicto | 68/68 | **76/76** |
| Reporte de fallo con `token` ausente | se descartaba en silencio (`if (!token) return;`) | viaja a `POST /api/v1/public/telemetry/client-logs` |
| Dónde cae el reporte anónimo | no había dónde | buzón del despliegue (`APEXOS_TELEMETRY_TENANT_ID`) o `202 recorded:false` |
| **QA desplegado, misma tanda de controles** (173) | **167/173: 6 rojos, todos de producto** | se remide tras la promoción (#19) |

La columna del antes en QA (`docs/qa/evidence/technical-alert-silence-20261119/qa-antes-secuela/`) se tomó contra lo que el ambiente sirve hoy (API `9953527a78bd`, cero chunks con `apex:alert`), así que mide **los huecos de esta secuela** y no los de la fase previa. Los seis rojos son `nyvora_admin_validacion_motivo_en_el_campo`, `..._campo_marcado_como_invalido` y `..._sin_ventanilla_nativa` —la evidencia registra el `alert` «Completa nombres y apellidos para generar el nombre completo.» con `invalidFields: 0`— y `la_boca_publica_existe_en_qa`, `la_boca_publica_responde_honesto`, `el_buzon_publico_pide_configuracion_sin_fingir_exito`, porque QA responde `404 Route POST:/api/v1/public/telemetry/client-logs not found`.

Antes de esa corrida citable hubo una primera pasada con **12 rojos** (`.../qa-antes-marcador-viejo/`): seis de ellos eran del instrumento, no del producto. `*_rutas_pantalla_viva` exigía las leyendas «Asignar horarios»/«Consulta de horarios» de `desarrollo`/`main` (blob `dff6265f`) sobre un `develop` desplegado que pinta «Horarios y mallas»/«Programación de jornadas» (blob `2e95b48c`), con la pantalla efectivamente montada. El marcador acepta hoy las cuatro leyendas y conserva el poder discriminatorio —ni el guard de acceso ni el cascarón del shell contienen ninguna—; la diferencia entre las dos pasadas (12 → 6, solo los de producto) es la prueba de que el cambio de marcador no tapó nada.

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


## 7. Rollback

Revert del commit de `desarrollo` (los seis archivos de producto y arnés). No hay migración, no hay cambio de esquema y no hay variable de ambiente obligatoria: al revertir, `reportClientFailure` vuelve a su comportamiento anterior (callado sin sesión) y la ruta pública deja de estar registrada.
