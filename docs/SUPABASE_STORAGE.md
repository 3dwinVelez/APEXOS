# Supabase Storage

## Objetivo

APEX OS usa Supabase Storage para imagenes privadas y seguras:

- Logos de empresas.
- Avatar/foto de usuarios.
- Imagenes asociadas a servicios.
- Futuras imagenes de modulos.

## Buckets

Todos los buckets son privados.

- `company-assets`: logos y activos de empresa.
- `user-avatars`: fotos de usuarios.
- `service-images`: imagenes de servicios.

Configuracion inicial:

- `public = false`
- Tamano maximo: `2MB`
- MIME permitidos:
  - `image/png`
  - `image/jpeg`
  - `image/webp`

## Rutas de archivos

Las politicas dependen del primer segmento de la ruta:

```text
company-assets/{company_id}/logos/{file}
user-avatars/{company_id}/{user_id}/{file}
service-images/{company_id}/{service_id}/{file}
```

Esto permite validar acceso por empresa desde RLS de Storage.

## Politicas de seguridad

`company-assets`:

- Lectura: miembros activos de la empresa.
- Escritura/reemplazo/borrado: `owner` o `admin`.

`user-avatars`:

- Lectura: usuarios relacionados con la misma empresa.
- Escritura/reemplazo/borrado: el propio usuario o `owner/admin` de la empresa.

`service-images`:

- Lectura: miembros activos de la empresa con modulo `servicios` habilitado.
- Escritura/reemplazo/borrado: `owner/admin` con modulo `servicios` habilitado.

No se usa `service_role` en frontend.

## Tablas actualizadas

- `companies.logo_url`
- `profiles.avatar_url`
- `services.image_url`

Estos campos deben guardar la ruta privada tipo:

```text
company-assets/{company_id}/logos/logo-123.webp
```

La URL publica no debe persistirse porque los buckets son privados. El frontend debe pedir una URL firmada temporal cuando necesite renderizar la imagen.

## Variables requeridas

Frontend:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Tambien debe existir sesion de usuario. Los helpers usan el token guardado en `localStorage.token` y lo envian como `Authorization: Bearer`.

## Helpers frontend

Archivo:

```text
apps/web/lib/supabaseStorage.ts
```

Funciones disponibles:

- `uploadCompanyLogo(companyId, file)`
- `getCompanyLogoUrl(storagePath)`
- `uploadUserAvatar(companyId, userId, file)`
- `getUserAvatarUrl(storagePath)`
- `uploadServiceImage(companyId, serviceId, file)`
- `getServiceImageUrl(storagePath)`
- `deleteImage(storagePath)`
- `replaceImage(previousPath, uploadFn)`

Validaciones del frontend:

- Tipo permitido: PNG, JPEG, WEBP.
- Tamano maximo: 2MB.

## Como probar

1. Crear usuario en Supabase Auth.
2. Crear `profiles`.
3. Asociar usuario a `Cliente Piloto QA` en `company_users` como `owner` o `admin`.
4. Iniciar sesion y confirmar token.
5. Subir logo de empresa:

```ts
const uploaded = await uploadCompanyLogo(companyId, file);
// guardar uploaded.storagePath en companies.logo_url
```

6. Obtener URL firmada:

```ts
const url = await getCompanyLogoUrl(company.logo_url);
```

7. Repetir con avatar y servicio.

## Validacion QA ejecutada

- Buckets `company-assets`, `user-avatars` y `service-images` existen.
- Los tres buckets son privados.
- Los tres buckets tienen limite de `2097152` bytes.
- Los tres buckets aceptan `image/png`, `image/jpeg` e `image/webp`.
- `storage.objects` tiene RLS activo.
- Existen politicas por bucket para lectura, insercion, actualizacion y borrado.
- El acceso cruzado entre empresas fue bloqueado con RLS.

Pendiente:

- Subida binaria real desde Storage API con usuario QA autenticado.
- Lectura real con URL firmada usando token real.
- Reemplazo y eliminacion real via Storage API.

## Errores comunes

`Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY`:

- Faltan variables frontend.

`Sesion requerida para cargar imagenes`:

- No existe token de usuario.

`Formato no permitido`:

- El archivo no es PNG, JPEG o WEBP.

`La imagen supera el limite de 2MB`:

- Reducir tamano antes de subir.

`new row violates row-level security policy`:

- El usuario no pertenece a la empresa.
- El usuario no es `owner/admin` para operaciones administrativas.
- El modulo `servicios` esta bloqueado para imagenes de servicios.
- La ruta no empieza por un `company_id` valido.

## Conexion Supabase

La configuracion QA queda lista para:

- Database: tablas SaaS, RLS, vistas y helpers internos.
- Auth: `profiles` relacionado con `auth.users`.
- Storage: buckets privados y politicas sobre `storage.objects`.

## Reglas para evitar exposicion

- No convertir buckets sensibles a publicos.
- No guardar signed URLs permanentes en la base.
- No usar `service_role` en navegador.
- No aceptar rutas de Storage generadas manualmente por el usuario sin validar.
- Mantener `company_id` como primer segmento de ruta en imagenes operativas.
