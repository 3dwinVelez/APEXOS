# Veredicto de la promocion `desarrollo -> develop` del retiro de la compuerta alterna

Fecha: 2026-11-24 (America/Bogota). Dueño que ordena: Edwin, con la orden del dia 24-11 de alinear las tres
ramas y que no vuelvan los rechazos. Ejecuta: el frente de marcaciones de la web.

## Que se publico

Un commit funcional (`c1f858f2`) y este paquete documental. El commit funcional hace tres cosas y ninguna mas:

1. Borra `apps/api/src/modules/hr/webPunchSelfie.js` y su prueba `apps/api/test/hr-web-punch-selfie.test.js`.
   Esa guarda nacio en `develop` el 20-11 sin pasar nunca por `desarrollo`, se ejecutaba tres lineas antes de
   `verifyPunchIdentity` y dictaminaba la selfie por etiqueta-declarada-vs-bytes: una foto JPEG real anunciada
   como PNG se rechazaba con `SELFIE_INVALIDA` antes de que la guarda resiliente pudiera decidir. Eso es lo que
   hoy produce rechazos en la web.
2. Lleva byte a byte desde `origin/desarrollo` los cuatro archivos que deciden el camino:
   `mobile-identity.js` (la unica compuerta, ahora exige foto en las cuatro marcaciones web),
   `hr-mobile-identity.test.js`, el certificador `hr-mobile-identity-local.js` y la guarda estructural
   `apps/api/test/hr-single-selfie-gate.test.js`, que estaba ausente de `develop` y es la que impide que alguien
   vuelva a montar un segundo dictamen sobre la misma foto.
3. En `service.js` quita una sola linea: `input = require("./webPunchSelfie").prepareWebPunchSelfie(input);`.
   No se llevo el blob de `service.js` de desarrollo porque develop tiene 305 lineas propias en ese archivo,
   incluida la guarda de tenant de `updateRoute` (ver `guarda-de-tenant-presente.txt`).

## Medidas, no narrativa

| Instrumento | Resultado |
|---|---|
| `promotion-migration-check` contra el indice | 7/7 invariantes validas |
| `promotion-migration-check` contra el commit `c1f858f2` | 7/7 invariantes validas (`invariantes-replay-commit.json`) |
| `git diff --numstat origin/develop HEAD -- service.js` | 0 anadidas, 1 eliminada |
| Certificador hermetico `hr-mobile-identity-local.js` sobre el arbol del candidato | **55/55** (`local-certification.json`) |
| Suites API apuntadas (9 archivos del frente, incluida la guarda nueva) | 105 pruebas, 105 pasan, 0 fallan |
| Suites web apuntadas (5 archivos del frente) | 34 pruebas, 34 pasan, 0 fallan |
| Control de mutacion del instrumento de replay | 3 derivas medidas, las 3 rojas (`control-de-mutacion-instrumento.json`) |

El certificador corre la API real contra un PostgreSQL local, con fotografias reales generadas por `sharp` y
etiquetas mintosas, y cubre los cuatro tipos de la web: JPEG real declarado PNG, PNG real declarado JPEG, HEIC
que el visor no pinta (se conserva degradada, la hora entra) y el reenvio sin foto que hace la cola del navegador.
Ninguna respuesta de la ventana lleva `SELFIE_INVALIDA`: ese es el control que se cae si la compuerta alterna
vuelve.

## Compuertas

Las compuertas se corren desde el arbol de `desarrollo`, que es donde viven `validate-promotion-scope.js` con
el porton de origen y los dos instrumentos nuevos; el arbol de `develop` trae versiones viejas de esos scripts.
Forma:

```text
node scripts/certifications/promotion-gates-runner.js \
  --candidate <SHA del candidato> --target origin/develop \
  --scope <ruta absoluta al manifiesto -scope.json dentro del candidato> \
  --preqa <ruta absoluta al manifiesto -preqa.json dentro del candidato> \
  --output docs/qa/evidence/web-selfie-cuatro-marcaciones-develop-20261124/puertas-promocion-develop.json
```

La salida verbatim de las compuertas se versiona en `desarrollo` (esa ruta no esta en el diff de esta promocion
para no crear una autoreferencia: el archivo que mide la puerta no puede ser de la puerta).

## Lo que NO se llevo, declarado

- `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`: la pantalla de develop (blob `c13f7b4e`) ya pide
  foto en las cuatro marcaciones y manda `payload.identity_photo` en la raiz, que es la forma que el certificador
  reproduce. No hace falta tocarla para este frente.
- El escape hatch del cliente (`retry_without_photo` / `onUnusable`) vive solo en `desarrollo`. En develop y main,
  un operario al que la camara le responde mal no puede reintentar sin foto desde la pantalla: puede marcar con
  foto y el servidor ya no la rechaza por etiqueta. Queda como pendiente del frente de frontend, no de este.
- `agents/**` y `.qoder/skills/**` no viajan: develop no tiene el arbol de agentes. El contexto vivo se versiona
  en `desarrollo`.
- El porton de origen (`findUnoriginatedChanges`) tampoco viaja en este diff: es gobernanza de `desarrollo`.
  Su efecto sobre esta promocion es la unica excepcion nominal que se declara en el manifiesto de alcance
  (`service.js`), y esa excepcion esta justificada con numero: 0 lineas anadidas.

## Rollback

Revertir el commit funcional `c1f858f2` en `develop`. El árbol vuelve a `b59f286d`, que trae la compuerta
alterna; no hay migracion de esquema, no hay dato que revertir.
