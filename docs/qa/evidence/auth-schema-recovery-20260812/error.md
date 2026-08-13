# Pruebas de error

- La prueba unitaria reproduce la ausencia de `Tenant.authorization_version` y `User.authorization_version` observada en produccion.
- El contrato de disponibilidad marca el esquema incompleto como no listo y el endpoint responde `503 SCHEMA_INCOMPATIBLE`.
- Una credencial QA enviada a produccion despues de reparar el esquema respondio `401` en lugar del `500/P2022` previo. No se uso como certificacion productiva porque no es una cuenta productiva autorizada.
