# Diseño de carga autorizada y validación autoritativa

## Riesgo actual confirmado

El navegador y la API validan firma, MIME, tamaño e integridad, pero una llamada directa a Supabase Storage puede omitirlos. En QA se cargó temporalmente contenido HTML con `Content-Type: image/png` bajo una ruta legítima de `service-images`; Storage lo aceptó y el objeto se eliminó en la limpieza.

RLS limita correctamente bucket, empresa, módulo y orden. El control faltante es sobre los bytes después de la carga.

## Arquitectura propuesta

```text
Frontend → autorización API → objeto pending en cuarentena
         → carga directa limitada → validador autoritativo
         → valid / rejected → promoción o eliminación
         → registro funcional confirmado
```

Estados:

- `authorized`: autorización corta emitida, todavía sin objeto.
- `pending`: objeto recibido en cuarentena.
- `validating`: worker posee el intento idempotente.
- `valid`: firma, tamaño, dimensiones, empresa y asociación confirmados.
- `rejected`: objeto inválido, aislado para auditoría mínima.
- `deleted`: limpieza confirmada.
- `expired`: autorización no utilizada.

## Modelo propuesto

Tabla `authorized_uploads`:

- `id` UUID;
- `company_id`, `user_id`, `module`;
- `entity_type`, `entity_id`;
- `bucket`, `quarantine_path`, `final_path`;
- `expected_mime`, `max_bytes`, `max_width`, `max_height`;
- `status`, `sha256`, `attempt_count`;
- `authorized_at`, `expires_at`, `validated_at`;
- `client_upload_id` único para idempotencia;
- `failure_code` sin contenido sensible.

Los registros de evidencia solo pueden pasar a definitivos si referencian un `authorized_uploads.status = valid`.

## Buckets y policies

- Mantener buckets privados.
- Introducir bucket o prefijo `quarantine/{company_id}/{upload_id}`.
- INSERT: solo usuario autorizado, company/module/entity coincidentes y autorización vigente.
- SELECT: denegado a clientes mientras esté pending.
- UPDATE/overwrite: denegado; cada reintento usa objeto inmutable o la misma clave con condición idempotente.
- DELETE: validador/servicio y administrador auditado.
- El cliente nunca decide `final_path`.

## Flujo

1. Frontend solicita autorización con tipo, tamaño y entidad.
2. Backend deriva empresa/usuario de la sesión y genera ruta.
3. Frontend sube directamente para conservar rendimiento y tolerancia móvil.
4. Evento Storage o llamada de confirmación encola validación.
5. Worker transmite solo el prefijo necesario y después el contenido con límite estricto; calcula hash, detecta firma y dimensiones.
6. Si es válido, promueve/copia y confirma el registro en una transacción idempotente.
7. Si falla, marca `rejected` y elimina según retención.
8. El frontend consulta estado y reintenta con el mismo `client_upload_id`.

## Conectividad inestable

- Autorizaciones de duración acotada pero suficiente para campo.
- Reanudación por `client_upload_id`.
- Confirmación repetible.
- Un objeto pending nunca cuenta como evidencia definitiva.
- Limpieza programada de autorizaciones/objetos vencidos.

## Rendimiento

- Se conserva la transferencia directa cliente–Storage.
- La API solo autoriza y confirma metadatos compactos.
- El worker limita concurrencia y streaming; no carga archivos completos sin límite.
- Índices: `(company_id,status)`, `(expires_at,status)`, único `client_upload_id`.
- Objetivo: autorización p95 <100 ms; confirmación p95 <150 ms sin contar transferencia/validación asíncrona.

## Migración

1. Crear tabla y policies sin cambiar el flujo existente.
2. Activar feature flag por bucket/empresa.
3. Ejecutar shadow validation.
4. Exigir estado `valid` para nuevas evidencias.
5. Migrar buckets restantes.
6. Retirar escritura directa a rutas finales.

Rollback: desactivar el flag y restaurar temporalmente el flujo directo. La tabla y estados se conservan para auditoría; no eliminar objetos automáticamente durante rollback.
