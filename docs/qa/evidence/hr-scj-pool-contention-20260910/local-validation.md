# Validacion local y diagnostico QA

- Candidato funcional reconstruido sobre `origin/develop`: `e46326e` (equivalente puntual de `desarrollo@38468b4`).
- Diagnostico QA previo: 20 usuarios SCJ, 80 marcaciones y 20 reenvios idempotentes; 0 errores, 0 perdidas y 0 duplicados.
- Latencia previa: p50 entre 16.602 ms y 21.234 ms; maximo 25.672 ms.
- Causa: `ensurePreoperationalChecklist` usaba el cliente Prisma global dentro de una transaccion interactiva y podia esperar una segunda conexion del mismo pool.
- Correccion: el helper recibe y reutiliza `tx` para consultas y escrituras preoperacionales.
- Regresion focal: 30 pruebas aprobadas, 0 fallidas.
- `node --check apps/api/src/modules/hr/service.js`: aprobado.
- `git diff --check`: aprobado.

## Certificacion posterior en QA

- Commit desplegado y verificado por `/health`: `3bdebf537f8c`.
- Servicio intervenido: `apexos-api-qa`; `DATABASE_URL` conservada y `connection_limit` ajustado de `1` a `10` en el pooler de Supabase QA.
- Redeploy Railway: `11a774ec-c2db-43c9-9b17-e8f24e8f01b1`, estado `SUCCESS`.
- Ejecucion SCJ: `scj_hr_pool10_postcert_1789052571978`, ruta `78`, 20 usuarios activos con permiso `time_tracking:write`.
- Resultado: 80 de 80 marcaciones persistidas, 80 claves unicas, 0 errores, 0 perdidas, 0 duplicados y 20 de 20 reenvios idempotentes asociados a la marcacion original.
- Entrada: p50 `2.709 ms`, p95/maximo `2.895 ms`.
- Inicio de almuerzo: p50 `2.126 ms`, p95/maximo `2.389 ms`.
- Fin de almuerzo: p50 `2.142 ms`, p95/maximo `2.346 ms`.
- Salida: p50 `2.092 ms`, p95/maximo `2.311 ms`.
- Mejora del peor p95: de `25.672 ms` a `2.895 ms` (reduccion aproximada de `88,7 %`).

Juliana (`juliana@apexos.local`) conserva sus horarios y mallas, pero no fue usada para simular marcaciones porque su rol no tiene `time_tracking:write`; no se altero RBAC para forzar el escenario.
