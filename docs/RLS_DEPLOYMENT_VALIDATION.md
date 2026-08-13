# Validación del despliegue RLS

Fecha: 2026-07-26. Herramienta: `npm run security:inspect-rls`.

## Seguridad de la inspección

La herramienta exige `--target`, valida que el project ref de Supabase coincida con el host de PostgreSQL y usa una transacción `READ ONLY`. Producción requiere además `--confirm-production=READ_ONLY_PRODUCTION`. Las URLs se redactan y el project ref se registra como hash.

Ejemplo:

```text
npm run security:inspect-rls -- --target=production --env-file=config/production.env --confirm-production=READ_ONLY_PRODUCTION --measure
```

## Resultado

| Recurso | Repositorio | QA | Producción | Diferencia | Riesgo |
| --- | ---: | ---: | ---: | --- | --- |
| Archivos SQL analizados | 59 | n/a | n/a | n/a | Informativo |
| Relaciones esperadas con RLS | 99 | No verificable por catálogo | 99 habilitadas | 0 faltantes | Bajo |
| Políticas vigentes versionadas | 165 | No verificable por catálogo | 165 | 0 faltantes; 0 adicionales | Bajo |
| Expresiones de policies | 165 | Pruebas REST parciales | 127 idénticas; 38 diferencias sintácticas de paréntesis | Revisión manual sin cambio de tokens/control | Bajo |
| Relaciones públicas sin RLS | 0 esperadas | No verificable | 0 | 0 | Bajo |
| Buckets esperados | 9 | Smoke sobre `service-images` | 9 privados | 0 | Bajo |

La cifra histórica de 231 corresponde a declaraciones acumuladas en migraciones. Al procesar reemplazos y `DROP POLICY`, el estado versionado vigente contiene 165 policies, exactamente las desplegadas en producción.

## QA

`config/qa.env` combina un `DATABASE_URL` local con un proyecto Supabase remoto. La herramienta canceló antes de conectar, como estaba diseñada. Por tanto no se declara el catálogo QA autoritativamente validado.

Las pruebas REST disponibles en el proyecto QA comprobaron:

- login de cuenta control;
- cero filas al filtrar otra empresa en `companies`, `company_users`, `service_orders` y `service_evidence`;
- cero objetos al listar el prefijo de otra empresa;
- carga/lectura/eliminación controlada de un objeto propio.

La vista `v_user_companies` devolvió cero membresías para esa cuenta pese a que puede acceder a una orden de servicio; se clasifica como divergencia de datos/cuenta de prueba y no como apertura cross-tenant.

## Producción

- 127 relaciones públicas/Storage inventariadas.
- 165 policies.
- 16 funciones `SECURITY DEFINER`, todas con `search_path` configurado.
- 20 relaciones con RLS y sin policy: 13 tablas Prisma/backend y 7 tablas internas de Storage. Para los roles expuestos su comportamiento es deny-by-default.
- Los grants de escritura de `anon` encontrados corresponden a tablas internas de Storage y permanecen subordinados a RLS; no se hallaron tablas públicas de negocio con write grant anónimo.

No se aplicó ninguna migración porque no se identificó una divergencia crítica o alta.

## Limitaciones

- Los usuarios Nyvora “real admin/driver/operative/readonly” pertenecen a Auth Prisma, no a Supabase Auth, y no pueden utilizarse para impersonación RLS REST.
- No se crearon usuarios productivos.
- INSERT/UPDATE/DELETE multiempresa no se ejecutaron en producción.
- QA necesita una conexión PostgreSQL correcta para completar comparación autoritativa de catálogo.
