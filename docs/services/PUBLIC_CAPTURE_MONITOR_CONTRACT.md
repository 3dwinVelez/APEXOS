# Servicios — contrato de captura pública y monitor

Última medición: **2026-11-11** (LOCAL, QA `c72955d2`, PROD). Aplica a
`apps/web/app/api/public/service-requests/route.ts`,
`apps/web/app/api/services/monitor-orders/route.ts` y
`apps/web/app/dashboard/servicios/page.tsx`.

## 1. Captura pública (`/api/public/service-requests`)

El visitante anónimo lee el catálogo (`GET`) y crea una preorden (`POST`). El handler
**no** tiene llave de servicio ni Prisma:

| Vía | Cuándo | Cómo resuelve |
|---|---|---|
| Local | `APEXOS_LOCAL_API_URL` / API en `127.0.0.1` | Delega en `/api/v1/public/services/*`; el API cierra el tenant con `runWithTenant`. |
| Nube | resto | Lee con llave **anon** (RLS de catálogo público) y crea por RPC `create_public_service_order` (SECURITY DEFINER, solo preórdenes). |

**La empresa destino no la elige el cliente.** Sale de
`APEXOS_PUBLIC_SERVICE_COMPANY_ID` (respaldo `NEXT_PUBLIC_APEXOS_PUBLIC_COMPANY_ID`), que
debe ser UUID o la ruta responde `503`. `?empresa=` y `company_id` del body no participan.

### Cierre de referencias por producto

Cada `items[].reference_id` se valida contra el catálogo activo de esa empresa
(`activeReferenceIdSet`: una sola consulta `service_references?company_id=eq.…&active=eq.true&id=in.(…)`):

1. id UUID presente en el conjunto → se usa.
2. id **no** UUID en el primer item → se resuelve por código/nombre
   (`resolveReferenceId`) contra la misma allowlist (compatibilidad con clientes viejos).
3. cualquier otro caso → `400` nombrando la solicitud («La referencia de la solicitud N no
   esta activa en el catalogo publico de esta empresa.») y **no se llama al RPC**.

`p_metadata.items[]` guarda el id ya validado. Límites: `MAX_ITEMS = 20`,
`MAX_ITEM_QUANTITY = 50`, tipos y almacenes activos del catálogo metadata.

`PUT` (administración del catálogo) exige JWT de administrador; sin JWT `401`, sin permiso
`403`, y RLS (`service_references_write_admin`) decide la escritura.

## 2. Monitor (`/api/services/monitor-orders`)

1. Sesión Supabase válida → si no, `401`.
2. Membresías activas del usuario → si no hay, `403`.
3. `resolveServiceScope` decide el alcance:
   - empresa pedida y presente en la membresía → esa;
   - sin empresa pedida → todas las elegibles;
   - rol administrativo (`owner`/`admin`) → no exige fila de empleado;
   - miembro llano → exige empleado técnico;
   - empresa ajena u obsoleta → `403` con `X-Apexos-Scope-Reason:
     no-eligible-membership` y cabeceras `X-Apexos-Scope-*` de diagnóstico.
4. Respuesta `200` publica `X-Apexos-Scope-Company` con la empresa efectiva.

### Auto-reparación del cliente

La pantalla guarda `apexos_company_id`. Si esa empresa dejó de pertenecer al usuario (cambio
de base, membresía revocada), el servidor responde `403` con
`x-apexos-scope-reason: no-eligible-membership`. La pantalla:

1. borra `apexos_company_id`,
2. reintenta sin `company_id`,
3. adopta el `X-Apexos-Scope-Company` de la respuesta y lo vuelve a guardar.

El servidor **no** se relaja: sin membresía no hay alcance. Se corrige el cliente que se
quedaba pegado a un id obsoleto, no el control.

## 3. Estado medido por ambiente (2026-11-11)

| Ambiente | Captura | Monitor | Nota |
|---|---|---|---|
| LOCAL | Cerrada por `APEXOS_PUBLIC_SERVICE_COMPANY_ID` (allowlist Demo APEX) | Alcance por membresía local | El API local ya validaba todos los items (`public-service.js:122-131`). |
| QA `c72955d2` | `200`, orden `OS-00023` con dos referencias reales | `200` con empresa propia o sin empresa; `403` con empresa ajena | Cadena certificada con usuario efímero y limpieza por id. |
| PROD | Escribiendo: 285 órdenes SCJ, 263 desde el formulario público, 5 del día | Datos presentes | El puente Prisma `Tenant` → empresa Supabase existe; **SCJ tiene 0 referencias en el catálogo Prisma**, así que la vía API quedaría vacía si se usara (la pantalla usa la vía cloud). |

Evidencia: `docs/qa/evidence/servicios-captura-monitor-20261111/` (`ambiente-inventario.txt`,
`qa-cadena-captura-monitor.txt`, `web-tests.txt`).

## 4. Diagnóstico rápido de «no llegan servicios al monitor»

1. **¿La captura escribió?** `GET …/api/v1/public/services/catalog` o la fila en
   `service_orders` con `metadata->>'created_from' = 'public_service_request'`.
2. **¿El navegador pide una empresa que ya no es del usuario?** Buscar el `403` y
   `x-apexos-scope-reason: no-eligible-membership` en la red. Si aparece, la ruta cloud
   respondió bien y el problema era el id guardado (ya autocorregido).
3. **¿El monitor cae al respaldo Prisma?** En un tenant sin catálogo Prisma (SCJ) ese
   respaldo devuelve 0 órdenes; no es pérdida de datos.
4. **¿La sesión corresponde a una identidad Supabase válida?** Un `401` es login, no
   catálogo.
