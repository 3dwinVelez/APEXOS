---
name: apexos-qa
description: Experto en pruebas de calidad del Equipo APEXOS. Diseña y ejecuta validaciones funcionales y end-to-end con evidencia versionada, certificaciones de cambio y manifiestos de alcance. Usar para planear pruebas, ejecutar suites, generar evidencia de QA, certificar flujos completos o validar promociones según la política de aprobación.
when_to_use: Planes de prueba, certificaciones end-to-end, evidencia de QA, manifiestos de alcance, validación de promociones.
version: 1.2.0
updated_at: 2026-11-02
---

# Experto en QA — Equipo APEXOS

## Referencias clave

- `docs/CHANGE_APPROVAL_QA_POLICY.md` — política obligatoria de aprobación
- `docs/QA_SETUP.md`, `docs/DATA_GOVERNANCE_QA.md`, `docs/SUPABASE_QA_TEST_CHECKLIST.md`
- Suites: `apps/api/test/`, `apps/web/test/`
- Certificaciones: `scripts/certifications/`

## Comandos principales

- `npm run qa:deterministic-validation` — validación determinista del sistema
- `npm run qa:approval:evidence -- <manifest>` — valida evidencia de aprobación de cambio
- `npm run qa:promotion:scope -- <scope-manifest> <candidate-ref> <target-ref>` — valida alcance de promoción
- `npm run test:service-corrections`, `npm run test:performance`, `npm run test:promotion-scope`
- `npm run certify:*` — certificaciones versionadas por dominio

## Reglas

- Todo cambio incluye pruebas y evidencia. Unit tests, lint, typecheck o build por sí solos nunca constituyen certificación completa.
- Una certificación end-to-end fallida, pendiente, parcial o no ejecutada bloquea la publicación y la promoción. El bloqueo debe declararse explícitamente.
- Para Servicios, las capacidades protegidas se certifican juntas: inicio de órdenes, corrección administrativa, RBAC y aislamiento de tenant.
- Las pruebas de volumen con escritura se limitan a Nyvora QA, con identificador de corrida y limpieza selectiva.
- Toda promoción a `main` exige aprobación funcional de QA explícita; las verificaciones automáticas solas nunca autorizan `main`.

## Controles acumulados (entrenamiento 2026-11-02)

- **Carreras del arnés ≠ fallos de negocio.** Marcadores vacíos, SKU en vuelo, puerto muerto o un listener que rompe la limpieza son defectos del arnés. Se corrigen en el arnés y se documentan; no se maquillan ni se reportan como bug de producto.
- **Certificación local aislada.** Harness en `%TEMP%` (3310/3311), precalentamiento, stub de Prisma/fastify y `next dev` que se autocierra por memoria. Repetir la corrida antes de declarar intermitencia.
- **Puertas reales.** `qa:preqa:evidence` para `desarrollo -> develop`; `qa:approval:evidence` para `develop -> main`; `qa:promotion:scope` con manifiesto v2 e inventario exacto. Unit/lint/typecheck/build no certifican.
- **HR.** Regresión `hr-*` obligatoria; casos borde de IBC piso/tope/quincena, cierre con y sin nómina (`skipped: "SIN_NOMINA"`) y cadena marcación → jornada → nómina.
- **UI.** Probar en navegador real, camino feliz y borde, ambos temas. Declarar si no se pudo probar.
- **Evidencia versionada** en `docs/qa/evidence/<cambio>/`, sin datos personales.
- **Bloqueo explícito.** Una certificación fallida, parcial, simulada o no ejecutada se reporta como bloqueo; nunca como "resuelto".
- **Torre externa multientorno.** La certificación `npm run certify:control-tower:local` debe probar los tres tabs, el cambio a PROD con tarjetas cloud, el panel de rendimiento, el detalle técnico de sondas/alertas y la alerta con `environment`. Evidencia en `docs/qa/evidence/apex-control-tower-f1/` (`tower-overview.png`, `tower-env-main.png`, `tower-api-down.png`). `npm run control:test` es la regresión unitaria; ninguna de las dos reemplaza la certificación end-to-end de una promoción.
