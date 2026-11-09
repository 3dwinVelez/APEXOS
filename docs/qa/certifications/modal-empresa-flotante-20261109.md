# Certificacion — La ventana «Crear empresa» flota en un panel acotado — 2026-11-09

Cambio: `modal-empresa-flotante-20261109`
Candidato: `codex/qa-modal-empresa-flotante-20261109`, commit funcional sobre
`origin/develop 6edf85c7` (el primero de la rama auxiliar; su sha lo fija el manifiesto de alcance,
porque ningun archivo puede llevar el sha del commit que lo contiene).
Origen del contenido: el mismo arbol que se publico en `origin/desarrollo` (commit `dbc3cf9b`),
recortado a las rutas de producto, prueba y evidencia.

## El defecto medido

`/dashboard/administracion/suscripciones` pintaba sus tres dialogos (crear, editar e inactivar
empresa) con `className="fixed inset-0 z-50 …"` dentro del arbol de la pagina. El shell del
dashboard anima cada pagina con `.apex-page-enter`, cuyo keyframe declara `transform`; un
`position: fixed` bajo un ancestro transformado toma como bloque contenedor ese ancestro, no el
viewport. Resultado en produccion: la ventana se pintaba dentro del listado, recortada y sin velo,
tal como llego en la captura del propietario.

Ademas del contenedor habia un defecto de ancho: `ModalFrame` trae
`md:max-w-[calc(100vw-3rem)]` en su cadena base y concatena el `maxWidth` del llamador al final, y
esa utilidad arbitraria gana la cascada sobre `md:max-w-2xl`. La primera version del candidato,
portada pero sin tocar el ancho, medía **1392 px sobre un viewport de 1440** y pasaba todos los
checks anteriores. El ancho se pide con `md:!max-w-2xl` (crear y editar) y `md:!max-w-md`
(confirmacion), que es el idioma que ya usan Compras e Inventario.

## Que se lleva

Inventario medido del commit funcional del candidato (`git show --numstat` sobre el primer commit de
la rama auxiliar):

| Archivo | + | - | Naturaleza |
|---|---|---|---|
| `apps/web/app/dashboard/administracion/suscripciones/page.tsx` | 83 | 164 | tres dialogos pasan a `ModalFrame`; crear/editar comparten `CompanyFields`; submit del pie por `form=`; ancho explicito |
| `apps/web/test/admin-company-modal-frame.test.mjs` | 25 | 0 | prueba de fuente: tres marcos, cero `fixed inset-0`, formularios y titulos cableados |
| `apps/web/test/certify-company-modal-floating-local.mjs` | 313 | 0 | certificacion de navegador con stub de Supabase REST y `next dev` aislado |
| `docs/project/modulos/administracion.md` | 1 | 0 | entrada 2026-11-09 del modulo |
| `docs/qa/evidence/modal-empresa-flotante-20261109/modal-empresa-flotante-local.json` | 157 | 0 | 16 comprobaciones, `status: passed`, sin rutas locales ni credenciales |
| `docs/qa/evidence/modal-empresa-flotante-20261109/company-modal-light.png` | bin | — | captura del panel en tema claro |
| `docs/qa/evidence/modal-empresa-flotante-20261109/company-modal-dark.png` | bin | — | captura del panel en tema oscuro |

Cero archivos eliminados. Los `-` de la pagina son el markup duplicado de los tres dialogos
inline, el contenedor `max-h-[70vh] overflow-y-auto` que ahora administra el marco y el boton `X`
propio que trae `ModalFrame`.

## Que se midio en el navegador (16/16)

`node apps/web/test/certify-company-modal-floating-local.mjs` sobre `next dev` aislado, viewport
1440x900, con un borde Supabase simulado que sirve `platform_admins` activo y `v_user_companies`
(sin esa fila `RouteAccessGuard` corta antes de montar la pantalla):

| Gate | Medida |
|---|---|
| `el_modal_se_porta_al_body` | `portaled: true`, `insideTransition: false`, `insideMain: false` |
| `el_velo_cubre_toda_la_ventana` | rectangulo 0,0,1440,900, `rgba(10, 10, 10, 0.55)` |
| `el_modal_flota_centrado_en_el_viewport` | `x 384`, `width 672`, `centeredX 0`, `centeredY 0` |
| `el_modal_no_se_recorta` | `top 36`, `bottom 864`, `right 1056`, `scrollOverflow 0` |
| `el_modal_abre_como_panel_acotado` | `width 672` sobre viewport 1440 (600-760 y menor que `vw-200`) |
| `el_fondo_bloquea_el_scroll` | `bodyOverflow: hidden` |
| `el_foco_se_mantiene_al_escribir` | `value AB`, `focused true` |
| `escape_cierra_y_devuelve_el_foco` | foco devuelto al disparador, overflow restaurado |
| `el_modal_conserva_la_posicion_con_la_pagina_desplazada` | `top 36` con `scrollY 92` y `top 36` arriba del todo |
| `el_modal_pinta_la_superficie_clara` | `rgb(255, 255, 255)` |
| `el_modal_respeta_el_tema_oscuro` | `rgb(23, 35, 45)` con tinta `rgb(242, 245, 247)`, contraste 14,59:1 |
| `cancelar_cierra_el_modal` | cerrado |

Dos trampas del arnes quedaron registradas en el script: afirmar que `scrollY` no cambia al abrir
falla siempre porque `body { overflow: hidden }` recorta el maximo de scroll (artefacto, no
producto), y la captura clara exige fijar `apex_theme` antes de navegar porque la app restaura el
tema persistido en el primer render.

## Que NO cubre este candidato

- No toca `ModalFrame`: el tope base de la primitiva compartida sigue igual. Corregirlo reencuadra
  todos los dialogos del panel y merece su propio manifiesto.
- No toca `apps/api/**`, migraciones, Railway ni Supabase.
- No crea una empresa real contra la nube: el stub del borde responde la data minima de la pantalla
  y el flujo certificado es la apertura, el foco, el tema y el cierre del panel.
- La verificacion visual en produccion depende del despliegue de `main`; se declara aparte en el
  cierre de la promocion.

## Puertas de la promocion

- `npm run qa:promotion:scope -- docs/qa/manifests/modal-empresa-flotante-20261109-scope.json codex/qa-modal-empresa-flotante-20261109 origin/develop`
- `npm run qa:preqa:evidence -- docs/qa/manifests/modal-empresa-flotante-20261109-preqa.json`

El resultado de ambas se guarda en
`docs/qa/evidence/modal-empresa-flotante-20261109/gates-candidato.txt`.
