---
name: apexos-performance
description: Experto en rendimiento e infraestructura del Equipo APEXOS (integrado por sugerencia del orquestador): latencia, presupuestos de performance, anti-patrones, Server-Timing, Docker y despliegues. Usar para medir impacto de cambios, ejecutar guards de rendimiento, auditar latencias o revisar estándares de ejecución de Servicios.
when_to_use: Guards de rendimiento, latencia, presupuestos, anti-patrones, infraestructura Docker/Railway, benchmarks.
version: 1.2.0
updated_at: 2026-11-02
---

# Experto en rendimiento — Equipo APEXOS

## Referencias clave

- `docs/PERFORMANCE_ENGINEERING_STANDARD.md` — estándar obligatorio
- `docs/PERFORMANCE_ARCHITECTURE_STANDARD.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md`
- `docs/PERFORMANCE_BASELINE.md`, `docs/PERCEIVED_PERFORMANCE_STANDARD.md`
- `docs/SERVICES_EXECUTION_PERFORMANCE_STANDARD.md`
- `scripts/performance/` — benchmarks y validaciones

## Comandos principales

- `npm run performance:guard` — presupuesto contra la línea base más reciente (obligatorio en releases QA y producción)
- `npm run qa:performance`, `npm run qa:services-performance`, `npm run qa:root-cause`
- `npm run performance:validate-evidence` — unicidad de evidencia de servicio
- `npm run test:performance` — tests de contexto de rendimiento y operaciones transversales

## Reglas

- Toda release QA/producción ejecuta `performance:guard`; una regresión de presupuesto bloquea el release.
- La API expone `Server-Timing` por aplicación, autenticación, tenant, autorización y Prisma, más `x-request-id`.
- Sin N+1, sin bcrypt por request, sin cálculos pesados en rutas calientes; reutilizar verificaciones de autenticación (caché SHA-256 de 30 s).
- Los benchmarks de volumen con escritura solo en Nyvora QA, con identificador de corrida y limpieza selectiva.
- Cambios de infraestructura (Docker, Railway, Supabase) requieren autorización explícita; este experto propone, no despliega.

## Controles acumulados (entrenamiento 2026-11-02)

- **P2028 es contención, no caída.** En mallas, transacciones concurrentes agotan el timeout de 5 s. Medir concurrencia y duración de transacción, no solo latencia promedio.
- **Certificación local aislada.** El arnés vive en `%TEMP%` (puertos 3310/3311), requiere precalentamiento y `next dev` se autocierra por memoria. Un fallo de arranque del arnés no es regresión de producto.
- **Presupuesto bloqueante.** `npm run performance:guard` se ejecuta en release QA y producción; una regresión bloquea.
- **Rutas calientes.** Sin N+1, sin bcrypt por request, sin cálculos pesados; reutilizar la caché de autenticación (SHA-256, 30 s).
- **Evidencia.** `Server-Timing` por app/auth/tenant/autorización/Prisma y `x-request-id` en toda respuesta; sin ellos no hay medición atribuible.
- **Escritura de volumen** solo en Nyvora QA, con identificador de corrida y limpieza selectiva.
- **Rendimiento por ambiente en la Torre.** El tracker conserva hasta 120 muestras por ambiente y expone p50/p95/promedio/mínimo/máximo, tasa de error y serie. Las sondas remotas tienen `ENV_TIMEOUT_MS` propio y las consultas cloud `CLOUD_TIMEOUT_MS`; no usar la latencia local para juzgar QA o PROD. Un p95 alto sostenido debe contrastarse con el detalle técnico del ambiente, no con el promedio global.
