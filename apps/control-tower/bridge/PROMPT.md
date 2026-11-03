# Puente Qoder de APEX Control Tower

Este documento define cómo una sesión de Qoder se conecta a la torre local para recibir instrucciones del usuario (panel o Telegram), ejecutarlas con los agentes de APEXOS y reportar resultados.

## Por qué existe un puente

`qc-cli` es una herramienta del host de Qoder: inyecta `--invocation-id`, exige sesión de Qoder y no puede ser invocada por un proceso Node externo. La torre tampoco debe ejecutar código ni git por sí sola. Por eso:

```text
Telegram / panel -> Torre (cola de trabajos) -> Puente (HTTP local) -> Sesión Qoder -> Agentes APEXOS
```

La torre **no** ejecuta comandos. Solo encola, autoriza y audita. El agente Qoder es quien trabaja.

## Preparación (una sola vez)

1. La torre debe estar corriendo (`apex-control.bat` o `node apps/control-tower/server.js`).
2. El token del puente vive en `apps/control-tower/.env.local` como `BRIDGE_TOKEN`. Nunca se pega en el chat, en un brief ni en un commit.
3. En la sesión de Qoder, exporta el token sin mostrarlo:

```bash
export BRIDGE_TOKEN="$(node -e "const c=require('./apps/control-tower/lib/config').loadConfig();process.stdout.write(c.bridge.token)")"
git branch --show-current
```

4. Confirma que la rama activa sea `desarrollo`. Si no lo es, detente y repórtalo.

## Protocolo

Todas las llamadas usan `apps/control-tower/bridge/client.js`:

```bash
node apps/control-tower/bridge/client.js register
node apps/control-tower/bridge/client.js claim --level N2
node apps/control-tower/bridge/client.js heartbeat JOB-20261102-101500-ab12
node apps/control-tower/bridge/client.js complete JOB-... --status completed \
  --summary "Se corrigio X y se ejecutaron las pruebas" \
  --evidence docs/qa/evidence/...,apps/api/test/... \
  --tests "passed=12,failed=0"
node apps/control-tower/bridge/client.js release JOB-... --note "Bloqueado por credenciales"
```

`claim` devuelve el trabajo, el envoltorio de ejecución y las reglas. Si no hay trabajo, responde `SIN_TRABAJO`. Si ya hay un trabajo activo, responde `TRABAJO_ACTIVO`: no reclames otro.

## Niveles y autorización

| Nivel | Qué permite | Aprobación |
|---|---|---|
| N0 | Observar, leer estado y evidencia | No |
| N1 | Analizar y proponer plan, sin tocar archivos | No |
| N2 | Implementar solo en `desarrollo`, con pruebas | Sí, humana |
| N3 | Certificación local y pre-QA | Sí, humana |
| N4 | Push, merge, deploy, migración remota | Prohibido para la torre y para el puente |

Si un trabajo N2/N3 aparece en `claim`, la torre ya verificó que fue aprobado. Si un trabajo N4 se intenta crear, la torre lo rechaza con `NIVEL_HUMANO`.

## Despacho por skill

- N0: `apexos-git-guardian`, probes y lectura de evidencia.
- N1: `apexos-git-guardian` + análisis del módulo afectado.
- N2: `apexos-git-guardian`, `apexos-backend` y/o `apexos-frontend`, `apexos-qa`. Usa `equipo-apexos` si el cambio cruza disciplinas.
- N3: `apexos-qa` con manifiesto de alcance y certificación versionada.

## Reglas de ejecución

1. Verifica rama, árbol y alcance antes de tocar archivos.
2. No hagas commit, push, merge, deploy, rebase, `reset --hard` ni `clean -fd`.
3. No ejecutes migraciones remotas ni cambies Railway/Supabase.
4. No incluyas secretos en código, briefs, eventos, logs ni mensajes.
5. Toda entrega requiere pruebas y evidencia con ruta real.
6. Si no puedes completar el trabajo, reporta `blocked` o `failed` con motivo. Nunca inventes éxito.
7. Envía `heartbeat` al menos cada 30 segundos durante trabajos largos. Sin latido, la torre marca el puente fuera de línea y avisa por Telegram.
8. Al terminar, `complete` con resumen breve, evidencia y conteo de pruebas. El resultado aparece en el panel y se notifica por Telegram.

## Formato de cierre

```text
--summary: una o dos frases de qué cambió y por qué
--evidence: rutas versionadas (certificación, capturas, reportes)
--tests: passed=N,failed=N
--status: completed | failed | blocked
```

Si el trabajo queda en `blocked`, la torre lo muestra como bloqueo y no permite promociones. La ausencia de certificación end-to-end bloquea cualquier promoción según `AGENTS.md`.

## Bucle recomendado de la sesión

1. `register`
2. `claim`
3. Si no hay trabajo, espera y repite `claim` (o usa `watch` para latido automático).
4. Ejecuta con el skill correspondiente.
5. `heartbeat` periódico.
6. `complete` con evidencia.
7. Vuelve a `claim`.
