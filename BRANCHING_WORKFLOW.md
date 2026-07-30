# Branching Workflow

Documento normativo: `docs/governance/GIT_BRANCHING_AND_RELEASE_POLICY.md`.

APEXOS trabaja con 3 ramas activas:

- `main`: produccion estable. Todo lo que llegue aqui se considera candidato directo a despliegue.
- `develop`: integracion validada antes de promover a produccion.
- `desarrollo`: rama de trabajo para cambios locales, ajustes y validaciones.

Flujo obligatorio:

1. Crear y trabajar cambios sobre `desarrollo`.
2. Ejecutar validaciones locales y QA antes de integrar.
3. Subir `desarrollo` y luego promover los cambios hacia `develop`.
4. Cuando `develop` quede aprobado, promover hacia `main`.

Comandos recomendados:

1. `npm run workflow:status`
2. `npm run workflow:sync-desarrollo`
3. `npm run qa:deterministic-validation`
4. `npm run workflow:promote-develop`
5. `git switch develop`
6. `npm run workflow:promote-main`

Reglas operativas:

- La ausencia de autorizacion explicita se interpreta como prohibicion para crear ramas, hacer push, hacer merge en ramas compartidas, desplegar, ejecutar migraciones remotas, eliminar ramas o modificar infraestructura.
- No trabajar directamente sobre `main`.
- No trabajar directamente sobre `develop` salvo tareas de integracion controlada.
- Mantener sincronizada `desarrollo` con `develop` antes de iniciar un nuevo bloque de trabajo.
- Evitar ramas temporales persistentes. Si se usan para integracion puntual, deben eliminarse al terminar.
- Ejecutar `npm run qa:deterministic-validation` antes de promover cambios a `develop`.
- Promover a `main` solo desde `develop` limpia y validada.

## Guia Practica

### 1. Actualizar ambiente local de desarrollo

```powershell
git switch desarrollo
npm run workflow:status
npm run workflow:sync-desarrollo
npm install
npm run qa:deterministic-validation
```

### 2. Subir trabajo desde desarrollo hacia develop

```powershell
git switch desarrollo
git add .
git commit -m "mensaje claro del ajuste"
npm run qa:deterministic-validation
npm run workflow:promote-develop
```

### 3. Promover un ambiente validado de develop hacia main

```powershell
git switch develop
git pull
npm run qa:deterministic-validation
npm run workflow:promote-main
```

Checklist minimo antes de promover a `main`:

- `develop` limpia y sincronizada con remoto.
- Validacion deterministica en verde.
- Sin errores abiertos de sesiones, seguridad o multiusuario.
- Flujo critico de usuarios validado.
- Confirmacion de que el cambio esta aprobado para produccion.

### 4. Verificacion rapida del flujo

```powershell
npm run workflow:status
git branch -vv
```
