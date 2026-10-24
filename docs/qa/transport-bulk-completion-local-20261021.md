# Resumen final de carga masiva de liquidaciones

Implementado únicamente en desarrollo local, sin despliegues ni cambios de esquema.

Tras contabilizar, el modal sustituye el formulario por un resultado por liquidación: código, centro, cantidad de documentos contables, importe contabilizado y error cuando corresponde. Muestra solicitadas, correctas, fallidas y total confirmado. El usuario revisa el resultado y pulsa Finalizar y volver a liquidaciones; al cerrar queda una confirmación visible en la torre. No hay temporizador que oculte errores antes de leerlos.

Si hay fallos, Revisar errores conserva la selección de los fallidos y vuelve al flujo para corregir/reintentar. Los correctos no quedan seleccionados para reenvío. Un error de actualización de la lista no sustituye el resultado ya confirmado por el servidor. Si no llega respuesta, se conserva el aviso de comprobar estado antes de reintentar, sin afirmar éxito.

Al abrir de nuevo se limpia archivo, preview, selección, formulario visible y mensajes anteriores. Si se importa otra vez un archivo completamente contabilizado, se muestra el resumen de los documentos existentes y se informa que no se generaron duplicados. No cambia aprobación, contabilidad, permisos ni idempotencia en backend.

## Validación

- ESLint del componente y TypeScript web aprobados.
- `node scripts/certifications/transport-settlement-import-local.js`: 44/44 comprobaciones aprobadas; ciclo real sobre API y PostgreSQL locales con empresas sintéticas.
- Evidencia final: `C:/Users/mq1/AppData/Local/Temp/apex-settlement-import-mn5y3j/evidence.json`, con SHA256 del candidato. Capturas de resumen correcto/error y móvil claro/oscuro en esa carpeta, revisadas visualmente.
- La prueba de navegador provoca una cuenta de ingreso inválida en una petición real para comprobar el resumen de error y posterior reintento válido. Verifica importación, aprobación independiente, contabilización, detalle/total, cierre, confirmación en torre, reinicio limpio y repetición de archivo terminado sin repostear.
- Se conserva la certificación contable: documentos balanceados, centros exactos, cartera, segregación, multiempresa, reintentos, rollback y carga de 200 filas/30 paquetes.

No se alteraron las liquidaciones existentes de Demo APEX. Para observar el nuevo cierre sin crear documentos adicionales, repetir la plantilla ya contabilizada y pulsar Importar y enviar a aprobación: recuperará las mismas liquidaciones y mostrará el resumen.

La suite global web no se volvió a ejecutar para este cambio de componente; los dos fallos anteriores documentados en transport-settlement-import-local-20261021.md siguen como bloqueos de publicación/promoción general. No se ejecutó ninguna promoción.
