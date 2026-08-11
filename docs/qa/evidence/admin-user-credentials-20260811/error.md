# Pruebas de error

- Un usuario sin identidad Auth vinculada bloquea el cambio de credenciales con estado 409.
- El endpoint intenta reparar `user_id` buscando la identidad por el correo actual.
- Si Supabase Auth no confirma el correo nuevo, no se actualiza el registro administrativo.
- Correos sin cambios no generan escrituras innecesarias en Auth.
