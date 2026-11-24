# Brief — cero rechazos en la foto de la marcación web

- **Fecha:** 2026-11-24
- **Orden del dueño:** «procede a implementar y certificar 0 rechazos y aplica tus sugerencias para evitar mas inconvenientes con mi autorizacion y alinea todos los ambientes». Antes de esta orden quedaron vigentes «alinear todas las ramas con esta decisión … que no existirán rechazos» y el alcance elegido: las tres ramas completas, ambientes QA y Producción, firma QA del dueño.
- **Disciplinas ruteadas por `agents:preflight`:** `apexos-backend`, `apexos-seguridad`, `apexos-qa`, `apexos-brief`, `equipo-apexos`.

## 1. Qué estaba pasando

Dos cosas distintas se estaban llamando «rechazo» en el canal web:

1. **La foto real que no cabe.** El servidor exigía selfie en las cuatro marcaciones web y la rechazaba con `400 EVIDENCIA_SUPERA_LIMITE` cuando el archivo superaba los 2 MB del canal, aunque fuera una foto decodificable de clase aceptada. El tope es de almacenamiento, no de identidad: la consecuencia era que la hora no quedaba registrada.
2. **Lo que no es foto.** Video, PDF, SVG y texto declarado como imagen siguen rechazándose, y eso es correcto: no puede guardarse como evidencia de rostro lo que no es un rostro.

## 2. La decisión

**Una foto decodificable de clase aceptada nunca cuesta una jornada.** En el canal web, si el único motivo del veredicto es que el archivo no cabe en el almacén, la evidencia degrada: la hora entra, la fila queda `not_verified` con `evidence_status: "degraded"` y su código, y **los bytes no se guardan** (un payload de 2 MB en `jsonb` es exactamente lo que costó el disgusto de disco del 2026-11-18).

La excepción es angosta y no toca el otro canal:

- Si el veredicto trajo otra causa —clase prohibida, tipo declarado, alfabeto ilegible— el rechazo duro manda aunque el payload también sea grande. Sin esta condición, un video de 3 MB entraría disfrazado de foto a revisión.
- La app firmada conserva el rechazo duro por tamaño: su tope cubre la firma, y aceptar bytes que no caben en la firma invalidaría la prueba.

## 3. Qué se midió antes de afirmar

| Medición | Instrumento | Resultado |
|---|---|---|
| Contrato real de la compuerta, forma por forma | `preactual` contra `normalizeSelfie` en el árbol local | 15 formas: 7 entran disponibles, 2 degradan por tamaño, 2 degradan porque el navegador no las pinta, 4 rechazan duro |
| Que la batería puede ver el defecto | `hr-web-photo-battery.js --selftest` | 15 casos, tres mutaciones obligadas al rojo |
| Línea base ANTES en el ambiente | `hr-web-photo-battery.js --espera=antes` contra QA (`3303a95532a3`) | **32/32** con el defecto reproducido: 3 MB y 2,4 MB salen 400 sin dejar hora; el reenvío sin foto del navegador entra 6/6 en 200 |
| Guardas del mismo módulo | `hr-evidence-resilience` + `hr-single-selfie-gate` + `hr-mobile-identity` | 64/64 |
| Certificación hermética del canal de identidad | `hr-mobile-identity-local.js` sobre PostgreSQL local | 55/55 |

El reenvío sin foto medirlo con la forma **del cliente** (`detachEvidence` + `withEscalationMarker`) no fue un detalle de estilo: la primera versión del instrumento mandaba solo el `evidence_status` degradado y el API contestaba `SELFIE_REQUERIDA`, lo que habría publicado como defecto del producto un defecto del instrumento.

## 4. Inventario exacto

| A/M/D | Ruta |
|---|---|
| `M` | `apps/api/src/modules/hr/mobile-identity.js` |
| `M` | `apps/api/test/hr-evidence-resilience.test.js` |
| `A` | `scripts/certifications/hr-web-photo-battery.js` |
| `A` | `docs/qa/evidence/web-photo-battery-20261124/bateria-qa-antes.json` |
| `A` | `docs/qa/evidence/web-photo-battery-20261124/bateria-qa-despues.json` (pendiente: exige despliegue en QA) |
| `A` | `docs/briefs/2026-11-24-cero-rechazos-foto-web-bateria.md` |

Sin eliminaciones. `allowed_deletions`: ninguna.

## 5. Criterios de aceptación observables

1. Un JPEG de 3 MB y un PNG de 2,4 MB declarados como imagen devuelven 2xx y dejan fila; la fila dice `degraded` con `EVIDENCIA_SUPERA_LIMITE` y no trae bytes dentro.
2. Un archivo que el visor no pinta (GIF real, payload ilegible declarado imagen) deja la hora con su novedad.
3. Video, PDF, SVG y texto siguen costando 400 con su código exacto, y ninguno de esos 400 pierde la jornada: el reenvío sin foto del navegador la asienta.
4. Ninguna respuesta lleva los códigos de la compuerta alterna ya retirada.
5. La app firmada conserva el rechazo duro por tamaño.
6. Cero 5xx y toda escritura dentro de 30 s.

## 6. Qué NO se hace en esta intervención, y por qué

**No se relaja la escalera de la jornada ni la ventana de 24 horas.** Era una de mis sugerencias; el dictamen del auditor la rechaza en parte:

- `MARCACION_FUERA_DE_SECUENCIA` (`apps/api/src/modules/hr/service.js:2942`) protege que una salida sin entrada no fabrique una duración inexistente sobre la que se calculan recargos y horas extras. Relajarla en general es falsedad de registro.
- `MARCACION_DIFERIDA_EXPIRADA` (`service.js:886-892`, tope `HR_DEFERRED_MARKING_MAX_AGE_HOURS`, default 24 h) dentro de 24 h **ya no se rechaza**: los rechazos que se ven vienen de más de 24 h o de un horario de otro día. Relajar el pasado lejano permitiría que cualquier operario escriba marcaciones de días atrás.
- El mecanismo de novedad que yo proponía como «inmutable y auditable» **no es inmutable**: `recordHrNovelty` (`service.js:510-537`) hace `ON CONFLICT DO UPDATE` y reescribe el `metadata`. Venderlo ante un juez o el Ministerio sin blindarlo sería una mentira con otro nombre.

Lo que sí queda abierto, con dueño y condición exacta: aceptar el salto de `salida` cuando ya existe una `entrada` válida del mismo día, con novedad revisada por el supervisor y sin pagar el tramo sin fin hasta cerrarla; y diferidas de más de 24 h solo con periodo de nómina abierto, tope duro de 72 h e identidad verificada. Ninguna de las dos se implementa sin su propio brief y su certificación.

## 7. Viaje entre ramas

`desarrollo` lleva el cambio. El promotion a `develop` es **replay limpio por archivo**: contra el antepasado común `8208d941`, `mobile-identity.js` y `hr-evidence-resilience.test.js` no tienen ni una línea propia en `develop` (+0 −0 medidos), así que llevar el blob no revierte trabajo ajeno. `main` está a cientos de commits y viaja por las mismas invariantes, no por fusión de rama.

## 8. Normas de migración que esta intervención deja vigentes

- Ninguna promoción por archivo puede afirmarse sin medir antes si el destino tiene trabajo propio en ese archivo. La medida va en el manifiesto.
- Un instrumento que reproduce un flujo del cliente tiene que copiar la forma literal del cliente; si el instrumento y el cliente difieren, el rojo es del instrumento hasta que se demuestre lo contrario.
- «Cero rechazos» nunca se certifica borrando los rechazos legítimos: se certifica que ningún rechazo válido pierde la hora.
- Ningún blob promocionado puede existir primero en la rama de destino. El portón de alcance lo verifica contra `origin/desarrollo` y cualquier nacida fuera de ahí exige un waiver nominal, no un directorio amplio.

## 9. Publicación y DESPUÉS medido

| Rama | Punta | Cómo viajó | Compuertas |
|---|---|---|---|
| `desarrollo` | `7c75bbc5` | origen del cambio (tres commits: `7adf35f2`, `c50eb33e`, `d2a0d524` + contabilidad) | suites del frente 91/91, compuerta local 55/55, gobernanza 46/46 |
| `develop` | `c0fbb4b9` | replay puntual de 22 rutas sobre `7df8240a` (fast-forward, tag `backup/precierre-cero-rechazos-develop-20261124`) | `ALCANCE DE PROMOCION VALIDO: cero-rechazos-foto-web-bateria-20261124 (22 rutas, origen verificado contra origin/desarrollo)`, `AUTORIZACION PRE-QA VALIDA`, guardián de gobernanza exit 0 |
| QA desplegado | `c0fbb4b9c50c` | Railway, verificado por `/health.commit` | batería hostil `--espera=despues`: **34/34 controles sobre 15 formas**, sin 5xx, peor escritura 1.804 ms |

El DESPUÉS (`docs/qa/evidence/web-photo-battery-20261124/bateria-qa-despues.json`) cierra exactamente las dos piernas que estaban rotas: la JPEG de 3.197.152 bytes y la PNG de 2.497.157 bytes entran con `status 200`, la hora asentada, la fila marcada `degraded` con `EVIDENCIA_SUPERA_LIMITE` y **los bytes fuera de la fila** (`foto_inline:false`). La clase prohibida sigue costando el rechazo con su código (`video-mp4`/`pdf` → `EVIDENCIA_CLASE_RECHAZADA`; `svg-declarado-imagen`/`texto-plano` → `EVIDENCIA_TIPO_DECLARADO_RECHAZADO`) y el reenvío fiel del navegador recupera la hora en las cuatro (`status 200`, `desprendidas:["identity_photo"]`). El control de mutación del instrumento (`--selftest`) sigue verde: 15 casos con tres mutaciones obligadas al rojo.

## 10. Exposición que esta intervención no cierra, con dueño

El navegador desplegado en `develop` y `main` **no hace el reenvío sin foto**. Medido, no deducido: `retry_without_photo` y `detachEvidence` no existen en ninguna ruta de `apps/web` de `origin/develop` ni de `origin/main`, y sí existen en `origin/desarrollo`. La brecha no es de dos líneas: `apps/web/lib/hrOfflineMarking.ts` (502 líneas) no existe en esas ramas y `marcacion/page.tsx` difiere en 561 líneas añadidas / 141 quitadas.

Consecuencia honesta: el fix de servidor quita de en medio la causa real del campo (la foto grande), y por eso la hora ya no se pierde por tamaño en ninguna rama en cuanto suba. Pero si el rechazo lo provoca una clase o un tipo prohibido, el cliente desplegado todavía no tiene cómo recuperarla. Eso viaja como frentes separados —`apexos-frontend` con su propio brief, su certificación en navegador y su manifiesto de 2 rutas de `apps/web`—, no como un añadido a este portón, porque ampliar el alcance con el argumento de "aprovechar el viaje" es exactamente el patrón que rompió la plataforma.
