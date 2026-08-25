# Política de promociones puntuales y preservación funcional

## Objetivo

Evitar que una corrección de un módulo reemplace o elimine funciones previamente certificadas. La unidad de aprobación es el diff neto entre el destino vigente y el candidato, no una rama completa ni el estado histórico de una máquina.

## Flujo obligatorio

1. Actualizar referencias remotas y registrar el SHA actual del destino. El validador compara los árboles completos aunque las ramas tengan commits de merge distintos.
2. Implementar únicamente en `desarrollo` sobre el baseline vigente.
3. Crear un manifiesto `scope_schema_version: 2`, declarar el objetivo y los módulos en `change_intent` e inventariar cada alta, modificación o eliminación en `expected_changes`.
4. Declarar los archivos indispensables en `allowed_paths`. Un prefijo de directorio facilita la clasificación, pero nunca autoriza archivos ausentes de `expected_changes`.
5. Declarar individualmente cualquier eliminación en `allowed_deletions`.
6. Declarar capacidades protegidas del dominio y adjuntar evidencia aprobada para cada una.
7. Ejecutar la compuerta de alcance antes de `desarrollo → develop` y repetirla antes de `develop → main`.
8. Si el destino cambia, detener la promoción, sincronizar, recalcular el diff y recertificar.

## Recuperaciones y rollbacks

- Se recuperan commits o hunks puntuales sobre el baseline actual.
- No se restaura un árbol completo desde una etiqueta, backup o commit antiguo.
- Un rollback amplio requiere un inventario de capacidades que demuestra qué funciones conserva y cuáles elimina.
- Una migración solo acompaña el cambio que la necesita; nunca se ejecuta un lote de migraciones históricas para completar una corrección puntual.
- Los archivos generados, capturas antiguas, secretos y artefactos de otra ejecución no forman parte de una recuperación.

## Trabajo desde varias máquinas

Cada máquina entrega commits pequeños con un único objetivo. Antes de publicar debe traer el destino remoto vigente, comprobar ancestros, ejecutar el diff completo y repetir las pruebas protegidas. Si dos entregas tocan el mismo módulo, la segunda certifica la combinación integrada; no reutiliza evidencia obtenida antes de la integración.

No se promueve directamente una rama mantenida en otra máquina. Primero se inspecciona `git diff --name-status <destino-remoto>..<candidato>` y se contrasta cada entrada con `expected_changes`. Si el asunto del commit menciona un módulo y el diff toca otro, la entrega se divide o se reconstruye aplicando únicamente sus hunks indispensables sobre el baseline remoto vigente.

Cuando varias funciones comparten un archivo, el manifiesto identifica todas las capacidades afectadas y las pruebas de regresión cubren las funciones vecinas. La autorización de un archivo no es autorización para sustituir componentes, funciones o bloques no relacionados dentro de ese archivo.

## Capacidades protegidas de Servicios

Como mínimo se prueban juntas:

- creación e inicio de órdenes internas y externas;
- corrección administrativa en todos sus modos;
- persistencia y auditoría de evidencias;
- bloqueo de roles sin permiso especial;
- aislamiento entre empresas;
- reapertura y persistencia después de recarga.

## Manifiesto

El manifiesto JSON nuevo incluye `scope_schema_version: 2`, `change_id`, `change_intent`, `base_commits` para `develop` y `main`, `certified_commit`, `expected_changes`, `allowed_paths`, `allowed_deletions` y `protected_capabilities`. Cada capacidad protegida debe tener `status: "passed"` y al menos un archivo de evidencia existente junto al manifiesto.

Ejemplo mínimo:

```json
{
  "scope_schema_version": 2,
  "change_id": "services-order-start-example",
  "change_intent": {
    "summary": "Corregir exclusivamente el inicio de órdenes de servicio",
    "modules": ["services"]
  },
  "expected_changes": [
    { "status": "M", "file": "apps/web/app/dashboard/servicios/page.tsx" }
  ]
}
```
