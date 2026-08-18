# Correcciones de producción detectadas en auditoría NYVORA

Fecha: 2026-08-18
Rama de implementación: `desarrollo`
Origen: `NYVORA_PROD_STRESS_20260818`

## Correcciones aplicadas

### 1. Evidencia general de cierre de servicio con `item_id: null`

- Archivo: `apps/api/src/modules/services/service.js`
- Antes: `addPhoto` convertía `item_id: null` en `0` y validaba `orderItem`, generando `404 SERVICE_ORDER_ITEM_NOT_AVAILABLE` para evidencia general como `firma_cliente`.
- Después: solo valida el ítem cuando el id es un entero positivo. La evidencia general (`firma_cliente`, `no_ejecutada`) se persiste sin asociación de ítem.
- Evidencia de reproducción: `POST /api/v1/services/orders/:id/photos` con `type=firma_cliente` y `item_id=null`.

### 2. Lectura administrativa excesiva para roles sincronizados

- Archivo: `apps/api/src/security/supabaseAuth.js`
- Antes: `Supabase Viewer` y `Supabase Member` recibían `{ module: "*", action: "read" }`, lo que permitía `GET /api/v1/admin/*`.
- Después: los roles viewer/member reciben lecturas explícitas de módulos operativos (`dashboard`, `hr`, `services`, `transport`, `projects`) y no reciben lectura de `admin`.
- La escritura administrativa ya estaba bloqueada; ahora la lectura también lo está.

### 3. `accounts-receivable/documents` con 500 en Supabase PROD

- Estado: **pendiente de migración remota**. No se corrige por código sin autorización expresa de migración en Supabase.
- Causa: la ruta Fastify usa Prisma sobre la tabla `cxc_cabdoc`, ausente en el esquema Supabase PROD. El endpoint debe migrarse a la capa Supabase o ejecutarse la migración remota autorizada.

## Validaciones

- `node --check` de archivos backend: OK.
- `npm run prisma:validate`: OK.
- `npm run lint`: OK.
- `npm --workspace apps/web run typecheck`: OK.
- `npm --workspace apps/web run build`: OK.
- `npm run test:service-corrections`: 18/18 OK.
- `node --test apps/api/test/rbac-module-access.test.js`: 4/4 OK.
- `node --test apps/api/test/supabase-company-context.test.js`: 10/10 OK.

## Evidencia QA necesaria para promoción

- Certificación funcional en Nyvora con rol autorizado y rol no autorizado.
- Pruebas negativas de evidencia general y RBAC.
- Certificación de regresión de plataforma.
- Certificado del modelo Nyvora.
