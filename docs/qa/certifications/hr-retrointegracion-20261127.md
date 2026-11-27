# Certificación — Retrointegración de Talento Humano a desarrollo (2026-11-27)

- **ID**: `hr-retrointegracion-20261127`
- **Rama certificada**: `desarrollo` (baseline `536c72bb`, igual a `origin/desarrollo`)
- **Rama fuente**: `origin/develop`
- **Brief**: `docs/briefs/2026-11-27-hr-retrointegracion-ramas.md`
- **Evidencia**: `docs/qa/evidence/hr-alineacion-20261127/`
- **certification_status**: `local_passed_qa_pending`
- **Escrituras a registros de cliente**: cero. No se tocó `apps/api/prisma/**`, ni base de datos, ni despliegues.

## 1. Qué se pidió y qué se encontró

El dueño reportó que a Talento Humano le faltaban funciones y campos migrados desde `develop`. La medición por blob, no por log de commits, confirmó el reporte y agregó un hallazgo incómodo: **la direction estaba rota en los dos sentidos**.

| Frente | Solo en `develop` (traído) | Solo en `desarrollo` (recuperado) |
|---|---|---|
| Bancos | maestro de bancos, ACH/SWIFT, archivo Davivienda | — |
| Liquidación de retiro | revisión por día, ajustes manuales, beneficios, deducciones, PDF | — |
| Nómina | rediseño con rango de periodos, conceptos, provisiones y aportes | — |
| Reportes | columnas de tiempo trabajado/extra y totales | corrección administrativa de marcación y lectura de evidencia degradada |
| Marcación web | selfie ligado al paso | tolerancia a foto ilegible y taxonomia de fallos de la cola |
| Empleados | — | cierre de vigencia en línea y panel biométrico de dos clics |
| Mapa | — | detalle sin base64 inline |
| Hub | entrada de bancos | enlace de Marcaciones |

Las 4 columnas de la derecha son trabajo ya certificado y promovido en su momento, revertido en `develop` por el rediseño: es decir, **hoy Producción sirve código anterior a ese trabajo**. Se declara aquí, en la misma respuesta, y queda como pendiente del dueño.

## 2. Metodo

No se hizo `merge`. Fusionar `develop` sobre `desarrollo` aplicaba 155 supresiones de rutas de modulos que viven legítimamente solo en `desarrollo`. El procedimiento fue:

1. Clasificar el delta base..`origin/develop` restringido a Talento Humano en cuatro canastas: `BORRA-DEVELOP` (46 rutas, no se aplican), `COPIA-SEGURA` (57), `FUSION` (6) y `NUEVO-DEVELOP` (61).
2. Copiar 90 blobs de `develop` sobre un worktree auxiliar en `536c72bb`.
3. Reconciliar a mano los dos registros compartidos (`moduleFunctions.ts` y el hub) reinsertando lo que `develop` no conocía.
4. Censar identificadores exclusivos de `desarrollo` en cada ruta tocada: `pdfEscape`, `tabClass`, `Kpi` y `Balance` se verificaron uno por uno (dos renombrados, uno sustituido por el modulo nuevo de PDF, uno con su equivalente inline).
5. Auditar cada línea quitada del blob de `develop` en los tres puertos aditivos.

## 3. Mediciones

| Instrumento | Resultado |
|---|---|
| Suite del portal (`node --test apps/web/test/*.test.mjs`) | 948 pruebas, 943 pasan, 5 fallan |
| Baseline prístina del portal | los mismos 5 nombres caen en `536c72bb` (Servicios y Contable, ajenos al frente) |
| Suite API de Talento Humano (`node --test apps/api/test/hr-*.test.js`) | 413 pruebas, 409 pasan, 4 fallan |
| Baseline prístina de la API | 361 pruebas, 357 pasan, **los mismos 4 nombres** caen |
| `tsc --noEmit` en `apps/web` | salida 0 |
| Paridad por blob contra `origin/develop` (169 rutas del modulo) | 158 identicas, 11 divergentes y explicadas |
| Lineas de `develop` sin replica en el arbol integrado | hub 0, aportes 0, prestaciones 0, provisiones 0, librerias de marcacion 0, mapa 1, reportes 4, pruebas 10, empleados 15, marcacion 124 |

Las 124 lineas de `marcacion/page.tsx` no son funciones perdidas: son el sondeo fijo de 12 segundos que `desarrollo` retiro por medición en Produccion (p50 de 9,2 s entre fallos consecutivos del mismo usuario) y que aqui se queda sin aplicar a proposito, mas el andamiaje de listeners que ese sondeo arrastraba.

## 4. Controles de mutacion

Un control que no puede fallar no protege nada. Cada control nuevo se puso rojo primero:

- Quitar `selfieType !== type` de la compuerta de marcacion → `la selfie queda ligada al paso que se esta marcando` pasa de 9/9 a rojo; restaurado, vuelve a 9/9.
- El punto D de `hr-offline-marking.test.mjs` estaba rojo **en las dos ramas**: la prueba exigia que la compuerta terminara en `hrSelfServiceWrite` y el codigo ya habia agregado `hrSharedDeviceWrite` y `hrFaceWrite`. Se actualizo el literal y se añadieron dos aserciones positivas para que sacar una escritura del bloqueo vuelva a ponerlo rojo. No se aflojo ningun control.
- `hr-landing-information-architecture.test.mjs`: el control de que Marcaciones **no** aparece en el hub se invirtio por orden del dueño de hoy y queda con su cita; se verifico que pone rojo si se retira el enlace.

## 5. Lo que NO certifica este documento

- No certifica navegador contra ambiente desplegado: no hay corrida de Chromium sobre el arbol integrado. Por eso el estado es `local_passed_qa_pending`, no `qa_approved`.
- No habilita promoción. `qa:promotion:scope` contra la punta de `develop` sigue midiendo el porton completo y requiere manifiesto nuevo con autorizacion expresa.
- No lleva a Produccion el frente biométrico (14 endpoints, 3 tablas) ni aplica migracion alguna.
- No re-mide el DESPUES en Produccion: ese paso pertenece a la promoción, no a esta retrointegracion.

## 6. Pendientes con dueño

1. **Decidir la promoción** de este arbol a `develop` y `main` — dueño: el dueño; instrumento: manifiesto de alcance v2 + `qa:promotion:scope` + `qa:preqa:evidence`, y corrida de navegador antes.
2. **Cuatro rutas revertidas en Produccion** (telemetria de `api.ts`, identidad de instalacion, base64 del mapa, ventanillas de Empleados) — dueño: `apexos-frontend` y `apexos-qa`; tres quedan corregidas en `desarrollo` con este commit, falta decidir si se suben.
3. **Siete `confirm(` sin prefijo** en nomina, rostros, liquidacion, dispositivos y aportes — dueño: `apexos-frontend` con su propio brief; no es regressión de esta intervención.
4. **Frente biométrico en Produccion** — dueño: `apexos-db-nube` y el dueño (autorizacion de migracion).
5. **Un instrumento con la premisa retirada** —dueño + `apexos-qa`—: `scripts/certifications/hr-hide-web-marking-local.js` vino de `develop` para certificar que la marcación web se oculta. La orden del 2026-11-27 es dejarla en producción, así que el archivo queda en el árbol por paridad pero **no** se cita como evidencia: hay que decidir si se retira o se re-ancla.
6. **Worktrees y ramas auxiliares** de esta intervención (`wt-hr-alineacion-20261127`, `wt-hr-base-20261127`, tags `backup/prealineacion-*`) — dueño: el dueño decide el borrado; nada se elimina sin orden expresa.
