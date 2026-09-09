# Validación local — gating de brain insights

Cambio: `ApexIntelligencePulse` solo consulta `/api/v1/brain/insights` cuando el módulo `apex-ai` está habilitado para el tenant.

## Comandos ejecutados

- `npm --workspace apps/web run typecheck` → 0 errores
- `npm --workspace apps/web run lint` → 0 errores (10 warnings preexistentes, ninguno del cambio)
- `node apps/web/test/phase-two-intelligent-experience.test.mjs` → 7/7 OK

## Resultado

El cambio gatea la llamada con `useApexAiAccess()` (misma técnica que `AiExperienceLayer` y `BrainPanel`), eliminando el 403 `MODULO_NO_HABILITADO` que se generaba en cada carga de página para tenants sin `apex-ai`.
