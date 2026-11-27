# Flujo De Ramas Y Ambientes

## Objetivo

Mantener tres ambientes claros:

- `desarrollo`: ambiente local de construccion y ajuste.
- `develop`: ambiente de integracion, QA y certificacion.
- `main`: ambiente estable para liberacion y produccion.

## Flujo obligatorio

```text
desarrollo -> develop -> main
```

Ningun agente, desarrollador, administrador o automatizacion puede saltarse el flujo `desarrollo -> develop -> main`.

Una urgencia productiva modifica la prioridad del cambio, pero nunca modifica el flujo de ramas, las pruebas ni las autorizaciones requeridas.

La ausencia de autorizacion expresa debe interpretarse como prohibicion.

## Flujo operativo

1. Trabajar exclusivamente en `desarrollo`.
2. Sincronizar `desarrollo` con `develop` antes de iniciar cambios.
3. Ejecutar validaciones deterministicas.
4. Preparar evidencia de promocion `desarrollo` a `develop` cuando el bloque quede estable.
5. Promover `develop` a `main` solo con QA aprobado, evidencia y autorizacion explicita.

## Comandos practicos

### Actualizar desarrollo

```powershell
git switch desarrollo
npm run workflow:status
npm run governance:guard
npm run workflow:sync-desarrollo
```

### Validar antes de integrar

```powershell
npm run qa:deterministic-validation
powershell -File scripts/git/promote-desarrollo-to-develop.ps1 -DryRun -RunTests
```

### Preparar promocion a develop

```powershell
git switch desarrollo
git add .
git commit -m "mensaje del cambio"
npm run qa:deterministic-validation
powershell -File scripts/git/promote-desarrollo-to-develop.ps1 -DryRun -RunTests
```

### Preparar promocion a main

```powershell
git switch develop
git pull
npm run qa:deterministic-validation
powershell -File scripts/git/promote-develop-to-main.ps1 -DryRun -RunTests -QaVerdict APROBADO -ReleaseId <id> -RollbackPlan <plan>
```

## Checklist antes de mover a produccion

- `develop` sin cambios locales.
- Validacion deterministica completada sin fallos.
- Cambios de autenticacion, sesiones y usuarios revisados.
- Riesgos conocidos documentados o cerrados.
- Aprobacion funcional para despliegue en `main`.
- Plan de rollback documentado.

## Residentes que nunca se promueven

Algunos bloques se ejecutan desde `desarrollo` y no forman parte de los artefactos desplegados en `develop` o `main`. Su rama de residencia se declara aqui y en su propio README; un agente no puede proponer su promocion sin una autorizacion expresa nueva.

- `apps/control-tower/**` (APEX Control Tower): panel de lectura solo-lectura que se ejecuta en la maquina del equipo desde `desarrollo`. No se despliega, no se promueve a `develop` ni a `main`, y sus certificaciones (`npm run certify:control-tower:*`) certifican la herramienta en `desarrollo`, nunca sirven de evidencia de promocion. Sus secretos viven en `apps/control-tower/.env.local` (gitignored) y no entran en ningun manifiesto de alcance.
- El modulo `apps/api/src/modules/apex-control/**` y la telemetria de `/health` si pertenecen al flujo `desarrollo -> develop -> main`: son la otra mitad de la conexion. Que la torre repose en `desarrollo` no elimina la necesidad de promover y desplegar el API para que la torre lea QA y PROD.

## Reglas

- No trabajar directamente en `main`.
- No trabajar directamente en `develop`.
- No usar ramas persistentes fuera de `main`, `develop` y `desarrollo`.
- No crear ramas auxiliares sin autorizacion expresa, proposito documentado y condicion de limpieza.
- No promover a `develop` si `desarrollo` no esta limpia o no paso QA.
- No promover a `main` si `develop` no esta limpia o no paso QA.
- No usar force push, force-with-lease, rebase de ramas permanentes, `git reset --hard` ni `git clean -fd` automaticamente.
- No desplegar, ejecutar migraciones remotas, modificar Railway, modificar Supabase ni cambiar secretos sin autorizacion explicita independiente.
