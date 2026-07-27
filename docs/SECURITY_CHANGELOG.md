# Security Changelog

## 2026-07-26 — Fase 3, dependencias

- Eliminados los dos hallazgos críticos del árbol de desarrollo.
- Actualizados de forma puntual Next, Fastify, Nodemailer, PostCSS y transitivas vulnerables.
- Eliminado `adm-zip` sin uso.
- Conservados y documentados los advisories internos de tooling/Next que no tienen una actualización compatible de bajo riesgo.

## 2026-07-26 — Fase 2

- Protección de `/metrics` mediante secreto dedicado y rate limiting.
- Validación de archivos por firma binaria, tamaño, integridad y dimensiones.
