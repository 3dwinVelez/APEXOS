# Plan de pruebas de Fase 3

## Automatizadas

- capacidad denegada por flag, ambiente, tenant, usuario, identidad o rol;
- bootstrap minimo, asignacion, estados, ventana futura y limites;
- ausencia de campos sensibles y consultas sin N+1;
- timeout, error controlado, payload maximo y overflow;
- contrato/contexto/schema/TTL rechazados en cliente;
- hidratacion transaccional y revision no regresiva;
- aislamiento por ambiente/empresa/tenant/usuario;
- servicio local sin API de escritura y limpieza en logout;
- rutas autenticadas, rate limit, typecheck, lint y build.

## Funcionales QA

1. Confirmar tecnico QA y ordenes de Nyvora.
2. Activar solo las allowlists descritas en la configuracion del piloto.
3. Preparar snapshot conectado y comparar ordenes con la vista online.
4. Cortar red, recargar y verificar consulta de orden, actividades y checklist.
5. Confirmar que no hay botones operativos ni solicitudes de mutacion.
6. Vencer sesion, cambiar usuario y hacer logout; verificar bloqueo/aislamiento.
7. Apagar el flag backend y comprobar que un nuevo bootstrap queda denegado.

La ejecucion con usuario real se marca pendiente mientras no exista una
identidad QA confirmada; no se sustituye por credenciales inferidas.

