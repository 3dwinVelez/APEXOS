# Casos negativos y seguridad

Los siguientes rechazos fueron exigidos y observados:

- Gestor de usuarios creando roles: 403 `CAPACIDAD_ROL_DENEGADA`.
- Soporte creando usuarios: 403 `CAPACIDAD_ROL_DENEGADA`.
- Gestor de roles creando usuarios: 403 `CAPACIDAD_ROL_DENEGADA`.
- Solo lectura creando usuarios: 403 `CAPACIDAD_ROL_DENEGADA`.
- Rol de marcaciones consultando usuarios: 403 `CAPACIDAD_ROL_DENEGADA`.
- Administrador editando otra empresa: 404, sin revelar la identidad externa.
- Usuario inactivo iniciando sesión: 401 genérico.

La autorización conserva las compuertas de suscripción M-22, permisos RBAC y alcance del tenant. La compatibilidad agregada solo se usa en roles antiguos que no contienen matriz granular versionada.
