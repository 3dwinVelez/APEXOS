# SECURITY GATE — APEXOS

MODO: RELEASE-GATE

RAMA: desarrollo

COMMIT FUNCIONAL: `a06cb01`

ENTORNO: Supabase QA `jbirkghkekuifgfsgquq`

ALCANCE: migración de endurecimiento de RLS, grants y funciones privilegiadas.

## RESULTADO

APTO CON OBSERVACIONES

## RESUMEN

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Info: 4 advertencias residuales del Security Advisor.

## SUPERFICIES EVALUADAS

- Authentication
- Authorization
- Multi-tenancy
- Supabase Data API
- PostgreSQL RLS y grants
- Funciones privilegiadas
- Disponibilidad de API, web y Auth

## EVIDENCIA

- Security Advisor QA: 0 errores, 4 advertencias.
- Consulta post-migración: 0 tablas públicas sin RLS y 0 grants de cliente sobre tablas sin RLS.
- `search_path` fijado en las dos funciones objetivo.
- `rls_auto_enable()` sin ejecución para `PUBLIC`, `anon` o `authenticated` cuando existe.
- Certificación autenticada: 12/12 comprobaciones aprobadas.
- Aislamiento negativo: SCJ obtiene 0 filas de empresas, usuarios y órdenes de otro tenant.
- Disponibilidad concurrente: 50/50 API, 50/50 login web y 50/50 Supabase Auth.
- Regresión automatizada: 54/54 pruebas aprobadas.
- Certificación visible: `admin@apexos.qa` inició sesión en el frontend QA, cargó el dashboard con 28 módulos y abrió Servicios sin cierre de sesión, pantalla vacía ni error de autorización.

## OBSERVACIONES RESIDUALES

- `pg_trgm` permanece en `public`.
- Leaked Password Protection permanece deshabilitado en Auth.
- `create_public_service_order` conserva ejecución anónima y autenticada porque es el RPC público intencional del flujo de solicitudes. Requiere controles de abuso operativos, pero no fue modificado para evitar una interrupción funcional.

## DICTAMEN DE PROMOCIÓN

AUTORIZABLE DESDE SEGURIDAD únicamente como cambio puntual, sin arrastrar otros commits ni archivos de `desarrollo`.

## ROLLBACK

No deshabilitar RLS como reversa. Ante una incompatibilidad, restaurar de forma explícita y revisada únicamente los grants legítimos requeridos por el Data API, acompañados de políticas RLS específicas, y volver a ejecutar el certificador.
