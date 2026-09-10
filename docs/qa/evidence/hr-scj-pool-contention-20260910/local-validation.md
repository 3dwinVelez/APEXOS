# Validacion local y diagnostico QA

- Candidato funcional: `38468b4`.
- Diagnostico QA previo: 20 usuarios SCJ, 80 marcaciones y 20 reenvios idempotentes; 0 errores, 0 perdidas y 0 duplicados.
- Latencia previa: p50 entre 16.602 ms y 21.234 ms; maximo 25.672 ms.
- Causa: `ensurePreoperationalChecklist` usaba el cliente Prisma global dentro de una transaccion interactiva y podia esperar una segunda conexion del mismo pool.
- Correccion: el helper recibe y reutiliza `tx` para consultas y escrituras preoperacionales.
- Regresion focal: 30 pruebas aprobadas, 0 fallidas.
- `node --check apps/api/src/modules/hr/service.js`: aprobado.
- `git diff --check`: aprobado.

La certificacion posterior al despliegue debe repetir la rafaga autenticada sobre el SHA exacto y demostrar mejora de latencia sin perdidas ni duplicados.
