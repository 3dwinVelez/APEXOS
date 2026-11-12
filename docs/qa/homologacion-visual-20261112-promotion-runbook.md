# Runbook de promocion — capa visual homologada 2026-11-12

Cambio: `homologacion-visual-20261112`
Estado: **paquete listo, promocion NO ejecutada**. Solo el propietario autoriza el paso a `develop` (QA).
Flujo permitido: `desarrollo -> develop -> main`. Esta promocion cubre unicamente `desarrollo -> develop`.
Nunca autoriza `main`, despliegues, migraciones remotas ni cambios de infraestructura.

## Artefactos versionados

| Artefacto | Ruta |
|---|---|
| Rama candidata (local, sin push) | `codex/qa-capa-visual-20261112` = `8ba301c0db7bd272fac6ab21a78384a290ba2409` |
| Base del destino | `origin/develop` = `3595a9bbca239fbf0ff7e186aa765e22700f7420` |
| Alcance exacto (schema 2) | `docs/qa/manifests/homologacion-visual-20261112-scope.json` |
| Evidencia pre-QA | `docs/qa/manifests/homologacion-visual-20261112-preqa.json` |
| Certificacion | `docs/qa/certifications/homologacion-visual-20261112.md` |
| Brief de alcance | `docs/briefs/2026-11-12-homologacion-visual-qa.md` |
| Evidencia funcional | `docs/qa/evidence/homologacion-visual-candidate-20261112/` |
| Certificadores | `scripts/certifications/visual-homologation-browser.cjs`, `scripts/certifications/visual-homologation-regression.cjs`, `scripts/certifications/visual-homologation-known-failures.json` |

El diff del candidato es exacto: 100 rutas (79 A / 21 M / 0 D), todas bajo `apps/web/**`,
`docs/design/AUDITORIA_VISUAL.md` o `docs/qa/evidence/visual-homologation-20261112/**`.
`allowed_deletions` esta vacio y debe seguir vacio.

## Compuertas — estado medido

```bash
# 1. Alcance de promocion: PASSED
npm run qa:promotion:scope -- docs/qa/manifests/homologacion-visual-20261112-scope.json \
  codex/qa-capa-visual-20261112 origin/develop
# ALCANCE DE PROMOCION VALIDO: homologacion-visual-20261112 (100 rutas)

# 2. Evidencia pre-QA: BLOQUEADA solo por autorizacion (exit 1)
npm run qa:preqa:evidence -- docs/qa/manifests/homologacion-visual-20261112-preqa.json
# AUTORIZACION PRE-QA BLOQUEADA
# - approval.status debe ser approved
# - la autorizacion pre-QA requiere responsable y fecha
```

Ninguna otra condicion falla: evidencia existente, scripts versionados, checks funcionales, regresion y
`environment: LOCAL` ya estan en verde. El manifiesto nace con `approval.status: "pending"` por diseño.

## Cuando el propietario autorice

1. Registrar la autorizacion en `docs/qa/manifests/homologacion-visual-20261112-preqa.json`:
   `approval.status: "approved"`, `approved_by` y `approved_at` (responsable y fecha reales). No cambiar
   `qa_status: "pending"`; esa marca la consume QA.
2. Repetir `npm run qa:preqa:evidence -- docs/qa/manifests/homologacion-visual-20261112-preqa.json`
   hasta `AUTORIZACION PRE-QA VALIDA: homologacion-visual-20261112`.
3. Integrar el candidato en `develop` **por merge, sin squash ni force push**, y comprobar que el commit
   integrado contiene exactamente el inventario del manifiesto de alcance.
4. Publicar `desarrollo` con el paquete documental (reporte, manifiestos, evidencia, brief y agentes).
5. Desplegar **solo el frontend** del candidato al ambiente QA para la prueba funcional. Este cambio no
   requiere despliegue de API, migraciones ni infraestructura.

## Matriz de QA funcional (obligatoria)

La certificacion local intercepta escrituras; QA debe probarlas contra la base real de QA:

| Flujo | Que debe verificar |
|---|---|
| Inicio de sesion | Login real por la interfaz, sesion estable y navegacion entre hubs |
| Portafolio | 13 hubs a 1440 y 980: sin desbordamiento, sin pantalla rota, `h1` correcto |
| Nueva orden de venta | Crear una orden real con cliente y producto desde `SearchSelect`; el registro persiste y el payload conserva `customer_id` y `lines[].{item_id,qty,unit_price}` |
| Agenda de gestion comercial | Crear una visita real desde el dialogo (4 selectores con busqueda); el registro persiste |
| Producto nuevo | Guardar un producto y verlo en la lista |
| Busqueda de selectores | Escribir, filtrar por nombre/codigo/iniciales, elegir con teclado (flechas, Enter, Escape) y limpiar |
| Sin coincidencias | Ver "Sin coincidencias" y que el formulario no envie un valor invalido |
| Campos requeridos | Enviar sin seleccionar: el combobox se reabre y la validacion nativa bloquea el envio |
| Tema oscuro y movil | Formularios y hubs en oscuro y a 390 px sin desbordamiento |
| Gastos menores | Verificar con un inquilino cuyo `tenant_active_modules` incluya `M-29`; en el inquilino demo esta denegado por licenciamiento y no es una regresion |
| Consola y red | Sin errores de consola ni respuestas fallidas durante los recorridos |

QA **no debe aceptar** el candidato si reaparece un `<select>` nativo visible en los tres formularios
migrados, si cambia el payload de las ordenes o si alguna pantalla desborda horizontalmente.

## Rollback

- El cambio es solo de frontend y no toca base de datos: basta revertir el merge en `develop` con
  `git revert -m 1 <merge-commit>` y redeployar el build anterior de QA.
- Prohibido `git reset --hard`, `git clean -fd`, force push o borrar la rama candidata: la rama conserva
  el commit certificado `8ba301c0` para diagnostico y reintento.
- Si el defecto esta en un solo archivo, corregir sobre `desarrollo`, certificar de nuevo y repetir este
  runbook; nunca reconstruir `develop` desde una foto antigua.
- No se requiere rollback de datos: la certificacion no escribio en base y el cambio no trae migraciones.

## Riesgos y limites declarados

- Las escrituras de la certificacion local estan interceptadas; la persistencia real es responsabilidad
  de QA funcional.
- Los maestros comerciales del inquilino demo se sirvieron con fixtures; productos y autenticacion fueron
  reales.
- No se ejecuto auditoria automatizada de accesibilidad (axe) ni prueba con lector de pantalla.
- Los 4 fallos de la suite web son preexistentes en `develop` y estan documentados en
  `scripts/certifications/visual-homologation-known-failures.json`; el candidato no agrega ninguno.

## Trazabilidad de cierre

- [x] Certificacion funcional de navegador: 96/96, 33 capturas, 0 errores de consola y red.
- [x] Regresion: typecheck 0, lint 0, suite 777/773, 0 fallos nuevos.
- [x] Alcance exacto validado contra `origin/develop`.
- [x] Manifiesto pre-QA bloqueado solo por autorizacion pendiente.
- [ ] Autorizacion explicita del propietario para `desarrollo -> develop` (QA).
