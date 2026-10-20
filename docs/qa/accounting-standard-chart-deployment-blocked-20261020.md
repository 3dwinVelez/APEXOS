# Plan estándar de cuentas: integración y migración QA, despliegue bloqueado

Fecha: 2026-10-20. Alcance exclusivamente QA; main y producción no se modifican.

## Integración y gates

PR #60: https://github.com/3dwinVelez/APEXOS/pull/60, fusionado sin squash.
Commit en develop: 806ec6340853ce1631476f09df75b1fcdb8351e7.
Commit funcional reconstruido desde desarrollo y recertificado:
537e22e6a58d1f6f34d2f8b45f04857323da3b48.
Rama autorizada: codex/qa-plan-cuentas-20261020.

La diferencia neta contra develop vigente incluyó siete rutas exactas. Los doce
archivos ajenos permanecieron fuera. Gates de alcance, pre-QA y gobierno Git
aprobados. CI aprobó gobierno, auditoría de seguridad, compilación API/web,
lint y tipos tanto en el PR como en el commit fusionado.

El ensayo local con las cuentas reales extraídas por SELECT de QA aprobó 28
controles, incluyendo preservación de campos de negocio y padres existentes.
La regresión HTTP aprobó 16 controles, las pruebas contables 23 y el navegador
local ocho comprobaciones complementarias. El primer intento en el worktree
aislado falló por falta de resolución de fastify; se enlazaron las dependencias
locales y se repitió correctamente sobre el commit funcional exacto.

## Migración y conservación de datos

Proyecto verificado: APEX-OS-QA, jbirkghkekuifgfsgquq.
SQL versionado: supabase/migrations/20261020173515_standard_chart_piloto.sql.
Registro remoto aplicado por Supabase MCP: standard_chart_piloto,
versión generada 20261020180952. No repetir esta migración ya aplicada ni ejecutar
lotes históricos. La hora de versión remota fue asignada por MCP y no sustituye
la identidad del archivo SQL revisado.

Respaldo local previo, fuera de Git: .tmp/accounting-chart-qa-before.json.
Antes: 2872 cuentas, nueve companies, 23 Tenant y 113 movimientos LedgerEntry.
Después: 65208 cuentas en 26 identificadores empresariales distintos
(companies y Tenant pueden compartir ID). Las nueve sociedades de companies
quedaron con 2508 cuentas cada una.

Verificación contra el respaldo: cero alteraciones de los campos protegidos,
cero cuentas estándar faltantes y cero padres inválidos. Los 113 movimientos
conservaron el digest dd950528767cd811b04deadc47c592b0.
Anon y authenticated no tienen USAGE del esquema privado ni EXECUTE de la
función de aplicación. RLS de la plantilla está activo y ambos triggers activos.

Se probó además INSERT real de una sociedad sintética dentro de una transacción
en QA: recibió 2508 cuentas, las 2508 coincidieron con la plantilla incluyendo
padres locales, y se hizo ROLLBACK. Se comprobó que no quedaron filas de esa
sociedad ni cuentas de prueba y que el digest contable permaneció intacto.
Esto certifica el trigger real y la compatibilidad con la API anterior; no
sustituye el onboarding UI/Auth sobre el nuevo commit desplegado.

## Bloqueo externo confirmado

Railway rechazó los despliegues de API y web con:
Deploys have been paused temporarily.
La página https://status.railway.com/ informó una incidencia mayor el 2026-10-20:
nuevas compilaciones pausadas en todos los workspaces; los servicios ya activos
no afectados. El proveedor indica que los intentos deben repetirse al reanudar.

Proyecto Railway usado explícitamente: 33726923-021d-47a7-a263-b8b287f164f1,
APEXOS QA. Environment de Railway llamado production dentro de ese proyecto QA.
No se usó el proyecto APEXOS PROD al que la CLI está vinculada por defecto.
No se cambiaron variables, planes, límites, configuración ni infraestructura.

API y web seguían en 2f674b3b4bebfbe815fae8289bb9f5cd60ca2d08.
El health de API respondió OK con marcador 2f674b3b4beb. Por tanto no se afirma
que Railway esté ejecutando el commit 806ec634 ni que la certificación QA del
candidato esté completa.

## Reanudación

Cuando Railway restablezca compilaciones, verificar primero el HEAD remoto de
develop y revalidar el alcance si cambió. Desplegar el commit integrado exacto en
apexos-api-qa y apexos-web-qa del proyecto QA explícito. Ya existe un worktree
local de inspección en .tmp/chart-cert-worktree sobre 806ec634.

No volver a ejecutar la migración remota. Comprobar health y marcadores de ambos
despliegues; después certificar por navegador la creación de sociedad con
Supabase Auth, su catálogo automático y la persistencia al recargar, con casos
de permisos y aislamiento. Mantener la aprobación funcional de main pendiente.

DICTAMEN FINAL: NO APTO para declarar entrega QA completamente certificada.
Integración Git y migración QA completadas; despliegue y certificación funcional
del nuevo runtime bloqueados por la incidencia del proveedor.
