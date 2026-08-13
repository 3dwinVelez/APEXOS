# Plan de seed local de certificacion

Estado: revisable, no ejecutado.

El modo `prepare` de `certify-offline-readonly-local.js` solo admite
`127.0.0.1:54320/apexos_offline_cert_local`, schema compatible y Nyvora exacto
ausente o perteneciente al mismo fixture. Una segunda ejecucion completa
devuelve la inspeccion existente.

## Datos propuestos

- Tenant `Nyvora`, dominio `nyvora.offline.local`, modulos del plan local.
- Administrador temporal creado por `auth.registerTenant`; es necesario para
  usar los flujos oficiales de roles y usuarios.
- Rol `Tecnico`: dashboard read y services read.
- Tecnico primario `Tecnico QA Offline`.
- Segundo tecnico `Tecnico QA Aislamiento`, no incluido en allowlist futura.
- Rol `Consulta QA sin offline`, solo dashboard read.
- Usuario `Usuario QA No Autorizado`.
- Referencia ficticia con dos partes de checklist.
- Orden activa del tecnico primario.
- Orden pendiente a tres dias del tecnico primario.
- Orden pendiente del tecnico de aislamiento.
- Orden pendiente a diez dias, fuera de ventana.

Cliente, direccion, telefono y documento son valores sinteticos. No hay fotos,
GPS real, finanzas, documentos personales ni empresas cliente.

## Autenticacion y secretos

La autenticacion local es la del backend Prisma: bcrypt, JWT y
`AuthorizationSession`. Las contrasenas se generan aleatoriamente y se guardan
solo en `config/offline-phase3-certification.env`, ignorado. No se inserta una
contrasena directamente ni se usa Supabase Auth.

## Limpieza

El modo `cleanup` exige la marca `offline_phase_3_1_local` y coincidencia del
tenant guardado antes de borrar relaciones en transaccion. El entorno completo
tambien puede eliminarse con el setup, que verifica etiqueta de contenedor y
volumen dedicado.

No ejecutar `prepare` hasta recibir autorizacion expresa para reintentar Fase
3.1.

