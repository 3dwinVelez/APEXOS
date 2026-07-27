# Checklist manual - Chrome real

Fecha: 2026-07-27. Resultado: **APROBADO**.

Se ejecuto con Google Chrome 150.0.7871.182, perfil temporal aislado y bundle
local generado con `next build` y servido mediante `next start`.

| # | Paso | Evidencia | Resultado |
|---|---|---|---|
| 1 | Iniciar bundle productivo local | API/web saludables; CSP estricta | Aprobado |
| 2 | Login como tecnico QA | Servicios y panel offline visibles | Aprobado |
| 3 | Preparar datos offline | Capabilities y bootstrap HTTP correctos | Aprobado |
| 4 | Verificar IndexedDB | Nombre derivado; 6 almacenes autorizados | Aprobado |
| 5 | Bloquear API | Solicitudes API fallan realmente | Aprobado |
| 6 | Recargar y consultar ordenes | 2 ordenes locales; aislamiento correcto | Aprobado |
| 7 | Cerrar completamente Chrome | Proceso cerrado | Aprobado |
| 8 | Reabrir con el mismo perfil | IndexedDB y snapshot persistieron | Aprobado |
| 9 | Abrir detalle persistido | Detalle local disponible | Aprobado |
| 10 | Consultar actividades/checklist | 6 actividades y 4 items | Aprobado |
| 11 | Verificar ausencia de escrituras | Ningun control operativo offline | Aprobado |
| 12 | Simular expiracion controlada | Advertencia TTL visible | Aprobado |
| 13 | Restaurar API y actualizar | Reemplazo sin duplicados ni downgrade | Aprobado |
| 14 | Ejecutar logout | Base del usuario eliminada | Aprobado |
| 15 | Cerrar y reabrir tras logout | IndexedDB no reaparece | Aprobado |
| 16 | Tecnico de aislamiento | Sin panel, bootstrap, chunk ni base | Aprobado |
| 17 | Usuario no autorizado | Sin panel, bootstrap, chunk ni base | Aprobado |

Las evidencias sanitizadas estan en `docs/offline/evidence/phase3-4`. No
contienen secretos, tokens, cookies, cadenas de conexion ni PII real.
