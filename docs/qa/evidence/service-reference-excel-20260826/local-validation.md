# Evidencia local

## Resultado aprobado

- Pruebas del parser y mensajes por fila: 4/4.
- Pruebas de validación, RBAC y contrato backend: 4/4.
- Pruebas de atomicidad transaccional: 2/2.
- Contrato del certificado QA: 2/2.
- TypeScript: aprobado.
- Build productivo Next.js: aprobado, 75 páginas generadas.
- Plantilla: paquete ZIP/OOXML válido, 19.804 bytes, 3 hojas, 15 encabezados y 7.996 reglas de validación de celdas.
- Render visual revisado para las hojas `Referencias`, `Ejemplo` e `Instrucciones`.

## Comandos ejecutados

```text
node --experimental-strip-types --test apps/web/test/service-reference-import.test.mjs
node --test apps/api/test/service-reference-import-validation.test.js apps/api/test/service-reference-import-atomic.test.js scripts/test/service-reference-excel-qa-certification.test.js
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```

## Cobertura relevante

- Encabezados faltantes o alterados.
- Datos generales inconsistentes entre filas del mismo código.
- Piezas y manuales duplicados.
- Cantidades, minutos, categorías, estado y URL inválidos.
- Confirmación conjunta de lotes válidos.
- Rollback total ante un fallo de base de datos controlado.
- Autenticación, tenant y permiso `services:write` conservados en la ruta.
- Lectura interoperable de la plantilla por el motor web y por el verificador de hojas.

## Pendiente obligatorio

La prueba end-to-end contra QA no se ejecutó porque las variables seguras requeridas no están configuradas. Conforme a `AGENTS.md`, el estado no se presenta como certificación funcional completa y bloquea la promoción.
