# Politica obligatoria de aprobacion de cambios

Todo cambio sigue exclusivamente `desarrollo -> develop -> main`. La aprobacion de pruebas automatizadas permite integrar en `develop`, pero nunca basta para promover a `main`.

## Evidencia obligatoria

Antes de aprobar `develop -> main` debe existir un manifiesto JSON versionado con:

1. Prueba funcional en QA autenticado que reproduzca el flujo real antes y despues del cambio.
2. Pruebas de error y escenarios negativos, incluyendo indisponibilidad, datos vacios y respuestas tardias.
3. Resultado de los scripts de soporte, pruebas automatizadas, lint, tipos y compilacion.
4. Prueba de regresion sobre los flujos adyacentes afectados.
5. Evidencias fechadas: capturas, resultados estructurados o logs sanitizados, sin secretos ni datos sensibles.
6. Aprobacion explicita con responsable, fecha, commit evaluado y decision `approved`.

## Regla de bloqueo

La promocion a `main` queda prohibida si falta una evidencia, si una prueba esta pendiente o fallida, si QA no usa el commit exacto de `develop`, o si el aprobador no esta identificado. Se valida con:

```text
npm run qa:approval:evidence -- <ruta-manifest.json>
```

No se aceptan afirmaciones de funcionamiento basadas solo en revision de codigo, pruebas unitarias, entorno local o compilacion. La evidencia QA debe demostrar el comportamiento visible y los datos esperados.

## Contenido minimo del manifiesto

```json
{
  "change_id": "identificador",
  "environment": "QA",
  "source_branch": "develop",
  "target_branch": "main",
  "commit": "sha-evaluado",
  "checks": {
    "functional": { "status": "passed", "evidence": ["functional.md"] },
    "error": { "status": "passed", "evidence": ["error.md"] },
    "support_scripts": { "status": "passed", "evidence": ["scripts.md"] },
    "regression": { "status": "passed", "evidence": ["regression.md"] }
  },
  "approval": {
    "status": "approved",
    "approved_by": "responsable QA",
    "approved_at": "fecha ISO-8601"
  }
}
```
