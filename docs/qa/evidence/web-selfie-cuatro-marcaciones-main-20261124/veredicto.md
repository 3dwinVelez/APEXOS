# Veredicto de la pata main del selfie web en las cuatro marcaciones

- Empresa modelo: **NYVORA** · ambiente **QA** y **Produccion** · fecha 2026-11-24
- Rama de origen: `origin/desarrollo` (manifiestos y evidencia commiteados y **pusheados antes de medir**)
- Rama evaluada: **main** (replay puntual sobre `e68eed4c`)
- Criterio de verdad: el arbol del candidato; el binario desplegado manda en la lectura del campo
- Cero escrituras a QA o a Produccion en esta pata (la corrida de campo de QA ya estaba medida; la de
  Produccion se toma despues del despliegue y se documenta aparte)

## Que se promociona y como

Main esta 596 commits detras de develop, asi que el transporte **no es un merge de rama**: es un replay
puntual declarado en `docs/qa/specs/web-selfie-cuatro-marcaciones-main-20261124.replay.json` y verificado
por el instrumento versionado `scripts/certifications/promotion-migration-check.js`. El instrumento:

1. exige que cada `carry` este **pusheado** en `origin/desarrollo` y que su blob coincida byte a byte
   (si el desarrollo local esta sucio, el instrumento lo dice en rojo);
2. exige que cada `delete` este efectivamente borrado en el index del candidato;
3. exige que cada `edit` aplique exactamente el hunkeo declarado: `service.js` **cero lineas agregadas y
   una eliminada** — la linea que llamaba a la compuerta alterna.

Medida antes de commitear: **11/11 validas** (`invariantes-replay-indice.json`). El mismo control se corre
contra el commit (`invariantes-replay-commit.json`). El archivo con el SHA **no se reescribe a mano**.

## Estado por control

| Control | Verificacion | Resultado |
|---|---|---|
| replay contra el index | `promotion-migration-check.js --against index` | **11/11 validas** |
| replay contra el commit | `promotion-migration-check.js --against commit` | **(pendiente)** |
| equivalencia blob candidato ↔ `origin/desarrollo` | tabla en `equivalencia-blob-candidato.txt` | **11 rutas: 8 identicas, 2 borradas, 1 hunkeo de una linea** |
| la compuerta alterna no deja huspedes | `git grep webPunchSelfie` en `apps/api/src` | **NINGUNA** |
| suites API apuntadas | `node --test` sobre el arbol del candidato | **(pendiente)** |
| suites web apuntadas | `node --test` sobre el arbol del candidato | **(pendiente)** |
| certificador hermetico `hr-mobile-identity-local.js` sobre el arbol del candidato | **(pendiente)** |
| QA en campo (DESPUES), mismo instrumento | `hr-web-selfie-campo.js` contra `https://qa.apexos.com.co` | **13/13** con ancla al API servido `6b42b365a64e`; las cuatro piernas HTTP 200 asentadas, tres con `evidence_status:available` y `verificacion:photo_only`, el reenvio sin foto con `not_verified`; cero `SELFIE_INVALIDA` |
| Produccion antes del despliegue | mismo instrumento con `--espera=defecto` sobre lo que Produccion sirve hoy | **10/10 con ancla al API servido `e68eed4c63f4`**: las dos etiquetas mentirosas devuelven HTTP 400 `SELFIE_INVALIDA` y **no escriben fila** (`foto_guardada:false`); la marca honesta cae fuera de secuencia (409, es agenda del operario, no compuerta) y el reenvio sin foto pide selfie (400 `SELFIE_REQUERIDA`); esas dos se registran como informativas |

Los dos corridos usan el mismo arnes versionado (mismo `script_sha256`); lo unico que cambia es el ambiente, y
el arnes ancla cada corrida al commit que ese ambiente sirve. La diferencia entre ambos no es interpretacion:
`SELFIE_INVALIDA` con cero fila escrito en Produccion frente a HTTP 200 con la evidencia colgada en QA.

## Reproduccion y remedio

- **Causa**: main carga `apps/api/src/modules/hr/webPunchSelfie.js`, una segunda compuerta que exige que la
  foto coincida con el tipo que declaro el navegador y rechaza con `SELFIE_INVALIDA` antes de que
  `verifyPunchIdentity` aplique la aceptacion por clase del color. El celular y la web mandan JPEG con
  etiqueta `image/png` (captura de canvas), y la marcacion se cae con HTTP 400 sin escribir nada.
- **Remedio**: una sola compuerta — la del color, clasista y con pasaporte de cara limpia — y la foto
  pedida en las cuatro marcaciones web (`entrada`, `inicio_almuerzo`, `fin_almuerzo`, `salida`). La linea de
  la llamada sale de `service.js`; el modulo se borra.
- **Prueba de que el remedio es el que se despliega**: el binario de QA que asienta las cuatro piernas es el
  mismo contenido que viaja en este replay (blob-identico en las 8 rutas que se copian); la pantalla de
  marcacion web de main ya pedía la foto en las cuatro (`c13f7b4e` identico al de develop), asi que no hay
  cambio de frontend que esperar.

## Desvio que se declara aqui mismo

Ninguno en esta pata: la autenticacion de QA y de Produccion se hace por el CLI de Railway y por sesiones
vivias del ambiente; no se volco ninguna credencial en evidencia ni en el registro; la prueba de campo del
ANTES en Produccion retiro sus dos usuarios al final (HTTP 200) y sus filas no quedaron (lectura por clave
de idempotencia: `asentada:false`).

## Pendientes con dueno

1. **Duena — Produccion**: confirmar el despliegue del commit promovido por `/health` y, una vez servido,
   correr el DESPUES en campo. Sin esa corrida, la promesa "no habra rechazos" queda certificada en codigo
   y en QA, pero no en Produccion.
2. **Es esta intervencion**: correr las suites y el certificador hermetico sobre el arbol de main y medir el
   replay contra el commit.
