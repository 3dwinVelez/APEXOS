# Configuracion del piloto offline

Todos los flags quedan apagados y las allowlists vacias en las plantillas. Para
un piloto QA deben cumplirse juntas estas condiciones:

```dotenv
NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED=true
OFFLINE_TECHNICIAN_ENABLED=true
OFFLINE_SYNC_ENABLED=false
OFFLINE_EVIDENCE_UPLOAD_ENABLED=false
OFFLINE_AUTO_SYNC_ENABLED=false
OFFLINE_ALLOWED_ENVIRONMENTS=qa
OFFLINE_ALLOWED_TENANT_IDS=<NYVORA_TENANT_ID>
OFFLINE_ALLOWED_USER_IDS=<QA_TECHNICIAN_USER_ID>
OFFLINE_ALLOWED_ROLES=Tecnico
```

La activacion debe realizarse en el gestor de configuracion QA, nunca en un
archivo confirmado. Antes de activarla se debe verificar que el usuario sea un
empleado activo, `user_type=tecnico`, rol exacto `Tecnico` y tenga ordenes
asignadas vigentes.

En la auditoria de Fase 3 se identifico el tenant historico de Nyvora, pero no
se confirmo de forma segura uno o dos usuarios QA que cumplan esas condiciones.
Por ello no se activo ninguna identidad ni se hizo una prueba contra datos
reales. Este dato es requisito operativo para certificar el piloto, no para
mantener el codigo desactivado.

Rollback: apagar primero `OFFLINE_TECHNICIAN_ENABLED` en backend y luego
`NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED` en web. Las sesiones dejan de obtener
bootstrap; el logout o la limpieza local elimina el snapshot existente.

## Configuracion local Fase 3.3

La allowlist se inyecta solo al runtime local por ambiente, tenant y usuario
exactos, sin rol global. Sync, evidencia y auto-sync siguen apagados. CSP admite
solo el origen http/https normalizado de `NEXT_PUBLIC_API_URL`; valores ausentes
o invalidos no agregan origen.

## Precondicion de ambiente

No activar flags si la base no contiene las columnas de version de autorizacion
usadas por sesiones y revocacion. Al 2026-07-27, `config/local.env` apunta a un
servidor no disponible y el PostgreSQL Docker alternativo tiene schema
anterior. Las allowlists continúan vacias.
