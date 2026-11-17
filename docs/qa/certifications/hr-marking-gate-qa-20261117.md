# Certificación funcional en QA — Gate de marcación y lectura sin selfies

- **Cambio**: `hr-marking-gate-20261117`
- **Ambiente**: APEXOS QA (API `https://apexos-api-qa-production.up.railway.app`, proyecto Supabase `jbirkghkekuifgfsgquq`, empresa modelo NYVORA)
- **Commit desplegado y medido**: `58c8554fd181` (punta de `develop`, el merge del corte por rama auxiliar y PR)
- **Fecha**: 2026-11-17
- **Evidencia**: `docs/qa/evidence/hr-marking-gate-main-20261117/qa-gate-certification.json` y `docs/qa/evidence/hr-marking-gate-main-20261117/qa-monitor-evidence.json`

## Qué se probó y contra qué build

Ambas corridas apuntan al build que Railway sirve en QA, no a un servidor local. El control `build_desplegado_es_el_candidato` compara el `commit` que publica `GET /health` contra el candidato esperado y aborta si no coinciden: sin ese control una verde de QA puede estar describiendo el despliegue anterior, que es el error que esta serie de intervenciones ya cometió en otros módulos.

**`certify:hr-marking-gate:qa` — 12 controles, `status: passed`** (`qa-gate-certification.json`):

- Un empleado sin jornada asignada recibe `200` con la lista vacía en `GET /hr/self/routes`, y el mismo endpoint con la misma sesión —creada ya la ruta— devuelve la jornada. Ese par de lecturas es lo que le permite a la pantalla distinguir «sin horario» de «fallo técnico» sin adivinar.
- La ficha del empleado se lee correctamente (`404 EMPLEADO_NO_ASOCIADO` sigue siendo el único caso de «sin ficha»), así que el aviso grande no puede confundirse con un permiso roto.
- `GET /hr/operations-map` del día respondió en **790 ms** con un cuerpo de **39 556 bytes** para 8 rutas, contra un presupuesto de 2 000 ms. El cuerpo no traía ninguna foto: se comprueba sobre el texto crudo del payload que no aparece ningún valor `base64_data` ni ninguna cadena `data:image`, y la evidencia existía ese día (615 256 bytes de fotos sembradas por el fixture y 829 534 bytes de evidencia almacenada en la base: 829 420 en marcaciones, 114 en actividades). El mapa pesa 4,8 % de lo que pesaría si arrastrara las imágenes.
- Cada evidencia llega como resumen `{available, id, has_base64_data}` y la foto aparece solo al pedir `GET /hr/monitor-evidence/punch/:id`.
- Las dos puertas de permiso siguen cerradas: el rol de solo marcación que pide la foto recibe `403 PERMISO_DENEGADO` y el mapa sin sesión responde `401`.

**`certify:hr-monitor-evidence:qa` — 10 controles, `status: passed`** (`qa-monitor-evidence.json`): la regresión del monitor que ya existía, vuelta a correr contra el contrato vigente.

## Cómo se reproduce

```powershell
npm run certify:hr-marking-gate:qa -- --api-url https://apexos-api-qa-production.up.railway.app --env-file config/qa.env --expected-commit 58c8554fd181 --budget-ms 2000 --output docs/qa/evidence/hr-marking-gate-main-20261117/qa-gate-certification.json
npm run certify:hr-monitor-evidence:qa -- --api-url https://apexos-api-qa-production.up.railway.app --env-file config/qa.env --output docs/qa/evidence/hr-marking-gate-main-20261117/qa-monitor-evidence.json
```

`config/qa.env` está gitignorizado y nunca se imprime. El script declara el project ref de QA y aborta sin conectar si la cadena de conexión no lo contiene, de modo que una corrida con configuración de producción no escribe datos sintéticos en la base de los clientes.

## Reparación del arnés viejo, no relajación de la prueba

La regresión del monitor llegó rota al ambiente: `400 SELFIE_REQUERIDA` en la entrada y `422 JUSTIFICACION_LLEGADA_TARDE_REQUERIDA` con `late_minutes: 858`. Se reprodujo y se contrastó con el código actual: la causa era el arnés, no el producto. Pedía una entrada sin selfie cuando la regla de identidad (`SELFIE_REQUIRED_TYPES`) exige foto en entrada y salida también por canal web, y fijaba la jornada en 00:01–00:02, una hora que hoy es una llegada tarde sin justificar.

Tres ajustes, ninguno una concesión:

- El fixture manda la selfie en entrada y salida, y el arnés conserva un control negativo (`entrada_sin_selfie_rechazada`): si alguien quita la exigencia de foto, la corrida se pone roja.
- La jornada del fixture arranca en el minuto en que corre la certificación, con 15 minutos de tolerancia, así que `late_minutes` queda en 0 y el resultado no depende de la hora del reloj de la corrida.
- La secuencia del día es la que el servidor valida (entrada, inicio y fin de almuerzo, salida); saltarse el almuerzo devuelve `409 MARCACION_FUERA_DE_SECUENCIA`, que es conducta del producto y no del arnés.

## Datos y limpieza

Los fixtures usan usuarios sintéticos con contraseña aleatoria de un solo uso en el tenant Nyvora de QA (ids 715, 716 y 717 con la ruta 398 en la corrida del gate; 707 y 708 con la ruta 395 en la del monitor). La evidencia guarda ids y fechas, no correos ni contraseñas. Al terminar cada corrida los usuarios quedan inactivos y la ruta en `inactive`; el `finally` se ejecuta también cuando la corrida falla, para que un rojo no deje ruido permanente en la base de QA.

## Qué no cubre esta evidencia

- **Producción**: el build desplegado en `main` aún no contiene el corte, así que ninguna cifra de este documento describe la latencia del ambiente productivo. La promoción `develop -> main` y su despliegue posterior son actos aparte.
- El presupuesto de 2 segundos se certificó contra una jornada sembrada por el propio fixture sobre el día de QA. El reparto de tamaños esperado en producción está medido en la sonda versionada en `docs/qa/evidence/hr-carga-horarios-20261117/selfie-payload-probe.json`, no aquí.
- La pantalla sigue certificada en navegador por la corrida local de 14 controles en `docs/qa/evidence/hr-marking-unassigned-gate-20261117/`, que cubre los cinco escenarios visibles (sin ficha, sin horario, con horario, caída con respaldo y caída sin respaldo). Lo que aporta este documento es el flujo autenticado contra el ambiente, que el navegador local no prueba.

## Veredicto

El corte tiene las tres capas de prueba exigidas: fuente y unitarias, pantalla real en navegador (14 controles) y flujo autenticado contra el build desplegado en QA (12 + 10 controles, ambos `passed`). Ninguna corrida quedó en rojo y ningún control se borró para obtener el verde.
