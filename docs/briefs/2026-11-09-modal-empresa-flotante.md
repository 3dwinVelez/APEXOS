# Brief — El modal Crear empresa no flota y en produccion se ve incrustado

Fecha: 2026-11-09
Rama de trabajo: `desarrollo` (partiendo de `b263fc3e`, a la par con `origin/desarrollo`)
Ambiente reportado: produccion (`main`, modulo Administracion → Suscripciones)

## Instruccion literal del duenyo

> Buen dia necesito corregir desde desarrollo la creacion de una empresa como ves la ventana no es
> flotante, y este error esta en prodctivo necesito que hagas una intervencion adecuada que pase
> todas las certificaciones para que la ventana abra de la manera correcta, lleva todos los cambios
> desde desarrollo, develop y por ultimo a main. tienes mi autorizacion para esta intervencion al
> finalizar brindame un breve resumen de lo efectuado.

La captura adjunta muestra la ventana «Crear empresa» pintada dentro del listado de empresas, sin
velo oscuro y sin centrado, en `apexos-web-prod-production.up.railway.app/dashboard/administracion/suscripciones`.

## Diagnostico

`/dashboard/administracion/suscripciones` tenia **tres dialogos inline** con
`className="fixed inset-0 z-50 ..."`: crear empresa, editar empresa e inactivar empresa. Un
descendiente `position: fixed` deja de ser relativo al viewport cuando un ancestro declara
`transform`, `filter` o `contain: paint`; el shell del dashboard anima las paginas con
`.apex-page-enter` (`transform` en el keyframe de entrada), asi que esos tres dialogos tomaban como
contenedor el bloque de la pagina y se pintaban dentro del contenido, recortados y sin velo.

El repositorio ya tiene la primitiva canonica para esto: `ModalFrame`
(`apps/web/components/ui/ModalFrame.tsx`) monta el dialogo con `createPortal` sobre `document.body`,
atrapa el foco, cierra con Escape y bloquea el scroll del fondo. El catalogo de componentes exige
`ModalFrame` y prohibe el modal propio con `fixed inset-0`. La pantalla de suscripciones era una de
las excepciones que quedaron sin migrar.

Dato adicional medido durante la certificacion: `ModalFrame` declara
`md:max-w-[calc(100vw-3rem)]` en su cadena base y concatena el `maxWidth` del llamador al final; en
la cascada de Tailwind esa utilidad arbitraria gana sobre `md:max-w-2xl`, asi que el panel salia a
1392 px sobre un viewport de 1440. El ancho se pide con `md:!max-w-*`, que es el idioma que la
propia base ya usa (`md:!max-w-6xl` en Compras e Inventario). No se toco la primitiva compartida:
cambiar su tope habria reencuadrado todos los dialogos del dashboard en una intervencion que no lo
pidio.

## Que se hizo

| # | Cambio | Ruta |
|---|---|---|
| 1 | Los tres dialogos de la pantalla pasan a `ModalFrame` con pie pegajoso; se elimina el `fixed inset-0` inline y el boton de cierre propio | `apps/web/app/dashboard/administracion/suscripciones/page.tsx` |
| 2 | Crear y editar reutilizan `CompanyFields`; el submit del pie se enlaza con `form="company-create-form"` / `form="company-edit-form"` | `apps/web/app/dashboard/administracion/suscripciones/page.tsx` |
| 3 | Ancho del panel declarado con `md:!max-w-2xl` (crear/editar) y `md:!max-w-md` (inactivar), para que la primitiva lo honre | `apps/web/app/dashboard/administracion/suscripciones/page.tsx` |
| 4 | Prueba de fuente: tres `ModalFrame`, cero `fixed inset-0`, formularios y titulos cableados | `apps/web/test/admin-company-modal-frame.test.mjs` |
| 5 | Certificacion de navegador con evidencia versionada | `apps/web/test/certify-company-modal-floating-local.mjs` |

## Alcance exacto

| Estado | Archivo | Que cambia |
|---|---|---|
| `M` | `apps/web/app/dashboard/administracion/suscripciones/page.tsx` | Tres dialogos migrados a `ModalFrame`, reutilizacion de `CompanyFields`, ancho explicito |
| `M` | `docs/project/modulos/administracion.md` | Entrada del 2026-11-09 |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Regla 28 (dialogo portado y ancho declarado con especificidad) y bump |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control 46 (certificacion de modal flotante) y bump |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Regla 39 (el defecto de capa flotante se escribe con contenedor, primitiva y ancho medido) y bump |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervencion |
| `M` | `agents/registry.json` | Version, `updated_at` y `sha256` de los dos agentes |
| `A` | `apps/web/test/admin-company-modal-frame.test.mjs` | Prueba de fuente del modal |
| `A` | `apps/web/test/certify-company-modal-floating-local.mjs` | Certificacion de navegador |
| `A` | `docs/qa/evidence/modal-empresa-flotante-20261109/modal-empresa-flotante-local.json` | Evidencia con 16 comprobaciones |
| `A` | `docs/qa/evidence/modal-empresa-flotante-20261109/company-modal-light.png` | Captura en tema claro |
| `A` | `docs/qa/evidence/modal-empresa-flotante-20261109/company-modal-dark.png` | Captura en tema oscuro |
| `A` | `docs/briefs/2026-11-09-modal-empresa-flotante.md` | Este brief |

### Modulos (`change_intent.modules`)

- `administracion`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## Fuera de alcance

- `apps/web/components/ui/ModalFrame.tsx`: su tope base no se toca; el ancho se pide desde la
  pantalla. Corregir la primitiva reencuadra decenas de dialogos y merece su propia intervencion.
- `apps/api/**`: el alta de empresa no cambia; el fallo es de capa visual.
- Migraciones, Railway, Supabase y variables de entorno.
- La certificacion cubre la apertura, el centrado, el foco, el tema y el cierre del modal; no crea
  una empresa real contra la nube (el stub del borde responde con la data minima de la pantalla).

## Criterios de aceptacion

1. `node --test apps/web/test/admin-company-modal-frame.test.mjs` → 2/2.
2. `node apps/web/test/certify-company-modal-floating-local.mjs` → 16/16 con
   `status: "passed"` en `docs/qa/evidence/modal-empresa-flotante-20261109/`.
3. En 1440x900 el dialogo se monta sobre `document.body`, mide 672 px de ancho, queda centrado
   (`centeredX = 0`, `centeredY = 0`), el velo cubre 1440x900 y el fondo no hace scroll.
4. Escape cierra y devuelve el foco al disparador; el modal conserva su posicion con la pagina
   desplazada (`scrollAlAbrir = 92`, mismo `top`).
5. Tema claro y oscuro medidos por pintura: `rgb(255,255,255)` y `rgb(23,35,45)` con contraste
   14,59:1.
6. `npm run lint`, typecheck y build del workspace `apps/web` en verde.

## Evidencia y certificacion exigida

- Pruebas: `apps/web/test/admin-company-modal-frame.test.mjs`
- Certificacion: `node apps/web/test/certify-company-modal-floating-local.mjs`
- Evidencia: `docs/qa/evidence/modal-empresa-flotante-20261109/`
- `certification_status`: `local_passed_qa_pending`

## Capacidades protegidas

- Abrir el alta de empresa desde el listado — cubierto por `el_modal_abre_como_dialogo` y
  `el_modal_se_porta_al_body`.
- Cerrar sin guardar (Cancelar y Escape) — `cancelar_cierra_el_modal`,
  `escape_cierra_y_devuelve_el_foco`.
- Legibilidad en ambos temas — `el_modal_pinta_la_superficie_clara`,
  `el_modal_respeta_el_tema_oscuro`.
- No recortar el formulario en un viewport bajo — `el_modal_no_se_recorta`,
  `el_modal_abre_como_panel_acotado`.

## Riesgos y rollback

- Riesgo: la pantalla de suscripciones depende de la API de plataforma para las demas tarjetas; el
  cambio solo toca la capa de dialogos. Mitigacion: la certificacion mide la pantalla real con data
  del stub. Rollback: `git revert` del commit de la intervencion.
- Riesgo: el tope de ancho se pide con `!` y convive con la base de `ModalFrame`. Mitigacion: el
  check `el_modal_abre_como_panel_acotado` fija la medida (600-760 px) y falla si el panel vuelve a
  salir a pantalla completa.

## Supuestos y preguntas abiertas

- Supuesto: el defecto reportado en produccion corresponde al mismo markup de `main`; la pantalla no
  cambio entre `develop` y `main` desde la ultima promocion del modulo.
- Pregunta: ninguna que altere el alcance.

## Autorizaciones requeridas

- [x] Intervencion completa `desarrollo -> develop -> main` autorizada por el propietario en el
      prompt del 2026-11-09.

## Documentacion, agentes y publicacion (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/web/app/dashboard/administracion/suscripciones/page.tsx apps/web/test/admin-company-modal-frame.test.mjs apps/web/test/certify-company-modal-floating-local.mjs docs/qa/evidence/modal-empresa-flotante-20261109"` → `OK_CON_ADVERTENCIAS`, agentes requeridos `equipo-apexos`, `apexos-frontend`, `apexos-qa`.
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-qa`.
- **Documentacion a actualizar**: este brief y `docs/project/modulos/administracion.md`.
- **Agentes a actualizar**: `apexos-frontend` 2.12.0 → 2.13.0 (regla 28);
  `apexos-qa` 2.32.0 → 2.33.0 (control 46); `apexos-brief` 2.25.0 → 2.26.0 (regla 39).
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en
  `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage` en verde para las rutas tocadas.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run test:agents`
  → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la seccion 6 → commit.
- **Publicacion obligatoria**: `git push origin desarrollo`.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentacion y agentes actualizados en el mismo commit
