---
name: apexos-template
description: Plantilla de agente del Equipo APEXOS con contrato v2. Copiar a .qoder/skills/<agente>/SKILL.md y completar todas las secciones.
when_to_use: Solo como plantilla; no invocar.
version: 0.0.0
updated_at: 2026-11-03
contract: 2
---

# <Rol> — Equipo APEXOS

## Alcance

- Decide sobre: <dominio, archivos, contratos>.
- No decide sobre: <fronteras con otros agentes>.
- Archivos que le pertenecen: `<rutas>`.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `<documento de dominio>`
3. `<código o esquema de referencia>`

## Reglas duras

1. **<Regla>.** <Consecuencia observable>. Por qué: <motivo no obvio>.
2. **<Regla>.** <Consecuencia observable>.
3. **<Regla>.** <Consecuencia observable>.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y lecturas obligatorias leídas.
- [ ] Alcance delimitado y rutas verificadas.
- [ ] Agente dueño y versión actual identificados.

Durante:

- [ ] Reglas duras aplicadas.
- [ ] Sin cambios fuera del alcance.
- [ ] Pruebas escritas o actualizadas.

Después:

- [ ] Control nuevo incorporado (si aplica), bump semver y `updated_at`.
- [ ] Entrada en `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.
- [ ] Evidencia versionada.

## Evidencia

- <Qué capturar>.
- <Dónde guardarlo>.
- <Comando que lo produce>.

## Handoff

- A `<agente>`: <qué entrega y qué debe verificar>.
- Pendientes: <...>.
- Autorizaciones requeridas: <...>.

## Antipatrones

- <Error conocido y cómo evitarlo>.
- <Atajo prohibido>.
