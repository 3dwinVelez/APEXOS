# Reporte de seguridad de dependencias

Fecha de corte: 2026-07-26. Fuente: `npm audit`, árbol instalado mediante `npm ls` y revisión de uso en el repositorio.

## Inventario inicial

| ID | Paquete | Severidad | Directa/transitiva | Entorno | Alcanzable | Versión inicial | Versión segura aplicada | Riesgo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-001 | `shell-quote` vía `concurrently` | Crítica | Transitiva | Desarrollo local | No desde tráfico de producción; solo comandos constantes de `npm run dev` | 1.8.3 | 1.9.0 vía concurrently 9.2.4 | Bajo tras actualizar |
| DEP-002 | `concurrently` | Crítica agregada | Directa dev | Desarrollo local | No en artefacto productivo | 9.2.1 | 9.2.4 | Bajo |
| DEP-003 | `adm-zip` | Alta | Directa API | Producción instalada, sin uso | No se encontró ningún `require`/`import`; no había procesamiento ZIP | 0.5.17 | Eliminado | Nulo |
| DEP-004 | `fast-uri` | Alta | Transitiva de Fastify/AJV | Producción API | Potencial durante validación de URI | 3.1.2 | 3.1.4 | Bajo |
| DEP-005 | `find-my-way` | Alta | Transitiva de Fastify | Producción API | Sí, router HTTP; vector específico HTTP/2 depende del proxy | 9.6.0 | 9.7.0 | Bajo |
| DEP-006 | `js-yaml` | Alta | Transitiva de xmlbuilder/ESLint | Build y funcionalidad XML | No se encontró entrada YAML controlada por usuarios | 4.1.1 | 4.3.0 | Bajo |
| DEP-007 | `next` | Alta | Directa web | Producción | App Router y rutas servidor sí; no se encontraron Server Actions | 15.5.18 | 15.5.22 | Bajo para advisories core corregidos |
| DEP-008 | `nodemailer` | Alta | Directa API | Worker de producción | Sí si el job permitiera `raw`/adjuntos arbitrarios; el worker usa campos explícitos | 8.0.8 | 9.0.3 | Bajo |
| DEP-009 | `postcss` | Alta | Directa build y copia interna Next | Build | Entrada CSS pertenece al repositorio; no se procesa CSS suministrado por usuarios | 8.5.14 / 8.4.31 | 8.5.23 directa; 8.4.31 interna pendiente | Bajo/compensado |
| DEP-010 | `sharp` | Alta | Opcional de Next | Producción web | Potencial en optimización de imágenes | 0.34.5 | Sin versión compatible declarada por Next 15/16; pendiente | Medio residual |
| DEP-011 | `brace-expansion` | Alta | Transitiva | Lint/desarrollo | Patrones definidos por herramientas, no por usuarios remotos | 1.1.14 / 5.0.6 | 1.1.16 / 5.0.8 mediante overrides | Bajo |

## Advisories y condiciones

- `GHSA-w7jw-789q-3m8p` y `GHSA-395f-4hp3-45gv`: inyección/DoS en `shell-quote`; exclusivamente herramienta de desarrollo en APEXOS.
- `GHSA-xcpc-8h2w-3j85`: agotamiento de memoria al abrir ZIP manipulado; paquete instalado pero completamente sin uso.
- `GHSA-v2hh-gcrm-f6hx` y `GHSA-4c8g-83qw-93j6`: confusión de autoridad en URI; alcanzabilidad indirecta mediante validadores Fastify/AJV.
- `GHSA-c96f-x56v-gq3h`: DDoS del router con HTTP/2; router de producción, normalmente detrás del proxy Railway.
- `GHSA-52cp-r559-cp3m`: CPU cuadrática en YAML; no existe carga YAML desde clientes.
- Next.js: DoS/SSRF/cache confusion de App Router, Server Actions y rewrites. Se actualizó a 15.5.22; no hay Server Actions ni rewrites dinámicos identificados.
- `GHSA-p6gq-j5cr-w38f`: lectura/SSRF mediante opción `raw` de Nodemailer. El worker no usa `raw`, pero se actualizó a una versión corregida.
- `GHSA-6g55-p6wh-862q` y `GHSA-r28c-9q8g-f849`: lectura de archivos en PostCSS al procesar source maps manipulados; no se acepta CSS externo.
- `GHSA-f88m-g3jw-g9cj` (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590 y CVE-2026-35591): fallos heredados de libvips en Sharp. Se añadió Sharp 0.35.0, pero Next 15 conserva una dependencia opcional compatible con 0.34.x que `npm audit` sigue reportando.
- `GHSA-mh99-v99m-4gvg`: expansión sin límite en tooling de glob; sin entrada remota.

## Resultado posterior

Los 2 críticos iniciales desaparecieron. Los 9 grupos altos iniciales alcanzables o eliminables se actualizaron puntualmente. `npm audit` aún presenta 12 entradas altas agregadas, derivadas de tres advisories subyacentes y sus paquetes padre: `brace-expansion`/ESLint, PostCSS interno de Next y Sharp interno/opcional de Next. No representan doce vectores independientes.

No se utilizó `npm audit fix --force`. Las dependencias Prisma, React, Redis y módulos funcionales no se actualizaron.
