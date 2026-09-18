# Escenarios negativos

- La primera ejecución del certificado se bloqueó correctamente porque no se había declarado `CONFIRM_NYVORA_FIXTURE=true`; no se contabilizó como aprobada.
- La repetición explícitamente confirmada terminó correctamente sobre Nyvora QA.
- Una petición de Talento Humano sin sesión respondió `401`.
- El rol Nyvora limitado respondió `403` al consultar datos y operaciones de Talento Humano.
- En navegador, el intento limitado presentó mensajes visibles con ruta, estado `403` y detalle de permiso, sin exponer datos operativos.
