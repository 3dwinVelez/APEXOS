# NYVORA Product Standards

Fecha: 2026-07-03

## Clasificacion de producto

### CORE / MVP

- Administracion APEX.
- Empresas y suscripciones.
- Usuarios.
- Roles y permisos.
- Maestros.
- Servicios.
- Talento Humano.
- Transporte y vehiculos.
- Dashboard.
- Logs tecnicos.
- Auditoria.
- Multiempresa.
- Permisos.
- Storage y evidencias.

### Beta

Los modulos no terminados deben mostrarse como Beta, Bloqueado o N/A. No deben comportarse como funcionalidad estable ni romper la experiencia del usuario empresarial.

### Fuera de alcance temporal

Los modulos que no pertenecen al CORE no deben bloquear operacion de servicios, usuarios, permisos, evidencias o administracion de empresas.

## Experiencia de usuario

- Los errores tecnicos no deben exponerse crudos al usuario final.
- Los formularios deben mostrar validaciones accionables.
- Las acciones destructivas deben usar lenguaje funcional: inactivar, anular, archivar o cerrar.
- El usuario debe entender si una accion fallo por permisos, datos incompletos o estado no permitido.

## Datos empresariales

- Todo dato operativo debe pertenecer a una empresa.
- Las pantallas deben mostrar solo datos de la empresa activa.
- Los tecnicos son exclusivos por empresa.
- Las referencias, servicios, evidencias y logs deben conservar separacion por empresa.
- Las migraciones nuevas deben incluir criterios de RLS y RLM.

## Seguridad

- No se deben imprimir secretos, tokens completos ni contrasenas.
- Los archivos `config/*.env` y credenciales locales deben permanecer ignorados por Git.
- Produccion solo se toca con scripts controlados y autorizados.
