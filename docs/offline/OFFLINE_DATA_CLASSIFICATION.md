# Clasificacion de datos offline

Clases:

- `PERMITIDO_LOCAL`: necesario durante la vigencia de una asignacion.
- `PERMITIDO_LOCAL_TEMPORAL`: solo mientras exista una operacion pendiente.
- `SOLO_SERVIDOR`: consultable online, no persistido en el repositorio offline.
- `PROHIBIDO_LOCAL`: no debe entrar en registros, cola, metadata ni logs offline.

| Dato | Clase | Minimizacion | Retencion maxima inicial |
| --- | --- | --- | --- |
| Identificacion opaca del tecnico | PERMITIDO_LOCAL | ID, nombre visible minimo | Sesion + 24 h |
| Datos del cliente | PERMITIDO_LOCAL | Nombre necesario para visita | Asignacion + 24 h |
| Direccion | PERMITIDO_LOCAL | Direccion de servicio, sin historico | Asignacion + 24 h |
| Telefono | PERMITIDO_LOCAL | Solo contacto de la orden | Asignacion + 24 h |
| Coordenadas de servicio | PERMITIDO_LOCAL | Precision necesaria, sin rastreo continuo | Asignacion + 24 h |
| Coordenada capturada | PERMITIDO_LOCAL_TEMPORAL | Evento puntual y precision | Hasta sync + 24 h |
| Ordenes | PERMITIDO_LOCAL | Solo asignadas y campos operativos | Validacion cada 24 h |
| Actividades | PERMITIDO_LOCAL | Solo las de ordenes descargadas | Validacion cada 24 h |
| Observaciones | PERMITIDO_LOCAL_TEMPORAL | Texto operacional, sin secretos | Hasta sync + 24 h |
| Fotografias | PERMITIDO_LOCAL_TEMPORAL | Comprimida, hash, MIME y tamano | Hasta confirmacion, max. 24 h |
| Firmas | PROHIBIDO_LOCAL | No forman parte del piloto inicial | 0 |
| Usuarios | SOLO_SERVIDOR | Solo identidad minima del tecnico activo | 0 |
| Roles | SOLO_SERVIDOR | Puede recibirse capacidad booleana, no matriz | 0 |
| Permisos | PROHIBIDO_LOCAL | Nunca usar copia local como autoridad | 0 |
| Access/refresh tokens | PROHIBIDO_LOCAL | Fuera de registros operativos y logs | 0 |
| Logs operativos locales | PERMITIDO_LOCAL_TEMPORAL | Codigos, tiempos, IDs opacos; sin payload | 7 dias |
| Informacion de otras empresas | PROHIBIDO_LOCAL | Ninguna | 0 |
| Informacion de otros tecnicos | PROHIBIDO_LOCAL | Ninguna | 0 |
| Catalogos operativos | PERMITIDO_LOCAL | Solo valores usados por el snapshot | Validacion cada 24 h |
| Documentos personales | PROHIBIDO_LOCAL | Documento de identidad, contratos, salud, nomina | 0 |
| Metadata de evidencia | PERMITIDO_LOCAL_TEMPORAL | ID local, hash, tipo, estado | 7 dias tras recibo |
| Recibos/checkpoints | PERMITIDO_LOCAL | IDs y versiones, sin payload sensible | 7 dias |
| Identificador de dispositivo | PERMITIDO_LOCAL | UUID opaco, no fingerprint | Hasta desregistro |

## Politica de minimizacion

El DTO offline usa lista positiva de campos; no serializa modelos Prisma
completos. Un campo nuevo del servidor no se descarga automaticamente. No se
guardan respuestas HTTP crudas. Los textos se limitan en longitud y las fotos
se comprimen antes de persistir en una fase autorizada.

La retencion termina antes si concluye la asignacion, se cierra sesion, cambia
tenant/usuario, se revoca capacidad o se supera la cuota. La limpieza remueve
proyecciones, cola, blobs, recibos y logs del contexto afectado.
