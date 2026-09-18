# Validación de errores y recuperación

- La certificación usa `ON_ERROR_STOP=1`; cualquier error SQL bloquea el resultado.
- La migración es idempotente mediante conflictos por código, plan/módulo y compañía/módulo.
- Las activaciones existentes se preservan porque la inicialización de relaciones usa `do nothing` ante conflictos.
- El clúster temporal se detiene y elimina al finalizar, tanto en éxito como en fallo.

Resultado: aprobado.
