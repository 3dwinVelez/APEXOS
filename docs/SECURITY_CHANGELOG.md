# Security Changelog

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
