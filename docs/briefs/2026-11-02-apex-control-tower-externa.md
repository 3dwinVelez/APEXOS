# Brief — APEX Control: Torre externa, Telegram y fábrica

- **ID**: `2026-11-02-apex-control-tower-externa`
- **Fecha**: `2026-11-02`
- **Rama activa**: `desarrollo`
- **Origen**: corrección del alcance F0. La Torre no puede vivir dentro de la herramienta vigilada: si APEX se cae, la pantalla y el pulso se caen con él. La Torre pasa a ser un proceso local independiente con canal Telegram y puente hacia Qoder.

## 1. Objetivo

Construir una Torre de Control externa, ejecutable en Windows con `apex-control.bat`, que:

1. Opere aunque `apps/api` esté caída.
2. Consuma la API cuando esté disponible y, en paralelo, sondee directamente infraestructura y las tres ramas (`desarrollo`, `develop`, `main`).
3. Muestre un tablero web moderno con estado global, ramas, componentes, alertas, Telegram, fábrica y auditoría.
4. Reciba instrucciones del propietario por Telegram y envíe alertas.
5. Encole trabajos para la fábrica de desarrollo y los exponga a un puente que corre dentro de Qoder, con niveles de autorización y evidencia.

## 2. Principio de arquitectura

```text
Telegram <-> Torre local (Node, 127.0.0.1:4310) -> API /health y /apex-control/status
                    |
                    +-> Git: desarrollo, develop, main
                    +-> Redis, Brain, MinIO, Postgres, Docker
                    +-> Cola de trabajos <-> Puente Qoder (Qoder Desktop)
```

- La Torre no importa código de `apps/api` ni comparte su proceso.
- Sin dependencias npm: solo módulos nativos de Node 22+.
- La UI se sirve desde el mismo proceso; datos locales en `apps/control-tower/data/` (gitignored).
- Secretos solo en `apps/control-tower/.env.local`; nunca en el repositorio, eventos, logs o evidencia.

## 3. Alcance exacto

| Estado | Archivo | Qué hace |
|---|---|---|
| `A` | `apps/control-tower/package.json` | Workspace sin dependencias, scripts de prueba |
| `A` | `apps/control-tower/.env.example` | Variables de API, git, infraestructura, Telegram y puente |
| `A` | `apps/control-tower/README.md` | Operación, configuración, Telegram y puente |
| `A` | `apps/control-tower/server.js` | Servidor HTTP, SSE, REST, controles y arranque |
| `A` | `apps/control-tower/lib/config.js` | Carga de entorno y configuración validada |
| `A` | `apps/control-tower/lib/store.js` | Estado en memoria, JSON/JSONL local y auditoría |
| `A` | `apps/control-tower/lib/git.js` | Estado de las tres ramas, divergencia, flujo y evidencia |
| `A` | `apps/control-tower/lib/probes.js` | API, Postgres, Redis, Brain, MinIO, web y Docker |
| `A` | `apps/control-tower/lib/alerts.js` | Transiciones, huellas, deduplicación y reconocimiento |
| `A` | `apps/control-tower/lib/jobs.js` | Cola de trabajos, niveles y agentes sugeridos |
| `A` | `apps/control-tower/lib/telegram.js` | Long polling, allowlist, comandos, botones y alertas |
| `A` | `apps/control-tower/lib/security.js` | Redacción, token de puente, origen y cabeceras |
| `A` | `apps/control-tower/public/index.html` | Estructura del tablero |
| `A` | `apps/control-tower/public/styles.css` | Tema oscuro moderno, responsive y accesible |
| `A` | `apps/control-tower/public/app.js` | SSE, render, controles y formularios |
| `A` | `apps/control-tower/bridge/client.js` | Cliente del puente para el agente Qoder |
| `A` | `apps/control-tower/bridge/PROMPT.md` | Prompt operativo del agente puente |
| `A` | `apps/control-tower/test/git.test.js` | Pruebas de ramas, divergencia y flujo |
| `A` | `apps/control-tower/test/jobs.test.js` | Pruebas de cola y niveles |
| `A` | `apps/control-tower/test/telegram.test.js` | Pruebas de autorización y comandos |
| `A` | `apps/control-tower/test/alerts.test.js` | Pruebas de transiciones, cooldown y reconocimiento |
| `A` | `apps/control-tower/test/server.test.js` | Pruebas de API local, puente y SSE |
| `A` | `apex-control.bat` | Ejecutable local de Windows |
| `A` | `scripts/certifications/apex-control-tower-local.js` | Certificación local con API simulada |
| `M` | `package.json` | Scripts `control:start`, `control:test`, `certify:control-tower:local` |
| `M` | `.gitignore` | Excluir `apps/control-tower/data/` |
| `M` | `apps/web/app/dashboard/apex-control/page.tsx` | Aviso de telemetría secundaria y enlace a la Torre externa |

### Borrados autorizados

- ninguno.

## 4. Fuera de alcance

- Push, merge, deploy, migraciones remotas, cambios en Railway/Supabase o creación de ramas.
- Remediación autónoma (reiniciar servicios, limpiar colas, desplegar).
- Promoción de ramas desde la Torre; el nivel N4 queda reservado a un humano fuera de la Torre.
- Validación real del bot de Telegram: requiere token y chat del propietario; se certifica el modo simulación y el modo sin configurar.
- Ejecución autónoma de agentes Qoder: el `qc-cli` es host-only y no acepta procesos externos. Se implementa el protocolo de puente y la documentación; la certificación usa un puente simulado.
- Reparación del drift de la base local: tarea separada.
- Nuevas dependencias npm.

## 5. Restricciones

- Solo `desarrollo`; sin push, merge ni deploy.
- La Torre escucha en `127.0.0.1`; no se expone a la red por defecto.
- `git fetch` nunca es automático: solo con confirmación explícita desde la UI.
- Telegram: solo chats autorizados; cada mensaje se audita; sin ejecución de shell desde texto libre.
- El puente recibe un token local; sin token responde 401.
- Sin secretos en el repositorio ni en la evidencia.
- Toda la UI usa `textContent` para datos no confiables (mensajes, trabajos, ramas).

## 6. Criterios de aceptación

1. `apex-control.bat` inicia la Torre en `http://127.0.0.1:4310` sin `npm install` y sin depender de la API.
2. Con la API apagada, `/api/snapshot` responde y muestra `api` en `down`; la UI sigue operativa.
3. Con la API encendida, el snapshot muestra latencia y estado de `/health`; si hay token, incorpora la telemetría de `/apex-control/status`.
4. El snapshot incluye las tres ramas con SHA local, SHA remoto (`git ls-remote`), ahead/behind, último commit, árbol sucio y evidencia F0.
5. La divergencia se reporta con conteos; no genera alertas repetitivas.
6. `POST /api/actions/fetch` exige `confirm: true` y es la única operación que actualiza referencias.
7. Telegram en modo simulación: `/estado`, `/ramas`, `/obs`, `/impl`, `/qa`, `/aprobar` y chat no autorizado se comportan según contrato; los mensajes quedan auditados.
8. La fábrica crea borradores, exige aprobación para N2/N3, permite reclamar por el puente, reportar estado y adjuntar evidencia; N4 se rechaza.
9. El puente sin token recibe 401; con token completa el ciclo `queued -> claimed -> running -> done`.
10. `npm run control:test` pasa completo.
11. `npm run certify:control-tower:local` genera `docs/qa/evidence/apex-control-tower-f1/certification.json` y captura de la UI; termina en 0 solo si todo pasa.
12. La página interna de APEX Control muestra que es telemetría secundaria y cómo abrir la Torre externa.

## 7. Evidencia

- Pruebas: `apps/control-tower/test/*.test.js`.
- Certificación: `node scripts/certifications/apex-control-tower-local.js`.
- Evidencia: `docs/qa/evidence/apex-control-tower-f1/certification.json`, `tower-overview.png`, `tower-api-down.png`, `telegram-outbox.json`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 8. Capacidades protegidas

- Gobernanza de ramas: la Torre solo lee; no hace push/merge/deploy.
- Secretos: token de Telegram y de puente fuera del repo y de la evidencia.
- Aislamiento: la Torre es local, sin acceso a datos de negocio por tenant.
- API existente: no se modifica su contrato; F0 sigue certificado como telemetría.
- Web existente: el aviso no altera rutas ni permisos.

## 9. Riesgos y rollback

- Riesgo: el PC está apagado y no hay vigilancia. Mitigación: operación 24/7 en equipo siempre encendido; F4 agrega watchdog externo.
- Riesgo: `git ls-remote` sin red. Mitigación: timeout y estado `sin conexión`, sin bloquear el resto.
- Riesgo: alertas repetitivas. Mitigación: huellas, cooldown y alertas solo por transición.
- Riesgo: token de Telegram filtrado. Mitigación: `.env.local` gitignored, redacción y rotación por BotFather.
- Rollback: detener el `.bat` y eliminar `apps/control-tower/`; no toca la base ni la API.

## 10. Supuestos

- Node 22+ en el equipo local.
- El repositorio está en la misma máquina que la Torre.
- Telegram se usa para el propietario/equipo interno de APEX, no para clientes.
- La fábrica requiere Qoder Desktop abierto con el agente puente; sin él, los trabajos quedan en cola.
- La UI interna de F0 se conserva temporalmente como telemetría secundaria.
