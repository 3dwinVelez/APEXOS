# Branching Workflow

APEXOS trabaja con 3 ramas activas:

- `main`: produccion estable.
- `develop`: integracion validada antes de promover a produccion.
- `desarrollo`: rama de trabajo para cambios locales, ajustes y validaciones.

Flujo obligatorio:

1. Crear y trabajar cambios sobre `desarrollo`.
2. Ejecutar validaciones locales y QA antes de integrar.
3. Subir `desarrollo` y luego promover los cambios hacia `develop`.
4. Cuando `develop` quede aprobado, promover hacia `main`.

Reglas operativas:

- No trabajar directamente sobre `main`.
- No trabajar directamente sobre `develop` salvo tareas de integracion controlada.
- Mantener sincronizada `desarrollo` con `develop` antes de iniciar un nuevo bloque de trabajo.
- Evitar ramas temporales persistentes. Si se usan para integracion puntual, deben eliminarse al terminar.
- Ejecutar `npm run qa:deterministic-validation` antes de promover cambios a `develop`.
