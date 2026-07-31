# Flujo offline de solo lectura

Estado: implementado en Fase 3, tras flags y allowlists.

1. La pagina de servicios carga el panel diferido solo cuando
   `NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED=true` y la vista es de tecnico.
2. El cliente consulta `/offline/capabilities`; el backend vuelve a validar
   ambiente, tenant, usuario, rol y flags.
3. El tecnico solicita manualmente preparar o actualizar la consulta.
4. El bootstrap validado se hidrata en la base aislada
   `environment/company/tenant/user`.
5. Sin red, el servicio local permite listar ordenes y consultar actividades,
   checklist y metadatos del snapshot.

No hay CRUD local, cola de operaciones, push, pull incremental, auto-sync,
service worker ni carga de evidencias. `navigator.onLine` solo informa el estado
visual: nunca concede capacidad.

Al volver la red, el tecnico puede pedir una actualizacion manual. Si expira la
sesion o el snapshot, la lectura se bloquea. Un cambio de cuenta abre otro
contexto y nunca reutiliza la base anterior.

