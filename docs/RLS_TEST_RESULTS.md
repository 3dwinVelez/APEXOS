# RLS Test Results

## Alcance

Ambiente validado:

- Supabase proyecto `APEX-OS`
- Ambiente QA

No se desactivo RLS y no se uso `service_role` en frontend.

## Estado RLS

RLS activo en:

- `companies`
- `profiles`
- `company_users`
- `company_modules`
- `employees`
- `services`
- `storage.objects`

## Roles validados

| Rol | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| owner | Permitido en su empresa | Permitido donde aplica | Permitido donde aplica | Permitido por politica donde aplica |
| admin | Permitido en su empresa | Permitido donde aplica | Permitido donde aplica | Permitido por politica donde aplica |
| member | Permitido en su empresa | Bloqueado en operativas | Bloqueado en operativas | Bloqueado en operativas |
| viewer | Permitido en su empresa | Bloqueado | Bloqueado | Bloqueado |

## Multiempresa

| Prueba | Resultado |
| --- | --- |
| Owner Empresa A lee Empresa A | OK |
| Owner Empresa A no lee Empresa B | OK |
| Owner Empresa B no lee empleados Empresa A | OK |
| Owner Empresa B no lee servicios Empresa A | OK |
| Owner Empresa B no sube asset de Empresa A | OK |

## Modulos

Empresa piloto QA:

Habilitados:

- `talento_humano`
- `servicios`
- `configuracion`

Bloqueados:

- `inventario`
- `crm`
- `ventas`
- `compras`
- `finanzas`
- `reportes`
- `wms`

## Talento Humano

| Prueba | Resultado |
| --- | --- |
| Crear empleado como owner | OK |
| Consultar empleado como miembro de empresa | OK |
| Editar estado como owner | OK |
| Validar unique `(company_id, document_number)` | OK |
| Otra empresa no ve empleado | OK |

## Servicios

| Prueba | Resultado |
| --- | --- |
| Crear servicio como owner/admin | OK |
| Consultar servicio como miembro de empresa | OK |
| Editar estado como owner | OK |
| Filtro por `company_id` y `status` | OK |
| Otra empresa no ve servicio | OK |

## Storage

| Prueba | Resultado |
| --- | --- |
| Buckets privados existen | OK |
| MIME permitidos configurados | OK |
| Tamano maximo 2MB configurado | OK |
| Insert metadata como owner | OK |
| Update metadata como owner | OK |
| Acceso cruzado bloqueado | OK |
| Delete directo en tabla Storage | Bloqueado correctamente por trigger nativo |
| Delete real via Storage API | Pendiente por usuario Auth real |

## Checklist final

| Prueba realizada | Resultado | Error encontrado | Archivo afectado | Accion recomendada |
| --- | --- | --- | --- | --- |
| Variables Supabase | OK | Ninguno | `.env.example` | Configurar valores reales solo en `.env.local` |
| Cliente centralizado | OK | No existia cliente Database/Auth central | `apps/web/lib/supabaseClient.ts` | Usarlo para nuevas integraciones |
| Modules/plans | OK | Ninguno | `apps/web/lib/supabaseQa.ts` | Mantener `limit` |
| Auth QA | Pendiente | No hay usuarios Auth | `docs/SUPABASE_CONNECTION.md` | Crear usuario QA manual |
| Multiempresa | OK | Ninguno | `scripts/validate-supabase-qa-rls.sql` | Reejecutar tras cambios RLS |
| RLS roles | OK | Ninguno funcional | `scripts/validate-supabase-qa-rls.sql` | Mantener RLS activo |
| Modulos por plan | OK | Ninguno | `docs/SUPABASE_QA_VALIDATION.md` | Conectar frontend a vista de modulos |
| Talento Humano | OK | Ninguno | `scripts/validate-supabase-qa-rls.sql` | Probar con usuario real |
| Servicios | OK | Ninguno | `scripts/validate-supabase-qa-rls.sql` | Probar con usuario real |
| Storage | Parcial OK | Falta upload binario real | `docs/SUPABASE_STORAGE.md` | Crear usuario QA y probar Storage API |
| Performance | OK con observacion | Indices unused por QA sin trafico | `20260517171000_optimize_qa_rls_indexes.sql` | No borrar indices hasta tener carga real |

