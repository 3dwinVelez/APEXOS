# Brief — El paquete acumulado de Talento Humano alineado con Producción

- **ID**: `2026-11-23-hr-paquete-main`
- **Fecha**: `2026-11-23`
- **Rama activa**: `desarrollo` (la promoción se ejecutó desde la auxiliar `codex/qa-hr-paquete-main-20261123`)
- **Prompt crudo**: "analiza los cambios en el modulo de talento humano en develop e igualad esta
  version con la de la rama main de productivo, ya que se trabajo en alinear algunas aplicaciones es
  indispensable que esten alineadas. verificaclo y promuevelo de manera controlada sin romper nada mas
  y trabajar con la intervencion de cambios aislados y especificos para que no se afecten otros cambios
  que estan en camino."

## 1. Objetivo

Que el módulo de Talento Humano que `develop` acumuló y que `main` no tenía quede **blob-idéntico** en
Producción, transportado como un replay puntual de un inventario cerrado y no como un merge de rama.
La segunda parte del encargo —"sin romper nada más"— se mide: el avance propio del destino y los frentes
en camino quedan dentro del candidato, no debajo.

Resultado: `origin/main` pasó de `c53f857c` a `336f28b0` (código) y a `e68eed4c` (evidencia del
después), con 49 rutas de HR y cero migraciones.

## 2. Alcance exacto

En `desarrollo` esta intervención versiona documentación, evidencia, instrumento y agentes. El transporte
de código ocurrió en `main` y se deja inventariado aquí porque es el alcance certificado.

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `docs/qa/certifications/hr-paquete-main-20261123.md` | Certificación de la pata `develop → main`: identidad del replay, cuatro reconstrucciones, 26 piernas y límites declarados. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/00-veredicto.md` | Dossier: ancla de build, narrativa de cada roja del arnés, resultado por familia, compuertas verbatim y DESPUÉS en Producción. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/equivalencia-blob-candidato.txt` | Los 49 hashes medidos ruta por ruta, con guarda falla-cerrada, y las 3 podas declaradas. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-escritura.json` | Corrida citable `20261123171846`: 26 piernas verdes sobre el build `914d1721965d`. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-escritura-25piernas-165957.json` | Corrida **superada por un control** (el retiro de mallas no se medía), conservada como evidencia del hallazgo. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-escritura-anclada-a4832a6a.json` | Corrida de la reconstrucción superada por el avance del destino. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-escritura-anclada-build107.json` | Corrida anclada al build 107, superada por la reconstrucción 4. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-lectura.json` | El ANTES: `BLOQUEADO`, 3 verdes, 9 rojas, 13 NO_APLICABLE sobre `2c10deaa`. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-autocontrol-piernas.txt` | Salida verbatim del `--selftest`: 26 piernas con `verde=true` y `distingue_rojo=true`. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-reposicion-huerfanos.txt` | Censo SQL de residuos, el hallazgo del retiro falso y la reposición medida 20 → 0. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/qa-despues-produccion.json` | Sonda de artefacto servido en Producción: health, chunks y endpoints, con sus límites. |
| `A` | `docs/qa/evidence/hr-paquete-main-20261123/suites-arbol-candidato.txt` | Seis suites del árbol del candidato: 45 pruebas, 45 pasan. |
| `A` | `docs/qa/manifests/hr-paquete-main-20261123-scope.json` | Manifiesto v2: el inventario exacto con que pasó la compuerta de alcance. |
| `A` | `docs/qa/manifests/hr-paquete-main-20261123-approval.json` | Manifiesto de aprobación: cinco chequeaduras, NYVORA en QA y plan de retroceso. |
| `A` | `scripts/certifications/hr-paquete-main-qa.js` | Instrumento de campo de 26 piernas (sha256 `fc73dc53…`), con `--selftest` y reposición de residuos. |
| `A` | `docs/briefs/2026-11-23-hr-paquete-main.md` | Este brief. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` y su espejo `agents/apexos-qa/SKILL.md` | Control 115: el retiro afirmado sin lectura con sesión viva y el inventario que declara sus propias rutas. |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` y su espejo | Control 72: reconstruir sobre el tip nuevo es la regla, no el retry. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` y su espejo | Control 95: el brief de una promoción no describe el paquete, describe el transporte medido. |
| `M` | `.qoder/skills/apexos-git-guardian/SKILL.md` y su espejo | Control 44: la rama auxiliar se mueve con respaldo, nunca se empuja un ref distinto del medido. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Versiones, `updated_at`, `sha256` y la entrada de cierre. |

### Módulos (`change_intent.modules`)

- `talento-humano-bancos`, `talento-humano-liquidacion-retiro`, `talento-humano-nomina`,
  `talento-humano-horarios-unificados`, `talento-humano-aterrizaje`, `talento-humano-marcacion-selfie`,
  `qa-evidencia`

### Borrados autorizados (`allowed_deletions`)

- ninguno. El inventario de las 49 rutas no contiene una sola `D` y el delta de `apps/api/prisma/**` es
  cero.

## 3. Fuera de alcance

- El merge de `develop` a `main`: entre los dos destinos hay **1 094 rutas** y frentes sin pata
  certificada para Producción (buzón, facturas recibidas, comercio M-30, torre, piso de latencia, PYG
  ampliado). Viajan solo las 49 del paquete.
- `apps/control-tower/**` (reposa solo en `desarrollo`), `agents/**` y `.qoder/skills/**` en ramas
  liberadas, `package.json` (no se añaden scripts de certificación al destino) y el maestro PYG ampliado.
- Migraciones remotas, cambios de esquema, Railway/Supabase y secretos: nada. La promoción no desplegó
  nada por sí misma; Railway lo hizo desde `main`.
- El frente hermano de mallas (`790870a0..c53f857c`) no se reescribe: se absorbe porque `develop` ya lo
  traía y el replay lo respeta línea por línea (122 líneas propias del destino, 0 perdidas).

## 4. Restricciones

- Rama: la implementación vive en `desarrollo`/`develop`; la pata a `main` se ejecutó por replay
  puntual desde la auxiliar, con autorización expresa del propietario y sin force push.
- Aislamiento multi-tenant y RBAC intactos: la pierna `aislamiento_tenant_lectura` y el contraste de
  roles sobre el mismo endpoint de nómina siguen en verde.
- Sin secretos en evidencia: las contraseñas efímeras se generan en runtime y no se versionan; se
  verificó que ningún artefacto contenga JWT ni la contraseña del corte.

## 5. Criterios de aceptación

1. `npm run qa:promotion:scope -- docs/qa/manifests/hr-paquete-main-20261123-scope.json <candidato> origin/main`
   → `ALCANCE DE PROMOCION VALIDO: hr-paquete-main-20261123 (63 rutas)` contra baseline `c53f857c`.
2. `npm run qa:approval:evidence -- docs/qa/manifests/hr-paquete-main-20261123-approval.json`
   → `APROBACION QA VALIDA: hr-paquete-main-20261123`.
3. `node scripts/certifications/hr-paquete-main-qa.js --env-file=config/qa.env --escribe-en-qa=SI`
   → `APROBADO`, 26 piernas verdes, 0 rojas, 0 NO_APLICABLE, con `paridad_blobs_hr = 10/10` y
   `EXCLUIDOS_DECLARADOS` vacío.
4. `node scripts/certifications/hr-paquete-main-qa.js --selftest` → 26 líneas `OK` con
   `verde=true distingue_rojo=true` (toda pierna debe poder fallar).
5. En Producción, `GET /health` → `commit = 336f28b0a695`; las rutas nuevas responden `401` (existen y
   están detrás de la autenticación) y el bundle servido contiene los literales del frente.
6. El retiro de mallas se observa con lectura real: `PATCH /hr/routes/:id {status:"inactive"}` deja la
   malla `inactive` en el listado y el censo SQL cierra en **0 activas** de este frente.

## 6. Evidencia y certificación exigida

- Pruebas de árbol: seis suites, 45/45 (`suites-arbol-candidato.txt`).
- Certificación de campo: `scripts/certifications/hr-paquete-main-qa.js`
  (sha256 `fc73dc533b0997df2655c270db170fa8b6eeec9da3b18c3004a3fa1d3223dbba`), evidencia en
  `docs/qa/evidence/hr-paquete-main-20261123/`.
- `certification_status`: `qa_approved` con el DESPUÉS de Producción versionado como sonda de artefacto
  (`qa-despues-produccion.json`). La pata que despliega el candidato suelto en QA sigue bloqueada y se
  declara como límite, no como verde.

## 7. Capacidades protegidas

- Marcación web con selfie y compuerta de horario — piernas 18-23 de la corrida de campo.
- Maestro de bancos sin pisar otras claves de `Tenant.config` — `escritura_banco_preserva_otras_configuraciones`.
- Horarios unificados: lectura coincidente, contención sin `P2028` y retiro real por estado — piernas 15-17.
- Liquidación de retiro con recibo PDF y revisión de días — piernas 12-13 y 24.
- Aislamiento de tenant y RBAC de nómina — piernas 22 y 25, con control de contraste en `200`.
- El avance propio de `main` (maestro único de mallas) — `equivalencia-blob-candidato.txt` y la suite
  `hr-attendance-state.test.mjs` tomada byte a byte del destino.

## 8. Riesgos y rollback

- Riesgo: que el replay revirtiera capacidad ya servida. Mitigación: barrido de 15 marcadores de
  capacidad (0 se revertirían) y 122 líneas propias del destino conservadas. Rollback: `git revert`
  controlado sobre `main` con `previous_main_commit = c53f857c…` (revert, no reset).
- Riesgo: quedar con un verde que no puede fallar. Mitigación: `--selftest` obligatorio y la pierna 26
  que midió el retiro real; dos verdes falsos murieron ahí.
- Riesgo: contaminar QA con residuos. Mitigación: retiro por endpoint y reposición medida 20 → 0 con
  censo SQL antes y después.

## 9. Supuestos y preguntas abiertas

- Supuesto: el contenido de las 10 rutas ancla HR blob-idéntico al build servido equivale a certificar
  el contenido que viaja, mientras la pata de despliegue del candidato suelto siga caída. Queda declarado
  en la certificación como límite, no como prueba.
- Deuda abierta con dueño: el paquete **no existe en `desarrollo`**; la retrointegración la cierra el
  propietario del frente, no se oculta con esta promoción.
- Pregunta pendiente sin efecto en el alcance: cuándo se repara el despliegue del candidato suelto en QA
  (API 503/404) para poder cerrar esa pata sin ancla prestada.

## 10. Autorizaciones requeridas

- [x] Dirección `develop → main`, alcance "paquete HR acumulado completo" y manejo de compuertas
  ("certificar en QA y luego pedir autorización de push"), decididos por el propietario.
- [x] "Sí: promover ahora", con la forma previewada
  `APEXOS_PROMOTION_AUTH=AUTORIZO_PROMOVER_DEVELOP_A_MAIN git push origin codex/qa-hr-paquete-main-20261123:main`.
- [ ] Promoción del frente de telemetría/excepción de selfie (`desarrollo → develop → main`): no
  autorizada y no incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "docs/briefs/2026-11-23-hr-paquete-main.md,docs/qa/certifications/hr-paquete-main-20261123.md,docs/qa/evidence/hr-paquete-main-20261123,scripts/certifications/hr-paquete-main-qa.js,docs/qa/manifests/hr-paquete-main-20261123-scope.json,docs/qa/manifests/hr-paquete-main-20261123-approval.json,agents/CHANGELOG.md,agents/registry.json,.qoder/skills"`
  → veredicto `OK_CON_ADVERTENCIAS`, 11 agentes `in-sync`, ruteo: `equipo-apexos`, `apexos-brief`,
  `apexos-git-guardian`, `apexos-qa`. Advertencia: rutas sin agente asignado `.qoder/skills` (usa
  `equipo-apexos`).
- **Agentes consultados**: los cuatro del ruteo (lecturas obligatorias ejecutadas antes de editar).
- **Documentación a actualizar**: `docs/briefs/2026-11-23-hr-paquete-main.md`,
  `docs/qa/certifications/hr-paquete-main-20261123.md`, `docs/qa/evidence/hr-paquete-main-20261123/**`,
  `docs/qa/manifests/hr-paquete-main-20261123-{scope,approval}.json`.
- **Agentes a actualizar**: `apexos-qa` 2.102.0 → 2.103.0 (control 115); `equipo-apexos` 2.59.0 →
  2.60.0 (control 72); `apexos-brief` 2.81.0 → 2.82.0 (control 95); `apexos-git-guardian` 2.27.0 →
  2.28.0 (control 44).
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<las rutas de arriba>"` en verde antes
  del commit; `agents:sync`, `agents:check` y `agents:preflight` finales también en verde.
- **Secuencia de cierre**: `npm run agents:sync` → `agents:check` → `agents:preflight` →
  `agents:coverage` → pruebas de la sección 5 → commit con rutas explícitas → push.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push,
  merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
