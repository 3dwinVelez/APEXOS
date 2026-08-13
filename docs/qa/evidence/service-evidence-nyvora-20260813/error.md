# Pruebas negativas QA

- Rol Nyvora sin `services.orders:edit_any_state`: bloqueado con `403`.
- Usuario de tenant de aislamiento: bloqueado con `403` o `404`.
- Solicitud de ordenes sin token: bloqueada con `401`.
- MIME y firma binaria: comprobados antes de persistir.
- Resultado: `passed`.
