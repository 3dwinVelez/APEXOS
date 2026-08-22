# Política de promociones puntuales y preservación funcional

## Objetivo

Evitar que una corrección de un módulo reemplace o elimine funciones previamente certificadas. La unidad de aprobación es el diff neto entre el destino vigente y el candidato, no una rama completa ni el estado histórico de una máquina.

## Flujo obligatorio

1. Actualizar referencias remotas y registrar el SHA actual del destino.
2. Implementar únicamente en `desarrollo` sobre el baseline vigente.
3. Inventariar los archivos indispensables y declararlos en `allowed_paths`.
4. Declarar individualmente cualquier eliminación en `allowed_deletions`.
5. Declarar capacidades protegidas del dominio y adjuntar evidencia aprobada para cada una.
6. Ejecutar la compuerta de alcance antes de `desarrollo → develop` y repetirla antes de `develop → main`.
7. Si el destino cambia, detener la promoción, sincronizar, recalcular el diff y recertificar.

## Recuperaciones y rollbacks

- Se recuperan commits o hunks puntuales sobre el baseline actual.
- No se restaura un árbol completo desde una etiqueta, backup o commit antiguo.
- Un rollback amplio requiere un inventario de capacidades que demuestra qué funciones conserva y cuáles elimina.
- Una migración solo acompaña el cambio que la necesita; nunca se ejecuta un lote de migraciones históricas para completar una corrección puntual.
- Los archivos generados, capturas antiguas, secretos y artefactos de otra ejecución no forman parte de una recuperación.

## Trabajo desde varias máquinas

Cada máquina entrega commits pequeños con un único objetivo. Antes de publicar debe traer el destino remoto vigente, comprobar ancestros, ejecutar el diff completo y repetir las pruebas protegidas. Si dos entregas tocan el mismo módulo, la segunda certifica la combinación integrada; no reutiliza evidencia obtenida antes de la integración.

## Capacidades protegidas de Servicios

Como mínimo se prueban juntas:

- creación e inicio de órdenes internas y externas;
- corrección administrativa en todos sus modos;
- persistencia y auditoría de evidencias;
- bloqueo de roles sin permiso especial;
- aislamiento entre empresas;
- reapertura y persistencia después de recarga.

## Manifiesto

El manifiesto JSON incluye `change_id`, `base_commit`, `certified_commit`, `allowed_paths`, `allowed_deletions` y `protected_capabilities`. Cada capacidad protegida debe tener `status: "passed"` y al menos un archivo de evidencia existente junto al manifiesto.
