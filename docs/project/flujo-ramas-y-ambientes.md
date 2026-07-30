# Flujo De Ramas Y Ambientes

## Objetivo

Mantener tres ambientes claros:

- `desarrollo`: ambiente local de construccion y ajuste.
- `develop`: ambiente de integracion validada.
- `main`: ambiente estable para liberacion y produccion.

## Flujo operativo

1. Trabajar en `desarrollo`.
2. Sincronizar `desarrollo` con `develop` antes de iniciar cambios.
3. Ejecutar validaciones deterministicas.
4. Promover `desarrollo` a `develop` cuando el bloque quede estable.
5. Promover `develop` a `main` solo cuando el ambiente este aprobado.

## Comandos practicos

### Actualizar desarrollo

```powershell
git switch desarrollo
npm run workflow:status
npm run workflow:sync-desarrollo
```

### Validar antes de integrar

```powershell
npm run qa:deterministic-validation
```

### Subir cambios a develop

```powershell
git switch desarrollo
git add .
git commit -m "mensaje del cambio"
npm run qa:deterministic-validation
npm run workflow:promote-develop
```

### Subir cambios a main

```powershell
git switch develop
git pull
npm run qa:deterministic-validation
npm run workflow:promote-main
```

### Checklist antes de mover a produccion

- `develop` sin cambios locales.
- Validacion deterministica completada sin fallos.
- Cambios de autenticacion, sesiones y usuarios revisados.
- Riesgos conocidos documentados o cerrados.
- Aprobacion funcional para despliegue en `main`.

## Reglas

- No trabajar directamente en `main`.
- No usar ramas persistentes fuera de `main`, `develop` y `desarrollo`.
- No promover a `develop` si `desarrollo` no esta limpia o no paso QA.
- No promover a `main` si `develop` no esta limpia o no paso QA.
