# Contributing

APEXOS uses the mandatory branch flow:

```text
desarrollo -> develop -> main
```

Before modifying any file, Codex must execute:

```bash
git branch --show-current
git status --short
```

Mandatory rules:

1. Codex solo puede implementar cambios en `desarrollo`.
2. Si la rama activa no es `desarrollo`, Codex debe detenerse.
3. Codex no puede crear ramas nuevas sin autorizacion expresa del usuario.
4. Los nombres `codex/*`, `feature/*`, `chore/*`, `fix/*` o similares no estan autorizados por defecto.
5. Una solicitud de implementacion no constituye autorizacion para crear una rama.
6. Una solicitud de correccion no constituye autorizacion para crear una rama.
7. Una solicitud de continuar no constituye autorizacion para crear una rama.
8. `develop` solo recibe promociones desde `desarrollo`.
9. `main` solo recibe promociones desde `develop`.
10. Codex no puede promover ramas sin autorizacion expresa.
11. Codex no puede desplegar sin autorizacion expresa.
12. Codex no puede ejecutar migraciones remotas sin autorizacion expresa.
13. Codex no puede eliminar ramas sin auditoria y autorizacion.
14. Codex no puede utilizar force push.
15. Codex no puede saltarse validaciones para completar una tarea.
16. Todo cambio debe quedar acompanado por pruebas y evidencia.
17. La ausencia de autorizacion significa prohibicion.

Use `scripts/windows/start-apexos-desarrollo.bat` for daily local startup.
