# Services Close Satisfaction Survey Fix

**Fecha:** 2026-07-23
**Auditor:** Validación automática Servicios
**Tipo:** Bug fix por regresión

## Bug encontrado

**Archivo:** `apps/api/src/modules/services/service.js` — función `requireSatisfactionSurvey`

**Problema:** La función `requireSatisfactionSurvey` leía la encuesta de satisfacción solo del body del request de cierre (`input.metadata.satisfaction_survey.answers`), pero el frontend y la app móvil recolectan la encuesta durante el paso de **inspección/ejecución** y la persisten en `order.metadata`. Al no tener fallback a `order.metadata`, todas las órdenes fallaban al cerrar con HTTP 422 "Completa las 3 preguntas de satisfaccion antes de cerrar el servicio".

**Causa raíz:** La validación se agregó en el commit `fe0d728` ("feat: modernize service operations and dark mode") como parte del flujo de `closeOrder`, pero solo considera el body entrante, no la metadata ya persistida.

**Corrección:**
1. `requireSatisfactionSurvey` ahora acepta un tercer parámetro `orderMetadata` opcional con fallback a `orderMetadata?.satisfaction_survey?.answers`
2. `closeOrder` pasa `order.metadata` como tercer parámetro

### Lógica de resolución:
```
answers = input.metadata?.satisfaction_survey?.answers  // prioridad: body del close
       || orderMetadata?.satisfaction_survey?.answers    // fallback: metadata persistida
```

## Validación ejecutada

Script `scripts/validate-service-close-fix.js` con 10 pruebas:
- Encuesta en body (nuevo flujo): pasa
- Encuesta incompleta en body: rechazada (validación funciona)
- Encuesta en order.metadata sin body (flujo legacy): **pasa** ← bug corregido
- Sin encuesta en ninguna fuente: rechazada (validación correcta)
- Prioridad de body sobre metadata: correcta
- Ciclo E2E completo: referencia → orden → fotos → inspección con encuesta → cierre sin body: **pasa**

**Resultado:** 10/10 pruebas pasaron.
