# Certificación — Secuela del enmudecimiento: validación en línea y reporte sin sesión (2026-11-19)

- **Rama certificada:** `desarrollo`
- **Ambiente:** puesto local, `next start` de producción sobre `apps/web/.next` con la API deliberadamente apagada
- **Artefacto de evidencia:** `docs/qa/evidence/technical-alert-silence-20261119/formularios/`
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

- **QA y Producción.** El código vive en `desarrollo`; no se promocionó ni se desplegó. Las ventanillas de esos ambientes se remiden contra el build desplegado cuando el dueño autorice la promoción.
- **La ruta nueva en ambiente servido.** Sin `APEXOS_TELEMETRY_TENANT_ID` en Railway, la ingesta pública responde `recorded:false` y el reporte anónimo no se guarda: la prueba de contrato está verde, la habilitación está pendiente de una autorización de infraestructura.
- **Un `window.confirm` y un `window.prompt`** que siguen en la misma pantalla (`page.tsx:852` restablecer huella, `page.tsx:549` fecha de cierre de afiliación). Son preguntas deliberadas del usuario, no avisos de fallo, y su conversión en modales de la casa quedó como pregunta de alcance en `docs/briefs/2026-11-19-fase-3-causas-del-fallo-tecnico.md` §9.
- **Las causas del 500.** Siguen vivas y acotadas en ese mismo brief; el enmudecimiento y esta secuela no curan ninguna.

## 6. Sustrato de la corrida

El `next build` del momento de la certificación (`BUILD_ID jrcmrQ90lrqXCVofNF1ki`) incluye los ocho retiros de `window.alert` y el reruteo del reporte. Después de esa corrida quedaron dos ediciones menores en el mismo archivo, declaradas aquí para que la evidencia no se lea como si cubiera algo que no cubre: retirar un `error?: string` que `SelectField` aceptaba pero ningún llamador pasaba (salida del DOM idéntica, porque el parámetro nunca tenía valor) y limpiar el mensaje de soporte ET 114-1 al desmarcar la casilla. Las dos quedaron cubiertas por contrato versionado (`corregir el dato limpia el motivo en linea`, en `apps/web/test/technical-alert-silence.test.mjs`), que es lo que falta cuando el navegador aún no las ejercita. Reintentar la corrida contra un build que ya las incluya sigue pendiente: al cerrar esta intervención, `apps/web/lib/hrOfflineMarking.ts` referencia `PHOTO_LOST_ESCALATION_NOTICE` sin definir —trabajo en curso de otro frente sobre el mismo árbol— y `next build` está rojo por esa causa, no por esta.

## 7. Rollback

Revert del commit de `desarrollo` (los seis archivos de producto y arnés). No hay migración, no hay cambio de esquema y no hay variable de ambiente obligatoria: al revertir, `reportClientFailure` vuelve a su comportamiento anterior (callado sin sesión) y la ruta pública deja de estar registrada.
