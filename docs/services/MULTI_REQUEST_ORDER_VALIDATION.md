# Validacion local: multiples solicitudes por orden

Fecha: 2026-08-12
Rama permitida: `desarrollo`
Estado: implementacion y certificacion local aprobadas; promocion pendiente de QA.

## Alcance

- Una orden admite entre 1 y 20 solicitudes independientes.
- El editor administrativo permite agregar, modificar o retirar solicitudes mientras ninguna haya iniciado ni tenga trazabilidad.
- Cada articulo agregado representa una solicitud independiente; la cantidad operativa se fija en `1` para evitar ambiguedad en la interfaz.
- Cada solicitud conserva referencia, tipo de servicio, observacion, estado, version, inspeccion, incidentes y evidencias.
- Las ordenes antiguas se leen como una solicitud sintetica sin migracion destructiva.
- El encabezado mantiene referencia y tipo de la primera solicitud para clientes antiguos.
- No se modificaron `develop`, `main`, Railway, QA ni produccion.

## Migracion

- Migracion aditiva: `20260811203000_service_order_items`.
- Crea `ServiceOrderItem` y agrega `item_id` nullable en fotos e incidentes.
- No reescribe ordenes, fotos ni incidentes existentes.
- Fue ejecutada solamente en PostgreSQL local `localhost:55432`.
- Rollback previo a promocion: retirar el codigo consumidor; las columnas nullable y la tabla pueden permanecer sin afectar el modelo legado. Un rollback fisico debe exportar primero los items y eliminar llaves, columnas y tabla en orden inverso.

## Evidencia automatizada

Comando principal:

```powershell
npm run certify:service-order-items:local
```

Resultado certificado:

```json
{
  "certification_version": "service-order-items-local-v2",
  "ok": true,
  "requests": 3,
  "administrative_edit_save": true,
  "evidence": 6,
  "tenant_isolation": true,
  "optimistic_concurrency": true,
  "elapsed_ms": 1318.41
}
```

El certificador rechaza hosts distintos de `localhost` y `127.0.0.1`, crea datos aislados y los desactiva/limpia al finalizar.

Filtros aprobados:

- Prisma schema: valido.
- Prisma Client: generado.
- TypeScript web: aprobado.
- ESLint sobre las dos pantallas intervenidas: aprobado.
- Servicios y regresion administrativa: 31/31.
- Offline y seguridad del almacenamiento local: 49/49.
- Flujo real local de tres solicitudes: aprobado.
- Guardado administrativo real de una orden con tres solicitudes: aprobado.
- Edicion real local de una preorden de dos a tres solicitudes: aprobada; encabezado sincronizado y datos temporales eliminados.
- Aislamiento entre tenants: aprobado.
- Conflicto de version: aprobado con 409.
- `git diff --check` y sintaxis Node: aprobados.
- Build Next.js: aprobado; 64 paginas generadas en 256,4 s.

## Prueba manual local

1. Iniciar Docker Desktop.
2. Confirmar que `DATABASE_URL` apunta a `localhost:55432`.
3. Aplicar la migracion solo en local.
4. Ejecutar `npm run certify:service-order-items:local` y exigir `ok: true`.
5. Iniciar APEXOS local con `npm run start:desarrollo:windows`.
6. Entrar como administrador a Servicios y crear una orden con tres solicitudes usando referencias y tipos diferentes.
7. Confirmar que el monitor muestra una orden y el contador `0/3`.
8. Entrar como el tecnico asignado, seleccionar cada solicitud y comprobar que cambian referencia, piezas y evidencia visible.
9. Completar inspeccion y cargar producto abierto/cerrado para la primera solicitud. Confirmar que las otras dos siguen pendientes y no muestran esas fotos.
10. Repetir para las solicitudes dos y tres; confirmar progresion `1/3`, `2/3`, `3/3`.
11. Intentar finalizar una solicitud sin ambas fotos y exigir rechazo.
12. Intentar reutilizar un `item_id` de otra orden o tenant y exigir 404.
13. Verificar en anchos 390 px y 1440 px que selector, formularios y botones no se solapan.

## Criterio de aprobacion

No crear commit, no hacer push y no proponer promocion mientras el build completo no finalice con codigo cero. Despues de resolver ese bloqueo se debe repetir toda esta matriz y conservar la evidencia antes de seguir `desarrollo -> develop -> main` con autorizaciones independientes.
# Certificacion local

La certificacion reproducible de esta intervencion es
`npm run certify:service-order-items:local`. Su salida identifica la version
`service-order-items-local-v2`, falla con un codigo distinto de cero ante una
ejecucion parcial y elimina los datos temporales al finalizar.

Esta certificacion local no reemplaza la aprobacion funcional en QA ni autoriza
por si sola la promocion `desarrollo -> develop -> main`.

## Incidente de guardado por tenant

Hallazgo del 2026-08-12: una sesion local de `Demo APEX` combinaba sus ordenes
con solicitudes publicas de `SCJ`. La orden ajena aparecia editable, pero el
`PUT /api/v1/services/orders/:id` la rechazaba con 404 al aplicar correctamente
el aislamiento del backend.

Correccion certificada:

- Las sesiones locales consumen exclusivamente la API autenticada del tenant.
- El monitor auxiliar solo consulta PostgreSQL local cuando valida una identidad
  Supabase y una membresia activa para la empresa solicitada.
- El enlace de solicitud externa obtiene el nombre de empresa desde
  `GET /api/v1/auth/me`; no reutiliza un nombre obsoleto de otra sesion.
- Los errores de acceso permanecen en el formulario y no se presentan como una
  ventana secundaria de campos faltantes.
- Prueba funcional en navegador: el enlace cambio de `SCJ` a `Demo APEX`, el
  monitor mostro solo 3 ordenes del tenant autenticado y el guardado real de
  `SOL-2026-00003` finalizo sin 404.

La orden `SOL-2026-00011` pertenece a `SCJ` y, por aislamiento, solo puede ser
gestionada con una sesion administrativa de `SCJ`. No se traslado ni modifico
esa orden desde la sesion de `Demo APEX`.
