# Diagnóstico y manejo de errores

- El API QA reporta el commit `8a5501682dd1`, anterior a `f824ab1`, que incorporó Gestión Comercial; por eso ambas rutas devuelven `404`.
- La base Supabase QA devuelve `PGRST205` para las 18 tablas `commercial_*`: el esquema comercial no está desplegado.
- La cadena previa comenzaba con `ALTER TABLE commercial_visits` y carecía de una migración base que creara las nueve tablas iniciales.
- La corrección agrega únicamente esa base faltante antes de las nueve extensiones existentes. No incluye eliminaciones, `DROP`, `TRUNCATE` ni cambios en otros módulos.
- La certificación usa `ON_ERROR_STOP=1`; cualquier error de DDL, relación o flujo bloquea el resultado.

Resultado: causa raíz corregida en código y certificada localmente; incidente remoto aún abierto.
