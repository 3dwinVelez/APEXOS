# Brief — El fallo técnico deja de ser una ventana para el cliente

- **ID**: `2026-11-18-fallo-tecnico-no-es-ventana`
- **Fecha**: `2026-11-18`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "necesito que todas las alertas de fallos tecnicos que la api no responde la cual representan ventanas emergentes en la plataforma no vuelvan ah aparecer, primer objetivo udentificar porque el api no esta respondiendo adecuadamente y genera los errores, segundo frente aunque el api o la herramienta en algun momento genere algun error estos deben ser transparentes para el usuario no debe existir ningun tipo de notificacion lo que eh evidenciado durante este tiempo esque al manipular la herramienta como usuario salen constantemente estas ventanas saturandome la vista y arruinando mi experiencia de usuario al punto de decir esto esta malo no funciona y no queremos que un cliente llegue a pensar eso.. evalua el problema y planteamo un plan de intervencion critica para esta situacion , al finalizar brindame un plan resumido de lo que debemos hacer en lenguaje natural facil de entender"
- **Autorización del dueño (AskUserQuestion)**: ambientes donde vio las ventanas = Producción, Local (desarrollo), QA/Railway, Móvil/PWA. Alcance autorizado ahora = «Fases 0 y 1 ya, luego decides», sobre `desarrollo`, tocando solo el cliente web. Las Fases 3 (backend/API/BD) y 4 (fallback silencioso a Supabase) quedan explícitamente diferidas.

## 1. Objetivo

Que ningún fallo de la API, de la base de datos o de la red vuelva a aparecer como ventana emergente para el usuario final, sin perder el registro técnico del incidente; y establecer por medición por qué la API respondía mal, para que la Fase 3 tenga a qué entrar. Verificable en navegador con la API caída: cero tarjetas flotantes en las pantallas más castigadas, con el detalle disponible solo para soporte y con el fallo registrado.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/lib/api.ts` | `alertRequestFailure()` deja de abrir la ventana de usuario y emite solo el diagnóstico; `requestErrorMessage()` pierde el argumento `path` (la ruta ya no se cuela en el mensaje); nuevo `browserNetworkNotice()` traduce `Failed to fetch`/`AbortError` a una frase accionable; el 404 deja de filtrar `${path}`; `silentFailureAlert` pasa a significar «este llamador maneja el fallo en línea». |
| `M` | `apps/web/lib/platformAlerts.ts` | Queda reducido al canal de diagnóstico: `apex:diagnostic`, `technicalDiagnosticsEnabled()` y `emitPlatformDiagnostic()`. Se retiran `notifyPlatform()` y el evento de usuario `apex:alert`. |
| `M` | `apps/web/components/system/PlatformAlerts.tsx` | Eliminado el listener de alertas de usuario. El listener de diagnóstico queda tras `technicalDiagnosticsEnabled()` y con presupuesto: 5 tarjetas por ventana de 60 s y cierre automático a los 9 s. |
| `M` | `apps/web/lib/sessionSecurity.ts` | Retirados `APP_ALERT_EVENT`, el tipo `AppAlert` y `emitAppAlert()` (cero llamadores en el repo). `clearSession()` sigue dejando `apex_session_end_reason`. |
| `M` | `apps/web/lib/supabaseClient.ts` | El sobre técnico (`Supabase 503: {…}`) deja de ser texto de pantalla: `supabaseFailureNotice()` por estado, y `status`/`detail` viajan como propiedades para el diagnóstico. |
| `M` | `apps/web/app/error.tsx` | Sin `notifyPlatform` ni `error.message` en pantalla; copia de recuperación honesta con la referencia `error.digest` y botón que llama `reset()`. |
| `M` | `apps/web/app/login/page.tsx` | `SESSION_END_NOTICES` lee `apex_session_end_reason` y muestra el motivo (inactividad, expiración, sesión revocada, cierre manual) como aviso en línea `role="status"` dentro del propio formulario. |
| `M` | `apps/web/app/dashboard/talento-humano/rutas/page.tsx` | Respaldo del monitor de horarios de 5 s a `ROUTES_BACKSTOP_POLL_MS = 30_000`; el refresco sigue llegando por el evento de marcación. |
| `M` | `apps/web/app/dashboard/talento-humano/mapa/page.tsx` | `LIVE_REFRESH_SECONDS` de 10 s a 30 s: la malla de 30 días con huella GPS entraba en cola con el `statement_timeout` del servidor. |
| `M` | `apps/web/app/dashboard/transporte/monitoreo/page.tsx` | Refresco guardado por `visibilitychange`; el banner rojo de error se convierte en estado del dato («reintentará solo» / «conserva la última lectura de hh:mm»). |
| `M` | `apps/web/test/hr-monitor-refresh.test.mjs` | El contrato del temporizador mide la cadencia nueva y prohíbe el `setInterval(refreshVisible, 5000)`. |
| `A` | `apps/web/test/technical-alert-silence.test.mjs` | 14 contratos de código: canal de usuario prohibido en todo el árbol, diagnóstico tras bandera, mensaje sin ruta, aviso de sesión en el login, notificaciones de red, cadencia de temporizadores y estado de dato en lugar de banner. |
| `A` | `scripts/certifications/technical-alert-silence-browser-local.js` | Certificación en navegador real sobre `next build` + `next start`: tormenta de 500, 429 en cascada, corte de red y sesión vencida en 5 pantallas × 2 temas, autocontrol del arnés (tormenta real, sin guard de acceso, pantalla montada) y control positivo con el modo diagnóstico. |
| `M` | `package.json` | Script `certify:technical-alerts-silence:local`. |
| `M` | `.gitignore` | `apps/web/.next-*/` para los directorios de salida que usan los arneses de certificación. |
| `M` | `docs/project/filosofia-producto-ui.md` | Nuevo patrón «estado ante fallo: la técnica no es interfaz» y dos reglas para cambios futuros (ni un fallo técnico como ventana; el temporizador de refresco es parte de la interfaz). |
| `A` | `docs/qa/evidence/technical-alert-silence-20261118/certification.json` + 13 PNGs | Veredicto 68/68 con `build_id` y `frontend_served_by`, pantallas con la tormenta puesta en ambos temas, sesión vencida, login con aviso y modo diagnóstico activo. |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Regla 47 `fallo-tecnico-no-es-ventana-estado-de-dato`; 2.32.0 → 2.33.0. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Regla 84 `ausencia-se-certifica-con-tormenta-fabricada`; 2.71.0 → 2.72.0. |
| `M` | `agents/registry.json` | Slugs de control nuevos en los dos agentes; versiones y `sha256` recalculados por `agents:sync`. |
| `M` | `agents/apexos-frontend/SKILL.md`, `agents/apexos-qa/SKILL.md` | Espejos del árbol de skills, regenerados por `agents:sync`. |
| `M` | `agents/CHANGELOG.md` | Entrada de esta intervención con causas medidas, evidencia y deudas. |
| `A` | `docs/briefs/2026-11-18-fallo-tecnico-no-es-ventana.md` | Este brief. |

### Módulos (`change_intent.modules`)

- `frontend-alert-silence`
- `hr-schedule-monitor`
- `hr-live-map`
- `transport-monitoring`
- `auth-session-notice`

### Borrados autorizados (`allowed_deletions`)

- ninguno (los retirados son símbolos dentro de archivos modificados: `notifyPlatform`, `emitAppAlert`, `APP_ALERT_EVENT`, el tipo `AppAlert` y el listener `apex:alert`)

## 3. Fuera de alcance

- **Fase 3, backend/API/BD (diferida por el dueño, decide después):** mapeo de `P2024`/`P2028`/`57014` a códigos accionables en vez de `ERROR_INTERNO` genérico; presupuesto de reintento del cliente frente al `statement_timeout` de 5 s; límite de 200 solicitudes/min por tenant; las lecturas que aún arrastran evidencia binaria; y los handlers `app/api/**` que todavía lanzan `Supabase ${status}: ${detail}`. Nada de esto se toca en este corte.
- **Fase 4:** deuda del fallback silencioso a Supabase cuando la API rechaza.
- **Torre interna:** `apps/control-tower/**` conserva sus banners técnicos por diseño — no es pantalla de cliente — y `docs/qa/evidence/**` de otras sesiones no se toca.
- **Promoción:** nada a `develop` ni a `main`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: no se modificó ninguna decisión de acceso, solo cómo se muestra un fallo.
- Sin secretos ni credenciales en el brief ni en el diff: la certificación no escribe tokens; el contexto de sesión del arnés es un objeto inventado y el endpoint de telemetría se stubbea.
- Trabajo en paralelo: `apps/api/src/modules/hr/monitorEvidenceRows.js` y `apps/api/test/hr-monitor-evidence-columns.test.js` siguen sin commitear porque son de otra sesión; el commit usa rutas exactas.

## 5. Criterios de aceptación

1. `npm run certify:technical-alerts-silence:local` → `VEREDICTO 68/68`, con `docs/qa/evidence/technical-alert-silence-20261118/certification.json` y `verdict.failed = 0`.
2. Con la API respondiendo 500 en todas sus rutas, `document.querySelectorAll('.platform-alert').length === 0` en `/dashboard/talento-humano/rutas`, `/talento-humano/mapa`, `/servicios`, `/transporte/monitoreo` y `/dashboard`, en tema claro y oscuro (10 pantallas × 3 comprobaciones).
3. Ninguna cadena técnica aparece en el texto pintado: ni `Ruta: /api/v1…`, ni `Estado: 500`, ni `ERROR_INTERNO`, ni `"error":`, ni `Failed to fetch`, ni `API no disponible`.
4. El fallo sí queda registrado: el mismo recorrido produce ≥ 3 `POST /api/v1/admin/platform-logs/client` (medido: 28).
5. Control positivo: con `localStorage.apexos_diagnostics = "1"` la tarjeta técnica vuelve (1 a 5 con `Ruta: /api/v1`) y respeta el presupuesto durante 40 s.
6. Sesión vencida: el cliente cae al login sin ventana y el formulario explica el cierre (palabra «inactividad» en pantalla) como aviso `role="status"`.
7. `node --test apps/web/test/technical-alert-silence.test.mjs apps/web/test/hr-monitor-refresh.test.mjs` → 14/14.
8. `node --test apps/web/test/*.test.mjs` → 822/830; los 8 fallos leen archivos idénticos a HEAD y ninguno toca los módulos de este corte.
9. `npm run typecheck` en `apps/web` → exit 0; ESLint sobre los archivos tocados → 0 errores.
10. `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage && npm run test:agents` → todos en verde (46/46 en `test:agents`).

## 6. Evidencia y certificación exigida

- Pruebas: `apps/web/test/technical-alert-silence.test.mjs` (nuevo), `apps/web/test/hr-monitor-refresh.test.mjs` (contrato de cadencia), suite completa de `apps/web/test/*.test.mjs`.
- Certificación: `npm run certify:technical-alerts-silence:local` (escriben `scripts/certifications/technical-alert-silence-browser-local.js`) con evidencia en `docs/qa/evidence/technical-alert-silence-20261118/`. Los `*.log` del arnés están gitignored y no se citan como evidencia.
- `certification_status` esperado: `local_passed_qa_pending`. Esta certificación corre contra una API deliberadamente caída en el puesto local; no sustituye la validación funcional en QA/Railway ni en Producción, que exigen despliegue.

## 7. Capacidades protegidas

- `silencio-del-cliente-ante-fallo-tecnico` — certificado por conteo de `.platform-alert` en el DOM con la tormenta fabricada en la capa de red, ambos temas.
- `trazabilidad-del-fallo` — certificado exigiendo a la vez la ausencia de ventana y la presencia de `POST /api/v1/admin/platform-logs/client` (28 registros).
- `canal-de-soporte` — control positivo: con la bandera encendida el detalle técnico vuelve y con tope (≤ 5 tarjetas por 60 s).
- `sesion-y-acceso` — `clearSession` y los motivos de cierre intactos; ningún cambio en guardas de RBAC; `sin_guard_de_acceso` es comprobación obligatoria de cada pantalla.
- `estado-del-dato-en-pantallas-vivas` — monitoreo TMS y mapa declaran última lectura o reintento en línea; el formulario conserva sus toasts con reintento.

## 8. Riesgos y rollback

- Riesgo: un fallo real pasa desapercibido porque ya no se anuncia. Mitigación: todo fallo sigue viajando a `platform-logs`, la pantalla afectada muestra su estado y soporte puede encender el canal técnico en el navegador del usuario. Rollback: revert de este commit (no reset).
- Riesgo: bajar los temporizadores a 30 s retrasa la percepción de datos en el monitor y el mapa. Mitigación: el evento de marcación ya refresca la pantalla; el temporizador es solo respaldo. Rollback: mismo revert.
- Riesgo: certificación en `next dev` vuelve a bloquear el cierre. Mitigación: el arnés exige `apps/web/.next/BUILD_ID` y falla de inmediato si no hay build de producción.
- Riesgo de entorno descubierto durante el cierre: `node_modules/lucide-react` estaba corrupto (sin `dist/cjs` y con solo `.js.map` en `dist/esm/icons`) y era la causa real de fallos de suite que venían archivándose como artefacto del entorno. Mitigación aplicada: se reconstruyó desde el tarball limpio de la versión declarada `^0.469.0` sin tocar `package.json` ni el lockfile; el residuo quedó como `node_modules/lucide-react.corrupt-20261118`.

## 9. Supuestos y preguntas abiertas

- Supuesto: el `NEXT_PUBLIC_API_URL` quemado en el build del puesto es `http://127.0.0.1:3000`; con la API local apagada, la tormenta del cliente en `desarrollo` queda explicada sin invocar latencia de nube.
- Supuesto: en QA y Producción la interfaz de alertas se veía igual porque el embudo es común (`apps/web/lib/api.ts`), no por defectos distintos por ambiente.
- Pendiente con su puerta (Fase 0, no bloquea este corte): la distribución real de fallos por usuario vive en `platform_logs` y requiere lectura autenticada o acceso a la base; se entrega como siguiente medición con su autorización.

## 10. Autorizaciones requeridas

- [x] Fases 0 y 1 en `desarrollo` (concedidas por el dueño en la misma intervención).
- [ ] Fase 3 en backend/API/BD — requiere decisión explícita del dueño.
- [ ] Despliegue a QA/Railway para validación funcional — requiere autorización independiente.
- [ ] Promoción a `develop` y `main` — no solicitada.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/web/lib/api.ts,…,scripts/certifications/technical-alert-silence-browser-local.js"` → `Veredicto: OK`; agentes requeridos `apexos-frontend`, `apexos-qa`, `equipo-apexos`.
- **Agentes consultados**: `equipo-apexos`, `apexos-frontend`, `apexos-qa` (lecturas obligatorias previas a la edición).
- **Documentación a actualizar**: `docs/briefs/2026-11-18-fallo-tecnico-no-es-ventana.md`, `docs/project/filosofia-producto-ui.md`, `docs/qa/evidence/technical-alert-silence-20261118/`.
- **Agentes a actualizar**: `apexos-frontend` 2.32.0 → 2.33.0 (regla 47, `fallo-tecnico-no-es-ventana-estado-de-dato`); `apexos-qa` 2.71.0 → 2.72.0 (regla 84, `ausencia-se-certifica-con-tormenta-fabricada`).
- **Registro**: `agents/registry.json` con los dos slugs nuevos y `version`/`updated_at`/`sha256` recalculados por `agents:sync`; entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"` → `apexos-frontend 2.33.0 local-ahead · CHANGELOG si · OK`.
- **Secuencia de cierre**: `npm run agents:sync` (11 agentes y 11 documentos) → `npm run agents:check` (OK) → `npm run agents:preflight` (OK) → `npm run agents:coverage` (OK) → `npm run test:agents` (46/46) → certificación 68/68 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`, con el inventario de la sección 2 y sin los artefactos del arnés (`apps/web/next-env.d.ts`, `apps/web/tsconfig.json`, `apps/web/.next*`, `docs/qa/evidence/**/next-start.log`, `Claude outputs/`, archivos de otra sesión).
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [x] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
