# NYVORA Enterprise Functional Certification

Fecha: 2026-07-03  
Rol emisor: Director Global de Calidad  
Empresa objetivo: NYVORA  
Alcance: certificacion funcional enterprise de plataforma APEX OS / NYVORA, sin tocar QA, infraestructura, Railway ni Supabase excepto donde sea necesario para validar hallazgos.

## 1. Resumen ejecutivo

NYVORA presenta una base funcional solida para una plataforma ERP/SaaS multiempresa: existe separacion por empresa, modulo de Administracion APEX, operacion de Servicios, maestros, dashboards, roles, control de sesion, RLS/Supabase en rutas criticas y build productivo estable.

Sin embargo, desde una perspectiva enterprise, la plataforma NO queda certificada para salida general a clientes reales sin condiciones. El principal bloqueo es Record Lifecycle Management: existen rutas, politicas y modelos con eliminacion fisica o cascadas sobre entidades operativas sin una politica unica implementada ni un permiso independiente tipo `DELETE_PHYSICAL_RECORDS` aplicado de extremo a extremo.

Estado de certificacion: CONDICIONADA.

Dictamen: NYVORA puede continuar operacion interna controlada y pilotos limitados con datos supervisados, pero no debe autorizarse como ERP enterprise general hasta cerrar los bloqueos criticos de ciclo de vida, permisos negativos y pruebas funcionales UI completas con usuarios reales por rol.

## 2. Evidencia ejecutada

Validaciones locales ejecutadas:

- `npm.cmd --workspace apps/web run typecheck`: OK.
- `npm.cmd --workspace apps/web run lint`: OK.
- `npm.cmd run prisma:validate`: OK.
- `npm.cmd --workspace apps/web run build`: OK.

Restricciones respetadas:

- No se toco QA.
- No se modifico infraestructura.
- No se reviso Railway.
- No se modifico Supabase.
- No se cargaron datos ficticios sobre IMPORTADORA SCJ SAS.
- No se ejecutaron auditorias destructivas.

Limitacion metodologica: esta certificacion se basa en analisis funcional local, estructura de codigo, rutas, politicas, componentes, scripts y validaciones de build. No sustituye una corrida manual completa con navegador autenticado por cada rol en NYVORA.

## 3. Fortalezas

- Arquitectura modular clara: Inventario, Compras, Ventas, Facturacion, Contabilidad, Servicios, Talento Humano, Transporte, Administracion APEX, APEX AI Core y otros modulos de crecimiento.
- Control de acceso modular centralizado en `moduleAccess`.
- Flujo oficial de Administracion APEX para empresas, modulos y sesiones.
- Modulo de Servicios con flujo operacional avanzado: asignacion, inspeccion, evidencias, firma, cierre, no ejecutada y reportes.
- Manejo de sesion con expiracion, refresh y limpieza de storage.
- RLS y scoping multiempresa presentes en varias migraciones y consultas.
- Build y typecheck estables.
- Correcciones recientes resolvieron riesgos reales: duplicacion de ordenes, cierre tecnico, evidencia de piezas y resolucion de modulos por usuario actual.

## 4. Debilidades

- Record Lifecycle Management no esta implementado de forma uniforme.
- Existen eliminaciones fisicas en UI/API sin doble confirmacion universal ni permiso independiente `DELETE_PHYSICAL_RECORDS`.
- Existen politicas SQL antiguas con `delete` y relaciones `on delete cascade` en entidades operativas sensibles.
- Algunos modulos son funcionalmente "base" o "en construccion"; no todos estan listos para operacion enterprise completa.
- Varias pantallas usan `console.error` y capturas con degradacion a mensaje generico; se requiere politica estandar de error visible + registro.
- La matriz de permisos existe parcialmente, pero no hay evidencia de pruebas negativas automatizadas por rol, API, URL directa y payload manipulado.
- No existe todavia un reporte automatico de certificacion por rol/modulo.

## 5. Modulos evaluados

| Modulo | Estado funcional observado | Calificacion |
|---|---:|---:|
| Dashboard | Operativo, depende de modulos activos y datos disponibles | 7.5 |
| Administracion APEX | Funcional, critico para empresas/modulos/usuarios; requiere hardening RLM | 7.8 |
| Servicios | El mas maduro operacionalmente; requiere pruebas manuales completas post-hotfix | 8.0 |
| Inventario | Base funcional; WMS avanzado visualmente, requiere pruebas de persistencia profundas | 7.0 |
| Compras | Base funcional en ordenes, facturas, proveedores | 7.0 |
| Contabilidad | Base funcional; requiere validacion de anulacion vs eliminacion | 6.8 |
| Talento Humano | Base/operacional parcial; requiere matriz completa de permisos | 6.8 |
| Transporte | Base funcional; requiere pruebas de documentos, vehiculos y no eliminacion fisica | 6.7 |
| Ventas | En construccion; no certificable como modulo enterprise completo | 5.8 |
| Facturacion | En construccion; no certificable como facturacion enterprise completa | 5.5 |
| Proyectos | Base funcional, buena experiencia ejecutiva | 7.0 |
| APEX AI Core | Integrado como capa auxiliar; no debe bloquear operacion core | 6.5 |

Calificacion general ponderada: 7.1 / 10.

## 6. Roles evaluados

Matriz objetivo:

| Rol | Crear | Editar | Consultar | Eliminar fisico | Admin usuarios | Admin modulos | Riesgo |
|---|---|---|---|---|---|---|---|
| Platform SuperAdmin | Si | Si | Si | No por defecto | Si | Si | Debe validar `DELETE_PHYSICAL_RECORDS` explicito |
| Admin Empresa | Si, por modulo | Si, por modulo | Si | No por defecto | Si empresa | No plataforma | RLM incompleto |
| Usuario Administrativo | Segun permiso | Segun permiso | Si | No | No | No | Requiere pruebas negativas |
| Supervisor | Segun permiso | Segun permiso | Si | No | No | No | Requiere scoping |
| Tecnico Servicios | No maestros | Ejecuta asignadas | Solo asignadas | No | No | No | Flujo corregido recientemente |
| Solo Lectura | No | No | Si | No | No | No | No evidenciado como rol formal |
| Usuario sin rol | No | No | Minimo/No | No | No | No | Debe probarse por URL directa |
| Usuario inactivo | No | No | No | No | No | No | Debe probarse login/API |

Hallazgo: la matriz existe conceptualmente, pero no hay certificacion completa por UI/API/URL/payload para todos los roles. Esto queda como requisito previo a certificacion final.

## 7. Matriz de permisos requerida

Permisos funcionales esperados:

- `access`
- `view`
- `create`
- `edit`
- `approve`
- `reject`
- `void`
- `export`
- `import`
- `attach`
- `download`
- `configure`
- `administer`
- `execute`
- `reports`
- `sensitive`
- `manage_users`
- `manage_roles`
- `DELETE_PHYSICAL_RECORDS`

Regla enterprise: `DELETE_PHYSICAL_RECORDS` no puede estar implicito en ningun rol, incluyendo Platform SuperAdmin. Debe asignarse manualmente, auditarse y retirarse individualmente.

## 8. Pruebas ejecutadas y pendientes

Ejecutadas:

- Compilacion production de Next.js.
- TypeScript.
- ESLint.
- Prisma validate.
- Auditoria estatica de rutas de modulos.
- Auditoria estatica de deletes fisicos.
- Auditoria estatica de errores y catch silenciosos.
- Revision de acceso modular y resolucion de empresa/usuario.

Pendientes obligatorias:

- Recorrido manual completo con usuario NYVORA Admin Empresa.
- Recorrido manual con Tecnico Servicios.
- Recorrido manual con usuario administrativo.
- Pruebas negativas por API.
- Pruebas de URL directa a rutas no autorizadas.
- Pruebas con payload manipulado.
- Pruebas de empresa inactiva y usuario inactivo.
- Pruebas mobile reales en dispositivo.
- Pruebas responsive con pantallas pequenas.

## 9. Hallazgos

### H1 - Record Lifecycle Management incompleto

Se detectaron rutas y politicas que permiten o modelan eliminacion fisica:

- `deletePlatformCompany`.
- `DELETE /api/platform/companies`.
- `DELETE` en documentos de usuarios.
- `DELETE` en bodegas, estructura contable, IVA y otras configuraciones.
- Politicas SQL `for delete` sobre company users, company modules, employees, services, service orders, storage objects.
- Relaciones `on delete cascade` en entidades que pueden tener historial operativo.

Impacto: riesgo de perdida irreversible de historico, auditoria incompleta, registros huerfanos o destruccion accidental de datos empresariales.

Severidad: Critica.

Estado: No corregido en esta fase por alcance y riesgo. Requiere implementacion transversal.

### H2 - Certificacion de roles incompleta

El sistema tiene permisos y roles, pero falta una suite formal que demuestre que cada rol falla correctamente por UI/API/URL directa/payload manipulado.

Severidad: Alta.

### H3 - Errores silenciosos o degradados

Existen patrones de `catch` que retornan `[]`, `null` o degradan datos cuando fallan consultas auxiliares. Algunos son aceptables para resiliencia, pero deben registrarse y mostrarse como estado funcional cuando impactan operacion.

Severidad: Media.

### H4 - Modulos en construccion visibles en menu

Varios modulos aparecen como disponibles aunque funcionalmente no alcanzan madurez enterprise. Esto debe distinguirse entre "contratado", "activo", "beta" y "listo para operar".

Severidad: Media.

### H5 - IMPORTADORA SCJ SAS debe permanecer sin datos ficticios

El criterio indica que IMPORTADORA SCJ SAS es cliente real y no debe usarse para data demo. Toda carga funcional debe ir a NYVORA.

Severidad: Alta si se incumple.

## 10. Correcciones recientes consideradas

Se consideran dentro de la base auditada:

- Correccion de guard para Platform Admin.
- Correccion de duplicacion de orden al pasar de agendado a pendiente.
- Correccion de cierre de servicios para tecnicos.
- Correccion de evidencia de pieza averiada como `novedad` + `metadata.original_type`.
- Correccion de resolucion de modulos por usuario actual y cache por token.

## 11. Mejoras UX/UI

Observaciones:

- El dashboard debe diferenciar entre modulo no contratado, modulo sin datos y modulo bloqueado por rol.
- Los botones peligrosos deben tener color, texto y doble confirmacion consistentes.
- Los errores tecnicos no deben exponerse al usuario final; deben traducirse a mensaje de accion y registrarse.
- Las pantallas operativas de Servicios han mejorado, pero requieren prueba mobile completa con camara real.
- Tablas densas requieren estados vacios, busqueda visible y confirmacion de persistencia.

## 12. Mejoras funcionales

Prioridad 1:

- Implementar RLM central.
- Bloquear eliminacion fisica por defecto.
- Agregar permiso `DELETE_PHYSICAL_RECORDS`.
- Convertir deletes actuales a inactivar/anular/archivar salvo entidades estrictamente configurables sin dependencias.

Prioridad 2:

- Suite negativa por rol.
- Auditoria automatica de scoping multiempresa.
- Registro centralizado de errores funcionales.

Prioridad 3:

- Indicadores de madurez por modulo.
- Reporte de certificacion repetible por release.

## 13. Record Lifecycle Management requerido

Politica unica:

- Por defecto ningun usuario elimina fisicamente.
- Eliminar fisicamente solo con `DELETE_PHYSICAL_RECORDS`.
- Toda eliminacion fisica exige doble confirmacion.
- Toda eliminacion fisica exige motivo.
- Toda eliminacion fisica registra AuditLog.
- Antes de eliminar se validan dependencias e integridad referencial.
- Si hay historico, se bloquea y se ofrece inactivar/anular/archivar.

Entidades nunca eliminables:

- Empresas.
- Usuarios con historial.
- Ordenes de servicio ejecutadas o iniciadas.
- Marcaciones.
- Logs y auditoria.
- Movimientos contables.
- Documentos fiscales.
- Evidencias operativas.
- Sesiones historicas.

Entidades eliminables solo si no tienen dependencias:

- Vehiculos sin rutas, documentos ni movimientos.
- Referencias sin ordenes, piezas usadas ni servicios.
- Roles no asignados.
- Catalogos sin uso.
- Bodegas sin stock ni movimientos.
- Parametros de configuracion no usados.

Entidades preferidas para inactivar/anular:

- Usuarios.
- Tecnicos.
- Vehiculos.
- Referencias.
- Proveedores.
- Clientes.
- Modulos contratados.
- Roles asignados.

## 14. Riesgos

- Perdida de historico por eliminacion fisica no gobernada.
- Escalamiento accidental por permisos de delete genericos.
- Datos reales contaminados si se usa IMPORTADORA SCJ SAS para pruebas.
- Modulos contratados pero no maduros pueden generar percepcion de falla.
- Faltan pruebas negativas formales para API directa.

## 15. Pendientes para autorizacion final

1. Implementar RLM transversal.
2. Agregar y aplicar `DELETE_PHYSICAL_RECORDS`.
3. Cambiar deletes peligrosos por inactivar/anular/archivar.
4. Crear pruebas negativas por rol.
5. Ejecutar recorrido UI real con NYVORA.
6. Validar mobile/camara/firma en dispositivo real.
7. Certificar multiempresa con IDs manipulados.
8. Generar evidencia de pruebas con fecha, usuario, rol y resultado.

## 16. Plan de mejora

Fase A - Hardening critico:

- RLM central.
- Bloqueo de deletes fisicos.
- AuditLog obligatorio.
- Doble confirmacion.

Fase B - Certificacion de permisos:

- Matriz automatizada por rol.
- Pruebas UI/API/URL/payload.
- Usuario inactivo y empresa inactiva.

Fase C - Madurez funcional:

- Estados por modulo.
- UX de errores.
- Validaciones responsive.

Fase D - Go-live controlado:

- Datos reales solo en NYVORA para pruebas internas.
- IMPORTADORA SCJ SAS sin data ficticia.
- Piloto limitado.
- Firma de salida por QA.

## 17. Calificacion final

Calificacion general actual: 7.1 / 10.

Decision QA: NO AUTORIZADO para salida enterprise general sin condiciones.

Autorizacion limitada: SI, para operacion interna y piloto controlado con NYVORA, siempre que no se usen datos ficticios en IMPORTADORA SCJ SAS y que las operaciones destructivas se restrinjan manualmente hasta implementar RLM.

Conclusion: NYVORA esta cerca de una plataforma enterprise operable, pero el criterio minimo de gobernanza de datos y ciclo de vida de registros aun no esta cerrado. El producto debe pasar una fase final de hardening funcional antes de presentarse como ERP listo para clientes reales.
