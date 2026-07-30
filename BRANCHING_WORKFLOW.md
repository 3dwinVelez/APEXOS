# Branching Workflow

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
2. `npm run governance:guard`
3. `npm run workflow:sync-desarrollo`
4. `npm run qa:deterministic-validation`
5. `powershell -File scripts/git/promote-desarrollo-to-develop.ps1 -DryRun -RunTests`
6. `git switch develop`
7. `powershell -File scripts/git/promote-develop-to-main.ps1 -DryRun -RunTests -QaVerdict APROBADO -ReleaseId <id> -RollbackPlan <plan>`

Reglas operativas:

- No trabajar directamente sobre `main`.
- No trabajar directamente sobre `develop` salvo tareas de integracion controlada.
- Ningun agente, desarrollador, administrador o automatizacion puede saltarse el flujo `desarrollo -> develop -> main`.
- Una urgencia productiva modifica la prioridad del cambio, pero nunca modifica el flujo de ramas, las pruebas ni las autorizaciones requeridas.
- La ausencia de autorizacion expresa debe interpretarse como prohibicion.
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
npm run governance:guard
npm run qa:deterministic-validation
```

### 2. Subir trabajo desde desarrollo hacia develop

```powershell
git switch desarrollo
git add .
git commit -m "mensaje claro del ajuste"
npm run qa:deterministic-validation
powershell -File scripts/git/promote-desarrollo-to-develop.ps1 -DryRun -RunTests
```

### 3. Promover un ambiente validado de develop hacia main

```powershell
git switch develop
git pull
npm run qa:deterministic-validation
powershell -File scripts/git/promote-develop-to-main.ps1 -DryRun -RunTests -QaVerdict APROBADO -ReleaseId <id> -RollbackPlan <plan>
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
