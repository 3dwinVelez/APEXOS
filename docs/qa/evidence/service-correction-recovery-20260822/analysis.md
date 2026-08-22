# Análisis de regresión — Corregir Servicios

Fecha: 2026-08-22. Empresa modelo: NYVORA.

## Causa

La función maestra fue implementada y certificada en los commits `918be97`, `ae30961`, `351431a`, `bd2911d` y `a23e455`. El rollback amplio `179f80f`, ejecutado después de una falla de compuerta de esquema de un release transversal, retiró el formulario validado, el fallback Supabase, el control de versión y el certificador E2E. El hotfix posterior de inicio de órdenes se construyó sobre ese baseline revertido y por eso no recuperó la función.

## Recuperación puntual

Se reaplicaron únicamente los cinco commits de Servicios sobre el `desarrollo` vigente. Se excluyó un cambio de Talento Humano y se eliminaron del candidato cuatro capturas antiguas incorporadas por el historial. Se preservaron el arreglo de inicio de solicitudes externas y el generador de consecutivos productivo.

No se ejecutó ninguna migración remota. La migración aditiva de estados administrativos se recuperó como archivo versionado porque pertenece al contrato original de la función; cualquier aplicación futura requiere autorización y compuerta de esquema independientes.

## Alcance funcional recuperado

- edición de campos con comparación antes/después;
- novedades y piezas faltantes/averiadas;
- cambio de estado, reapertura y cierre administrativo;
- adición y retiro controlado de evidencia;
- persistencia compatible para órdenes UUID de Supabase;
- conflicto optimista por versión;
- mensajes de validación y progreso visibles;
- auditoría, RBAC e aislamiento entre empresas.
