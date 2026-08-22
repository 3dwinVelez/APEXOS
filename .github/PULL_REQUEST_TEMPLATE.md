## Objetivo

<!-- Explicar el problema y el resultado esperado. -->

## Alcance

- Módulos:
- Archivos o capas principales:
- Fuera de alcance:

## Reglas funcionales

- Reglas confirmadas:
- Supuestos:
- Preguntas pendientes:

## Riesgo ERP

- [ ] No modifica contabilidad, impuestos, inventario, costos ni nómina.
- [ ] Si modifica un dominio sensible, existe aprobación funcional explícita.
- [ ] No incluye migraciones destructivas.
- [ ] No cambia tenancy, RBAC o RLS sin revisión de seguridad.

## Seguridad y autonomía

- [ ] El trabajo se realizó en una rama no protegida.
- [ ] No se usaron bases de datos productivas.
- [ ] No se agregaron secretos, tokens ni credenciales.
- [ ] El agente no hizo merge, despliegue ni amplió permisos.
- [ ] La pull request requiere aprobación humana.

## Validación

| Comando o prueba | Resultado | Evidencia u observación |
| --- | --- | --- |
| `npm run agent:test -- --profile safe` |  |  |

Pruebas omitidas y motivo:

## Archivos y decisiones

- Archivos principales:
- Decisiones de arquitectura:
- Documentación o memoria actualizada:

## Riesgos pendientes y rollback

- Riesgos residuales:
- Estrategia de reversión:

## Revisiones

- [ ] Revisión técnica independiente.
- [ ] Revisión funcional cuando aplica.
- [ ] QA proporcional al riesgo.
- [ ] Aprobación humana pendiente.
