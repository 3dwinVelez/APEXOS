# Publicación controlada: NO APTO / BLOQUEADA

Fecha: 2026-10-21. Solicitud: subir los cambios realizados a desarrollo y develop respetando las políticas. La autorización para publicar/promover existe y queda subordinada a los gates del repositorio. No se requiere repetir esa autorización; faltan condiciones técnicas.

## Estado remoto verificado

- Rama local: desarrollo. HEAD observado: `85fdbe81ee293e866ac8a6d06c5ff22d264c8874`.
- origin/desarrollo tras fetch: `7191bde289812553cb2558127803c565e0d5a84d`. HEAD está cuatro commits por delante y cero por detrás.
- Target origin/develop tras fetch: `947f508b358c0a2c4f2c62d5d9867930cf1a6169`. HEAD está tres commits por delante y cero por detrás.
- El trabajo de esta conversación sigue modificado/untracked: **115 rutas** en el inventario preparatorio, incluyendo este reporte y sus dos manifiestos. No hay un commit candidato certificado. No se confunde HEAD con los cambios del worktree.
- No se hicieron commit, push, merge, PR, promoción, despliegue ni migración.

## Bloqueos comprobados

1. AGENTS.md exige script versionado que ejercite el flujo completo y evidencia pre-QA aprobada antes de publicación/promoción. Inventario y Compras solo tienen certificación UI/consulta/revisión/exportación; sus documentos de QA declaran explícitamente pendiente la certificación de escritura completa. No se sustituyen esos procesos por lint, TypeScript ni pruebas unitarias.
2. Se repitieron las dos suites de regresión de Transporte: 22 pruebas, 20 aprobadas, 2 fallidas. Fallos: `la contabilizacion advierte el bloqueo y captura el pago`; `la ficha enlaza sucursal y crea el centro de costo en la estructura contable`. Log local: `C:/Users/mq1/AppData/Local/Temp/apex-release-20261021-transport-regression.log`. Los fallos anteriores siguen vigentes; no se marca regresión aprobada.
3. La comparación de HEAD contra el origin/develop actualizado contiene **16 archivos anteriores** fuera del trabajo local solicitado: privacidad, documentos de QA previos, sandbox/infraestructura PDF y arranque Windows. Un merge completo publicaría esos cambios también; no se amplía silenciosamente el alcance para permitirlo. El inventario exacto está en `prior_target_diff_outside_requested_scope` del borrador.
4. Falta revisión de seguridad del candidato completo. El diff de RBAC revisado hasta ahora exporta roleScopeViolation; no cambia su implementación, pero debe figurar en el alcance. No se emite APTO de seguridad sin las pruebas del conjunto.

## Inventario y migraciones

Borrador v2: `manifests/local-modules-20261021-scope-draft.json`. Declara módulos e inventario A/M/D exacto de las rutas propuestas, cero eliminaciones y capacidades protegidas pendientes. certified_commit es null deliberadamente: no hay candidato certificado. No es un scope aprobado y no sirve para autorizar merge.

Los dos Excel de salida en outputs se excluyen. El generador de plantilla y la plantilla pública necesaria para la aplicación se identifican por separado de los datos de prueba locales. No se incluyen logs, tokens, archivos .env ni evidencias temporales en el paquete propuesto.

En el diff HEAD → worktree de esta intervención no hay migraciones, schema Prisma, SQL, dependencias ni lockfiles modificados. No se ejecutó migración remota. Esto no autoriza la infraestructura PDF presente en el historial anterior.

## Gates

Manifiesto pre-QA bloqueado: `manifests/local-modules-20261021-preqa-blocked.json`. Estado honesto: candidato ausente, certificación parcial, regresión fallida y otras verificaciones pendientes. Ejecución real: `npm run qa:preqa:evidence -- docs/qa/manifests/local-modules-20261021-preqa-blocked.json` terminó con exit 1 y AUTORIZACION PRE-QA BLOQUEADA. Rechazó la ausencia de SHA candidato, checks functional/error/support_scripts/regression/platform_regression sin passed y certificaciones completas inexistentes. No se inventan estados passed ni se reutilizan SHAs/evidencias de otro candidato.

qa:promotion:scope no se presenta como aprobado: sin commit candidato no hay diff de candidato que certificar. El borrador exacto debe regenerarse y pasar contra el origin/develop vigente después de aislar el alcance; no se validan solo rutas por prefijo.

## Continuidad necesaria

- Completar certificaciones locales de escritura, negativas y regresión de las capacidades protegidas, sin mutar ambientes remotos; resolver/clasificar los dos fallos actuales sin debilitar pruebas.
- Separar commits coherentes de Transporte, Inventario y Compras; revisar componentes compartidos y RBAC. Evitar arrastrar los 16 archivos anteriores o reescribir historia compartida.
- Crear candidato(s) trazables en desarrollo; actualizar manifiestos v2, evidencia y gate de seguridad sobre esos commits exactos.
- Pasar qa:preqa:evidence y qa:promotion:scope contra los refs remotos actuales. Solo entonces publicar desarrollo y promover por el flujo permitido a develop. No hacer push directo a develop.

DICTAMEN: NO APTO por evidencia insuficiente y regresión fallida. ESTADO: PUBLICACIÓN/PROMOCIÓN BLOQUEADA. main y producción fuera del alcance.

Skills aplicadas: apexos-git-release-guardian (C:/Users/mq1/.codex/skills/apexos-git-release-guardian/SKILL.md), apexos-engineering-orchestrator y apexos-qa-testing-expert. Release Guardian exige: «Detente ante rama incorrecta, worktree desconocido, conflictos o divergencia no comprendidos, tests críticos fallando, security gate bloqueado, migración no validada, cambio destructivo inesperado, evidencia ligada a otro commit o riesgo de modificar producción accidentalmente». La revisión de seguridad del candidato sigue pendiente; leer su skill no constituye un gate APTO.
