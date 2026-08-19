# Incidente de sincronizacion de credenciales

## Causa raiz ampliada

1. El formulario mantenia `email` y `access_email` como campos independientes, pero enviaba siempre `email`; editar el correo de acceso no modificaba la credencial usada por login.
2. Los usuarios desalineados antes de la primera correccion se buscaban en Supabase Auth por el correo ya actualizado en Prisma. La identidad Auth conservaba el correo anterior y no podia repararse.
3. La identidad estable `preferences.supabase_user_id` ya existia en usuarios espejados, pero no se utilizaba durante la actualizacion administrativa.

## Correccion preparada

- Los dos campos de correo permanecen sincronizados y el payload usa el correo de acceso visible.
- La actualizacion resuelve primero la identidad por `supabase_user_id`.
- Un cambio de clave repara tambien una divergencia historica de correo.
- El script `scripts/certifications/admin-user-login-sync.js` verifica update real, confirmacion Auth, login real y commit QA.

## Estado

Validacion tecnica aprobada. Certificacion funcional QA pendiente de ejecutar con secretos inyectados por variables de entorno. Publicacion y promocion bloqueadas por politica.
