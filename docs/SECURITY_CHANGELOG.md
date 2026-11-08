# Security Changelog

## 2026-11-08 — Plan candado, Fase 0 (gates medibles)

- Tres gates dejaron de ser decorativos: `certify:auth-session` mide cinco rechazos y la revocación por logout; `security:inspect-rls --gate` bloquea por `missing_rls`, `rls_without_force` y `owner_bypass_tables`; el job de CI de auditoría ejecuta un gate con allowlist y vencimiento en lugar de `continue-on-error: true`.
- Nueva baseline medida en `docs/qa/evidence/plan-candado-20261108/baseline.json` (17 indicadores) con `scripts/security/candado-gates.js`; solo `--update` la reescribe y `--block` sale `1` ante regresión.
- Retirada la afirmación de RLS como control de multiempresa en `docs/SECURITY_THREAT_MODEL.md`: 41 `ENABLE`, 176 políticas, 0 `FORCE`, 0 `set_config('app.tenant_id')` y conexión con rol propietario; el middleware de tenant es el único filtro mientras eso no cambie.
- `.gitignore` cubre copias de conflicto, material criptográfico y volcados de base (`*.bak`, `*.pem`, `*.key`, `*.dump`, `*.sql.gz`, …).
- No se ejecutó ninguna fase 1-7: el plan sigue abierto en `docs/briefs/2026-11-08-plan-candado-blindaje-integral.md`.

## 2026-07-26 — Fase 3, RLS y Storage

- Añadido inspector reproducible de catálogo RLS en modo read-only.
- Verificado producción: 99 recursos RLS y 165 policies vigentes coinciden por nombre con el repositorio.
- Añadidas pruebas cross-tenant REST y smoke QA de Storage con limpieza.
- Confirmado y documentado el bypass de validación de bytes mediante carga directa.
- Diseñada arquitectura de autorización, cuarentena, validación y promoción; no implementada en esta fase.

## 2026-07-26 — Fase 3, dependencias

- Eliminados los dos hallazgos críticos del árbol de desarrollo.
- Actualizados de forma puntual Next, Fastify, Nodemailer, PostCSS y transitivas vulnerables.
- Eliminado `adm-zip` sin uso.
- Conservados y documentados los advisories internos de tooling/Next que no tienen una actualización compatible de bajo riesgo.

## 2026-07-26 — Fase 2

- Protección de `/metrics` mediante secreto dedicado y rate limiting.
- Validación de archivos por firma binaria, tamaño, integridad y dimensiones.
