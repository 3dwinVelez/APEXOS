# Brief — Selfie en las cuatro marcaciones de la web y portón de origen

- **ID**: `2026-11-24-web-selfie-cuatro-marcaciones-porton-origen`
- **Fecha**: `2026-11-24`
- **Rama activa**: `desarrollo` (HEAD `134816de`, idéntico a `origin/desarrollo`)
- **Prompt crudo**: "procede con el arreglo para alinear el app de la web para que solicite las selfie de manera correcta en las 4 marcaiones y que no tengamos mas friccion con versiones diferentes, todo esto como plan de contingencia ya que trabajamos en na version unica de marcaciones que cuando la tengamos lista vamos a bloquear todos los demas accesos y versiones viejas de al app para dirigir a todos los usuarios a esa herramienta ya testeada y verificada lo que debemos hacer es amortiguar las marcaciones del equipo durante este corto tiempo o ventana de actualizacion por eso es vital que podamos darle continuidad a las marcaciones como esta en el momento para evitar errores ya que en la web falta alinear la version nueva que pide fotos en las 4 marcaciones, entonces aplicaremos ese cambio provisional pero muy estricto completamente blindado para que no falle el envio de las maraciones es indispesable que no falle es la unica salida que tenemos para poder certificar que esta intevencion fue correcta, luego para el caso de git es un fallo critico habernos brincado desarrollo lo que ah roto la plataforma en diversas ocaciones, entonces robustece las normas de migracion estrictas en el brief para que los agentes no tengan forma de brincarse el protocolo"

## 1. Objetivo

Que un operario que marca desde el navegador **no pierda ninguna de las cuatro marcaciones**
(entrada, inicio de almuerzo, fin de almuerzo, salida) ni por la foto ni por el formato de la
foto, durante la ventana de actualización en la que convivirán la app instalada vieja, la app
nueva y la web. Y que ningún archivo llegue a `develop` o a `main` sin haber nacido en
`desarrollo`, porque fue exactamente eso lo que rompió la marcación.

La meta verificable no es "menos rechazos": es que el envío de una marcación web con foto real
de cámara **entre** en los cuatro tipos, y que lo que no es imagen siga rechazándose con un
motivo machine-readable, nunca con la etiqueta del dictamen alterno.

## 2. Causa raíz (medida, no inferida)

En Producción conviven **dos compuertas que dictaminan sobre la misma foto**:

| Compuerta | Dónde vive | Qué dictamina |
|---|---|---|
| Única dueña de la regla | `apps/api/src/modules/hr/mobile-identity.js` (`verifyPunchIdentity` → `webIdentity`) | pide selfie en los tipos que declara `WEB_SELFIE_REQUIRED_TYPES`; rechaza solo lo que **no es imagen** |
| La alterna | `apps/api/src/modules/hr/webPunchSelfie.js` | emite `SELFIE_INVALIDA` / `SELFIE_REQUERIDA` con criterios propios |

Verificado por blob, no por ascendencia de commit:

```text
git rev-parse --verify --quiet <ref>:apps/api/src/modules/hr/webPunchSelfie.js
HEAD                 (ausente)
origin/desarrollo    (ausente)
origin/develop       ce6c0af32681cc0d62aa0f6921b70f2401479ae2
origin/main          ce6c0af32681cc0d62aa0f6921b70f2401479ae2
git grep -l SELFIE_INVALIDA origin/main -- apps/api/src  ->  webPunchSelfie.js
```

Ese archivo **nunca existió en `desarrollo`**. Por eso el código servido en Producción dictamina
de una manera y el código que se revisa y certifica en `desarrollo` dictamina de otra: quien
prueba en la rama correcta no puede reproducir lo que pasa en la calle. La captura del teléfono
(`El contenido del archivo no coincide con el formato declarado ... (SELFIE_INVALIDA)`) es la
firma de la compuerta alterna, no de la dueña.

Segunda causa, independiente de la primera: **la web solo pedía selfie en entrada y salida**. El
canal firmado (app instalada) deliberately mantiene `SELFIE_REQUIRED_TYPES = {entrada, salida}`
porque la firma cubre el hash de la foto y ensanchar ese conjunto rompería las apps ya
instaladas; pero en el canal web no hay firma, así que la cara es la única prueba de quién marcó
y el almuerzo quedaba ciego. Los dos conjuntos ahora son explícitos y distintos, y la regla vive
en un solo lugar.

## 3. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/api/src/modules/hr/mobile-identity.js` | `WEB_SELFIE_REQUIRED_TYPES` (línea 75) declara los cuatro tipos; `webSelfieRequiredFor()` (518) normaliza el tipo antes de decidir; `webIdentity()` (556-576) exige selfie en los cuatro; `SELFIE_REQUIRED_TYPES` (68) sigue siendo `entrada`/`salida` para no invalidar firmas de apps instaladas; se exportan el conjunto y el predicado (795) |
| `M` | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` | `selfieRequiredPunches` (135) con los cuatro tipos; guardas de envío (1118, 1246, 1324); etiqueta dinámica `Selfie de <tipo>` (1673); la foto viaja en `payload.identity_photo` (1306) |
| `M` | `apps/api/test/hr-mobile-identity.test.js` | 44 pruebas, incluidas las de los cuatro tipos web, el video rechazado con `EVIDENCIA_CLASE_RECHAZADA` en `error.details` y `code = VALIDACION` |
| `A` | `apps/api/test/hr-single-selfie-gate.test.js` | guard estructural: prohíbe una segunda compuerta de selfie y prohíbe que otro archivo dicte `SELFIE_INVALIDA` / `SELFIE_REQUERIDA`; control de que el propio guard puede fallar |
| `M` | `apps/web/test/hr-marking-lateness-selfie.test.mjs` | 8 pruebas de paridad: el conjunto del cliente tiene que ser idéntico a `WEB_SELFIE_REQUIRED_TYPES` del servidor, en tres direcciones de deriva |
| `M` | `scripts/validate-promotion-scope.js` | portón de origen: `findUnoriginatedChanges()` (103) y `validateOriginUniqueness()` (112) comparan el blob de cada ruta del candidato contra `origin/desarrollo` (77) |
| `M` | `scripts/test/validate-promotion-scope.test.js` | 8 pruebas con repositorio git real de dos ramas, excepción nominal y control de la plomería de blobs |
| `M` | `scripts/certifications/hr-mobile-identity-local.js` | fase `4bis`: los cuatro tipos por el canal web con foto real y etiqueta mentirosa, video, HEIC y reenvío sin foto; siembra sus propias fichas; payload fiel al cliente real |
| `A` | `docs/qa/evidence/hr-web-selfie-window-20261124/local-certification.json` | certificación verde `55/55`, `run_id 20261124153656` |
| `A` | `docs/qa/evidence/hr-web-selfie-window-20261124/mutation-selfie-gate.json` | control de mutación: con `WEB_SELFIE_REQUIRED_TYPES` reducido a dos tipos el certificador se cae en `la web no puede marcar inicio_almuerzo sin selfie` (status 200 donde debe rechazar) |
| `A` | `docs/briefs/2026-11-24-web-selfie-cuatro-marcaciones-porton-origen.md` | este documento |
| `M` | `.qoder/skills/apexos-backend/SKILL.md`, `.qoder/skills/apexos-frontend/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-seguridad/SKILL.md`, `.qoder/skills/apexos-git-guardian/SKILL.md`, `.qoder/skills/equipo-apexos/SKILL.md`, `.qoder/skills/apexos-brief/SKILL.md` | control nuevo de una sola compuerta de selfie, paridad cliente/servidor, portón de origen y prerequisites del ambiente de certificación |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | bump semver, `updated_at`, `sha256` y registro de la intervención |

### Módulos (`change_intent.modules`)

- `hr-marking`
- `hr-mobile-identity`
- `promotion-governance`
- `qa-certification`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 4. Fuera de alcance

- **No se toca el contrato de la app instalada.** `SELFIE_REQUIRED_TYPES` sigue siendo
  `entrada`/`salida`: la firma EC P-256 cubre el `photoSha256`, así que ensanchar el conjunto
  dejaría sin marcar a quien no ha actualizado. La unificación real llega con la herramienta
  única de marcación, y entonces se bloquean accesos y versiones viejas.
- **No se borra `webPunchSelfie.js` desde `desarrollo`**: ese archivo no está aquí. Retirarlo es
  una promoción a `develop`/`main`, con manifiesto de alcance y autorización explícita, no un
  cambio de esta intervención.
- Sin migraciones, sin esquema, sin datos en la nube, sin Railway/Supabase, sin secretos.
- No se toca el monitor de latencia ni el piso de autenticación (brief
  `2026-11-24-monitor-marcaciones-latencia`), salvo que la certificación los ejercita de paso.

## 5. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 12).
  Prohibido `develop`, `main`, force push, merge, deploy, migración remota e infraestructura sin
  autorización explícita e independiente.
- Aislamiento multi-tenant y RBAC intactos; el flujo firmado y el canal web conservan sus
  estados de identidad distintos (`verified` / `photo_only` / `not_verified`) — la visibilidad de
  que una marcación web **no** es prueba de identidad no se puede diluir.
- Sin secretos ni credenciales en el brief ni en el diff.
- Provisionalidad: el cambio es estricto en la regla, no en la superficie. Nada de esto se
  retira con flags; se retira cuando la herramienta única entre, y eso se anota en la sección 11.

## 6. Criterios de aceptación

1. `node --test apps/api/test/hr-mobile-identity.test.js apps/api/test/hr-single-selfie-gate.test.js` → 44/44.
2. `node --test apps/web/test/hr-marking-lateness-selfie.test.mjs` → 8/8, y falla si el conjunto
   del cliente y el del servidor difieren en cualquier dirección.
3. `node --test scripts/test/validate-promotion-scope.test.js` → 8/8, incluido el caso de una
   ruta nacida en la rama promocionada.
4. `DATABASE_URL=<postgres local> node scripts/certifications/hr-mobile-identity-local.js --output docs/qa/evidence/hr-web-selfie-window-20261124/local-certification.json` → `CERTIFICACION APROBADA: 55/55`.
5. Conducta observable: marcación web con JPEG real declarado PNG, PNG real declarado JPEG, HEIC
   que el visor no pinta y reenvío sin foto → **las cuatro entran**; un video declarado foto →
   rechaza con `code = VALIDACION` y `details.evidence_failure_code = EVIDENCIA_CLASE_RECHAZADA`,
   nunca con `SELFIE_INVALIDA`.
6. Control de mutación: reducir `WEB_SELFIE_REQUIRED_TYPES` a dos tipos pone el certificador en
   rojo (evidencia `mutation-selfie-gate.json`). Un control que no puede fallar no certifica nada.

## 7. Evidencia y certificación exigida

- Suites: 44 API + 8 web + 8 portón (todas verdes después de restaurar el archivo mutado,
  verificado por `sha1sum` contra el respaldo previo a la mutación).
- Certificación end-to-end: `scripts/certifications/hr-mobile-identity-local.js` contra API real
  y Postgres local, evidencia versionada en `docs/qa/evidence/hr-web-selfie-window-20261124/`.
- `certification_status` esperado: `local_passed_qa_pending`. **No se promociona nada**: la
  promoción a `develop` exige `npm run qa:preqa:evidence -- <manifiesto>` y autorización explícita.

## 8. Capacidades protegidas

- `hr-selfie-window` — los cuatro tipos web entran con foto real; certificada en la fase `4bis`.
- `hr-marking-continuity` — ninguna jornada se pierde por el formato de la foto (degradada
  conservada + novedad `MARCAT_SIN_EVIDENCIA` en el reenvío); certificada end-to-end.
- `single-selfie-gate` — guard estructural que no deja aparecer una segunda compuerta.
- `identity-channel-parity` — el canal firmado conserva `verified` y el almuerzo firmado sin cara
  acumulada; certificado en la misma corrida.
- `promotion-origin-uniqueness` — el portón rechaza contenido sin origen en `desarrollo`;
  probado contra repositorio git real de dos ramas.

## 9. Riesgos y rollback

- Riesgo: la web ahora exige selfie en el almuerzo y un operario sin cámara queda sin marcar →
  Mitigación: el desprendimiento declarado (cola del navegador) registra la hora con su novedad
  para el supervisor, certificación en `salida: el reenvio sin foto registra la hora con su
  novedad` → Rollback: revert del commit en `desarrollo`, nunca reset ni snapshot viejo.
- Riesgo: mientras la compuerta alterna siga servida en `develop`/`main`, la Producción seguirá
  dictaminando con `SELFIE_INVALIDA` → Mitigación: el portón de origen impide que se repita y
  esta evidencia deja el dictamen único en `desarrollo`; la resolución en Producción es una
  promoción autorizada aparte, no un cambio de código de esta rama.
- Riesgo: ambiente de certificación que pasa en verde por datos ajenos → Mitigación: el
  certificador siembra su tenant, usuario y ficha (`sembrarFichas`) en lugar de depender de lo
  que hubiera en la máquina.

## 10. Hallazgos de ambiente (con dueño), encontrados al certify

Estos tres no son excusas de ejecución: son divergencias reales entre el código y lo que un
ambiente reconstruido en casa entrega, y cada una puede producir un verde falso o un rojo
injusto.

1. **`prisma db push` no reconstruye la convención de tipos de la nube.** Bajo `db push`,
   `AuthorizationSession.id` queda `text`; en la nube es `uuid`. La sentencia de autorización
   (`apps/api/src/security/authorizationState.js:107`) hace `s.id = cast($1 as uuid)`, así que
   **toda** petición autenticada responde 401 con `P2010 / 42883 operator does not exist:
   text = uuid` — incluido el login. Un ambiente armado con `db push` es incapaz de servir una
   sola marcación. Alineación usada para certificar:
   `alter table "AuthorizationSession" alter column id drop default, alter column id type uuid
   using (id::uuid), alter column id set default gen_random_uuid();`
   Dueño: `apexos-db-nube`. Falta decidir si se blinda con migración o se documenta como
   requisito; no se autorizó ninguna migración en esta intervención.
2. **`prisma migrate deploy` tampoco reconstruye la base desde cero.** Muere en
   `20260602_accounting_inventory_purchases_payroll` con `42P01 relation "Item" does not exist`
   y el baseline `20260601000000_baseline_core_schema` nunca existió en el historial de git: el
   esquema de la nube vino por fuera del repo. Dueño: `apexos-db-nube`.
3. **Cliente Prisma viejo = 500, no error claro.** Tras un `npm ci`, el generado puede quedar
   sin `hrWebauthnCredential` y la marcación web revienta en `service.js:3776`
   (`Cannot read properties of undefined (reading 'findMany')`) con `ERROR_INTERNO`. Remedio:
   `npx prisma generate` y reiniciar. Dueño: `apexos-qa` (lo incorporó como prerequisite del
   certificador).
4. **Trampa del certificador**: su `argsFrom` solo acepta la forma `--output <ruta>` (espacio).
   Con `--output=<ruta>` la bandera se ignora en silencio y **sobrescribe la evidencia versionada
   de `docs/qa/evidence/hr-mobile-identity-20261104/`**. Esta intervención restauró ese archivo y
   ejecutó siempre con `--output docs/qa/evidence/hr-web-selfie-window-20261124/...`.
   Dueño: `apexos-qa`.

## 11. Ventana de actualización y retiro de lo provisional

Este cambio es el amortiguador, no el destino. Cuando la herramienta única de marcación esté
lista, el orden de retiro es:

1. Bloquear accesos y versiones viejas de la app (decisión del dueño, con su propia
   certificación de bloqueo).
2. Dirigir todo el tráfico a la herramienta única ya testeada.
3. Retirar `WEB_SELFIE_REQUIRED_TYPES` del canal web genérico cuando el único cliente que marca
   sea el firmado: en ese momento deben quedar **un solo conjunto y una sola compuerta**, y el
   guard `hr-single-selfie-gate.test.js` es el que avisa si alguien introduce una segunda.
4. Quitar el desprendimiento declarado del navegador (`retry_without_photo`) solo cuando ya no
   exista ningún cliente que lo necesite; hoy es la razón por la que una hora no se pierde.

## 12. Normas de migración estrictas (para que ningún agente pueda brincarse el protocolo)

El incidente no fue un bug: fue un archivo escrito fuera del camino `desarrollo -> develop -> main`.
Desde esta intervención el protocolo deja de ser recomendación y pasa a ser bloqueo automático.

1. **Origen verificable por blob, no por ascendencia de commit.** Antes de cualquier promoción,
   `npm run qa:promotion:scope -- <manifiesto> <candidato> <objetivo>` compara, para **cada**
   ruta del inventario exacto, el blob del candidato contra el blob de `origin/desarrollo`.
   Diferente o ausente ⇒ `contenido sin origen en desarrollo, no se promociona`. La
   prohibición es por contenido: un merge que "ya trae" la ruta no la autoriza si el contenido
   no es el de `desarrollo`.
2. **La única salida es nominal.** `origin_waivers: [{ file, reason, approval }]` exige motivo y
   autorización escritos; sin `approval` no existe excepción, y una excepción no declarada deja
   el resto de las rutas igual de bloqueadas.
3. **Referencia remota, no baseline local.** El portón resuelve `origin/desarrollo` y se niega a
   opinar si no la ve (`no se puede verificar el origen ... Ejecute git fetch origin desarrollo`).
   Comparar contra la copia local de otra máquina es la manera de aprobar una promoción que no
   existe.
4. **Nada nace en `develop` ni en `main`.** Si una corrección se hizo allá, se reconstruye el
   commit puntual en `desarrollo`, se certifica aquí y solo entonces sube. La urgencia cambia la
   prioridad, nunca el flujo.
5. **Inventario exacto `scope_schema_version: 2`.** Cada archivo con su `A`/`M`/`D`; un borrado
   sin `allowed_deletions` explícito bloquea; el diff neto distinto del inventario bloquea incluso
   cuando todas las rutas caen en directorios permitidos.
6. **Un commit, un módulo.** Si el asunto nombra un módulo y el diff toca otro, se parte o se
   reconstruye antes de promocionar. Autoría, prisa o QA previo no saldan el salto.
7. **Certificación que puede fallar.** Toda compuerta de avance exige un control de mutación
   documentado (sección 6.6). Un verde sin control que falle no es evidencia.
8. **El preflight manda antes de tocar.** `npm run agents:preflight -- --paths "<rutas>"`; si
   sale `INTEGRAR_REMOTO` o `CONFLICTO` se integra `origin/desarrollo` y nunca se sobrescribe
   una versión remota más nueva. `agents:coverage` con `--paths` es bloqueante al cierre.

## 13. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/api/src/modules/hr/mobile-identity.js,apps/web/app/dashboard/talento-humano/marcacion/page.tsx,apps/api/test,apps/web/test,scripts/validate-promotion-scope.js,scripts/test,scripts/certifications,docs/briefs,docs/qa/evidence"` → veredicto `OK_CON_ADVERTENCIAS` (rutas sin agente dueño: `apps/api/test`, `docs/briefs` → `equipo-apexos`).
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`, `apexos-git-guardian`, `apexos-brief`.
- **Documentación a actualizar**: este brief, `agents/CHANGELOG.md` y los `SKILL.md` de la sección 3.
- **Agentes a actualizar**: cada dueño con bump `patch`/`minor`, control nuevo y `updated_at`;
  detalle en `agents/CHANGELOG.md` de esta fecha.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<las rutas de la sección 3>"` en verde antes del commit.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 6 → commit con las rutas exactas de la sección 3 (el árbol ajeno a esta intervención no se toca).
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force
  push, merges, migraciones remotas ni infraestructura.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit

## 14. Pendientes con dueño

| # | Pendiente | Dueño | Estado |
|---|---|---|---|
| P-1 | Retirar la compuerta alterna `webPunchSelfie.js` del código servido en `develop`/`main` (reconstrucción en `desarrollo` + manifiesto de alcance + `qa:preqa:evidence`) | `equipo-apexos` con `apexos-git-guardian` | bloqueado por autorización explícita de promoción |
| P-2 | Decidir si `AuthorizationSession.id uuid` se blinda con migración o se documenta como requisito de ambiente | `apexos-db-nube` | abierto, hallazgo 10.1 |
| P-3 | Dejar reconstruible la base desde `prisma migrate deploy` (baseline faltante y `Item`) | `apexos-db-nube` | abierto, hallazgo 10.2 |
| P-4 | QA funcional en navegador contra ambiente QA una vez exista promoción | `apexos-qa` | pendiente de P-1 |
| P-5 | Herramienta única de marcación y bloqueo de versiones viejas (retira lo provisional, sección 11) | dueño del producto | en curso, fuera de este brief |
