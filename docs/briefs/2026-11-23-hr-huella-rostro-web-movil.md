# Brief — Huella y rostro para marcar desde la web móvil, ingreso con huella y celular del camión

- **ID**: `2026-11-23-hr-huella-rostro-web-movil`
- **Fecha**: `2026-11-23`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "sube los cambios del servidor a desarrollo"

## 1. Objetivo

Dar a la web móvil de APEXOS (PWA aparte, repositorio `AppApexos`) el servidor que necesita para que varias personas marquen en el mismo celular y se sepa quién marcó: huella del usuario (WebAuthn) primero, selfie comparada con el rostro registrado después, ingreso a la app con la huella y celular compartido del camión. Publicar en `origin/desarrollo` integrado con lo que ya estaba en la remota.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/hr/shared-device-identity.js` | Celular del camión: registro WebAuthn por placa y firma de la marcación de la tripulación (`verifyCrewAssertion`, asincrónica). |
| `A` | `apps/api/src/modules/hr/face-identity.js` | Rostro con Human 3.3.6 (wasm en Node): embedding, similitud coseno, antispoof/liveness informativos. |
| `A` | `apps/api/src/modules/hr/face-consent.js` | Texto y versión de la autorización de datos biométricos. |
| `A` | `apps/api/src/modules/hr/personal-webauthn.js` | Huella propia: registro, firma de marcación v2 y reto/verificación del ingreso. |
| `M` | `apps/api/src/modules/hr/mobile-identity.js` | Solo exporta `publicKeyFrom` y `normalizeSelfie` para el celular del camión. |
| `M` | `apps/api/src/modules/hr/service.js` | Rutas de servicio de celular compartido, rostro y huella; `fingerprintForPunch`/`faceMatchForPunch` en `createOwnPunch`. |
| `M` | `apps/api/src/modules/hr/routes.js`, `apps/api/src/modules/hr/schema.js` | Endpoints `/hr/shared-devices*`, `/hr/self/face-enrollment`, `/hr/face-enrollments`, `/hr/self/webauthn*`. |
| `M` | `apps/api/src/modules/auth/service.js`, `routes.js`, `schema.js` | `POST /auth/webauthn/challenge` y `/auth/webauthn/login`; `startSession` compartido con `/auth/login`. |
| `M` | `apps/api/prisma/schema.prisma` | `HrSharedDevice`, `HrFaceEnrollment`, `HrWebauthnCredential`. |
| `A` | `apps/api/prisma/migrations/*hr_shared_devices*`, `*hr_face_enrollments*`, `20261122120000_hr_webauthn_credentials` | Tablas nuevas, idempotentes. |
| `M` | `apps/api/package.json`, `package-lock.json` | `@vladmandic/human`, `@tensorflow/tfjs-backend-wasm`. |
| `A`/`M` | `apps/web/app/dashboard/talento-humano/rostros/page.tsx`, `dispositivos-marcacion/page.tsx`, `reportes/page.tsx`, `page.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/moduleFunctions.ts` | Monitor de rostros, maestro de celulares de marcación y nota «Rostro coincide / SIN HUELLA» en reportes. |
| `A`/`M` | `apps/api/test/hr-shared-device-identity.test.js`, `hr-face-identity.test.js`, `hr-personal-webauthn.test.js`, `auth-webauthn-login.test.js`, `hr-deferred-marking-offline.test.js`, `apps/web/test/hr-face-enrollments-page.test.mjs`, `hr-shared-devices-page.test.mjs` | Pruebas. |
| `M` | `.qoder/skills/apexos-{backend,seguridad,db-nube,frontend}/SKILL.md`, `agents/CHANGELOG.md`, `agents/registry.json`, `docs/project/modulos/talento-humano.md` | Contexto vivo y documentación. |

### Módulos (`change_intent.modules`)

- `talento-humano`
- `auth`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- La web móvil en sí (repositorio aparte `AppApexos`, desplegada en Railway en un proyecto propio).
- La app Flutter: intacta.
- Migraciones en QA/Producción, variables de Railway y promoción a `develop`/`main`: requieren autorización independiente.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo`. Prohibido `develop`, `main`, force push, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant: toda lectura de credenciales y rostros filtra por `tenant_id`; el reto de ingreso firma empresa y usuario.
- Sin secretos: el reto se firma con `JWT_SECRET` existente; orígenes/RP por variables de entorno.
- Dos archivos preparados por otra persona (`apps/web/app/login/page.tsx`, `apps/web/components/shell/Sidebar.tsx`) se apartaron en `git stash` durante la integración y NO forman parte de este cambio.

## 5. Criterios de aceptación

1. `node --test apps/api/test/hr-*.test.js apps/api/test/auth-*.test.js apps/api/test/security-*.test.js apps/api/test/authorization-*.test.js` (con `DISABLE_REDIS=true`) → 379/379.
2. Marcación web con firma de huella válida → `identity_verification.fingerprint.status = verificada`; firma de otro usuario, tipo o idempotencia → 403 `FIRMA_NO_CORRESPONDE`.
3. Ingreso con huella → misma sesión que `/auth/login`; reto reusado → 401 `HUELLA_RETO_USADO`; llave de otro usuario → 401 `HUELLA_NO_REGISTRADA`; sin `WEBAUTHN_*` → 503.
4. Selfie que no coincide con el rostro registrado → la marcación se guarda SEÑALADA (`face_match.status = no_coincide`).

## 6. Evidencia y certificación exigida

- Pruebas: las suites del criterio 1, `apps/web` suites de talento humano (123/123) y `tsc --noEmit`.
- Verificación de punta a punta local: web móvil contra API simulada que carga los módulos reales (`personal-webauthn.js`, `face-identity.js`), autenticador WebAuthn de software y rostros de muestra (huella primero, selfie después; ingreso con huella; reenvío y llave ajena rechazados).
- **Certificación versionada contra QA: pendiente.** `certification_status`: `local_simulated`. **Bloquea la promoción a `develop`** (AGENTS.md: certificación parcial o solo simulada bloquea promoción).

## 7. Capacidades protegidas

- Marcación de la app nativa (`apexos-movil`): `fingerprintForPunch` la omite; su firma sigue en `mobile-identity.js` (suites `hr-mobile-*`).
- Novedad manual de otro día o corrección de escalera: conservada tras el conflicto (`hr-marking-*`, `hr-deferred-marking-offline`).
- Degradación de evidencia y corrección administrativa en reportes: conservadas tras el conflicto.
- Login por correo y clave: mismo `startSession`; `auth-session-hardening` en verde.

## 8. Riesgos y rollback

- Riesgo: el lector del teléfono acepta cualquier dedo inscrito → Mitigación: marcar exige además el rostro; documentado en `apexos-seguridad` regla 51.
- Riesgo: nonce del reto de ingreso es por instancia → Mitigación: vencimiento de 2 minutos y contador de firmas.
- Riesgo: umbral del rostro sin calibrar con fotos reales → Mitigación: el servidor señala, no rechaza; calibrar antes de producción.
- Rollback: `git revert` de los commits del cambio (nunca reset); las tablas nuevas no afectan tablas existentes.

## 9. Supuestos y preguntas abiertas

- Supuesto: el dominio definitivo de la web móvil se decide antes de configurar `WEBAUTHN_*` (las llaves quedan atadas al dominio).

## 10. Autorizaciones requeridas

- [x] Push a `origin/desarrollo` (pedido del dueño: «sube los cambios del servidor a desarrollo»).
- [ ] Migraciones en QA y Producción.
- [ ] Variables `WEBAUTHN_ORIGINS` / `WEBAUTHN_RP_IDS` en Railway.
- [ ] Promoción a `develop` (además requiere la certificación de la sección 6).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: apertura `INTEGRAR_REMOTO` (desarrollo 62 commits detrás); tras integrar `origin/desarrollo` (merge `3900f562`), `OK_CON_ADVERTENCIAS` (rutas `apps/api/prisma` y `apps/api/test` sin agente asignado → `equipo-apexos`).
- **Agentes consultados**: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- **Documentación actualizada**: este brief y `docs/project/modulos/talento-humano.md`.
- **Agentes actualizados**: `apexos-backend` 2.24.0 → 2.25.0 (regla 41); `apexos-seguridad` 2.36.0 → 2.37.0 (regla 51); `apexos-db-nube` 2.7.0 → 2.8.0 (regla 19); `apexos-frontend` 2.41.0 → 2.42.0 (regla 56); `apexos-brief` 2.82.0 → 2.83.0 (regla 96).
- **Registro**: `agents/registry.json` por `agents:sync` y entrada en `agents/CHANGELOG.md` (2026-11-23).
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `agents:preflight` → `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
