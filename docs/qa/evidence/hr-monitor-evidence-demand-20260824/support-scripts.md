# Scripts de soporte

La certificacion versionada se ejecuta con:

```text
npm run certify:hr-monitor-evidence:qa -- --api-url <url-qa> --env-file <archivo-env> --output <certification.json>
```

El script crea usuarios y un horario sinteticos, ejecuta el flujo completo de marcaciones y actividad, certifica el resumen ligero, carga las dos evidencias bajo demanda, prueba RBAC y aislamiento de tenant, y desactiva los datos al finalizar. La opcion `--fixture-output` se usa solo para permitir la inspeccion visual inmediata; el archivo contiene una credencial temporal y debe eliminarse despues de la prueba, como se hizo en esta ejecucion.
