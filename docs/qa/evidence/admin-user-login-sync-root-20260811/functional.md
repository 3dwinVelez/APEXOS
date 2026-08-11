# Prueba funcional QA

- Commit desplegado: `4d5d5799816e`.
- Empresa controlada: `SCJ`.
- Se crearon identidades temporales de administrador y usuario mediante Supabase Auth.
- El usuario se reflejo en Prisma al autenticar contra el API QA.
- La edicion administrativa cambio correo y clave por `/api/v1/admin/users/:id`.
- El API confirmo `credential_sync.provider = supabase` y el nuevo correo.
- El inicio de sesion con el nuevo correo y clave emitio una sesion valida.
- El API resolvio el usuario autenticado y su rol esperado.
