# Evidence Quarantine Migration Release Assessment

Fecha original de evaluacion: 2026-08-04.
Fecha de consolidacion en desarrollo: 2026-08-06.

## Alcance

Este documento consolida la evaluacion de release de la migracion:

```text
supabase/migrations/20260727041000_authoritative_evidence_quarantine.sql
```

La evidencia original estaba como documento no rastreado en el worktree de
`main`. No se movio ni se versiono desde `main`; se reconstruyo en
`desarrollo` como evidencia controlada.

## Commits relacionados

- `4c1bb42 feat(storage): aislar cuarentena con RLS` introdujo la cuarentena
  de evidencias con RLS/Storage.
- `721b98c feat(storage): modelar autorizaciones de evidencia` introdujo
  modelo de autorizaciones relacionado.
- La migracion esta presente en `desarrollo` y `develop`.
- La migracion no esta presente en el arbol actual de `main`.

## Cambios evaluados

La migracion no crea tabla ni bucket. Asume existentes:

```text
public.evidence_upload_authorizations
storage.objects
bucket service-images
```

| Recurso | Cambio | Riesgo |
| --- | --- | --- |
| `evidence_upload_authorizations` | Habilita RLS y policy de lectura por usuario/tenant | Medio por impacto de seguridad si no se valida en QA. |
| `storage.objects` | Policies para prefijo `_quarantine/` | Medio por impacto en Storage y autorizaciones. |
| Grants | Restringe escritura cliente y conserva service role | Bajo-medio; requiere validacion de flujos. |

## Estado por rama

| Rama | Estado |
| --- | --- |
| `desarrollo` | Contiene migracion Supabase y codigo relacionado. |
| `develop` | Contiene migracion Supabase y codigo relacionado. |
| `main` | No contiene la migracion en el arbol actual. |

## Feature flag

```text
AUTHORIZED_EVIDENCE_UPLOADS_ENABLED
```

Con el flag ausente o en `false`, las rutas autoritativas deben permanecer
deshabilitadas antes de operar Storage.

## Dictamen consolidado

```text
REQUIERE VALIDACION QA ANTES DE PRODUCCION
```

No se ejecuto migracion productiva durante esta reconciliacion. Una futura
promocion debe validar autorizacion, carga permitida, rechazo por firma/MIME,
expiracion, tenant ajeno y lectura de evidencias existentes antes de considerar
la migracion apta para produccion.
