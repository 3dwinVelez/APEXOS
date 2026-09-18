# Validación local

Fecha: 2026-08-25

| Validación | Resultado |
|---|---|
| `node --check scripts/certifications/transport-master-qa.js` | Aprobado |
| `node --test apps/web/test/transport-master-access.test.mjs scripts/test/transport-master-qa-certification.test.js` | Aprobado, 8/8 |
| `npm --prefix apps/web run typecheck` | Aprobado |
| `npm --prefix apps/web run lint` | Aprobado, 0 errores y 0 advertencias |
| `npm --prefix apps/web run build` | Aprobado, 75 páginas; `/dashboard/transporte` generado |
| Tamaño real del PNG del certificador | 68 bytes, coincide con `file_size` |

La primera ejecución de la prueba de contrato encontró una expresión regular demasiado restrictiva en la propia prueba. Se corrigió y la suite completa se repitió satisfactoriamente. No fue un fallo de la aplicación.

La regresión de `module-access-policy` emite la advertencia preexistente `MODULE_TYPELESS_PACKAGE_JSON`; sus 6 pruebas aprobaron. No se modificó `apps/web/package.json` para silenciarla porque ese archivo contiene cambios SaaS ajenos a esta entrega y la advertencia no afecta compilación, lint ni ejecución.

El certificador contra QA no se ejecutó porque la corrección aún no está desplegada en `develop` y no existe autorización de promoción. Ejecutarlo ahora certificaría el código anterior y produciría evidencia inválida para este cambio.
