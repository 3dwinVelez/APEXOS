# Diagnóstico navegador — 403 brain/insights (QA/develop)

Fecha: 2026-09-09.

## Reproducción

Autenticado como `scj@apexos.qa` contra `https://apexos-web-qa-production.up.railway.app`.

En cada página del dashboard (dashboard, servicios, talento-humano y subflujos) se registra:

```text
GET /api/v1/brain/insights?limit=12 → 403 MODULO_NO_HABILITADO (module=brain)
```

## Causa raíz

`ApexIntelligencePulse` llamaba al endpoint sin verificar el acceso al módulo, a diferencia de `AiExperienceLayer` y `BrainPanel` que usan `useApexAiAccess()`.

## Corrección

Gatear la llamada con `useApexAiAccess()`; solo consulta cuando `apex-ai` está habilitado para el tenant.

## Verificación de regresión (flujos adyacentes)

- Dashboard / login: OK
- Servicios (consulta, nueva orden, referencias, reportes): OK, sin 401/500
- Talento Humano (rutas, marcación, mapa, reportes): OK, sin 401/500
