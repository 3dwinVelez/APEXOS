# Roadmap de implementacion offline

Cada fase requiere flags apagadas por defecto y commit local separado. Un fallo
de criterio de salida detiene el avance.

| Fase | Objetivo y dependencias | Permitido / prohibido | Pruebas y criterio de salida | Rollback | Commit sugerido |
| --- | --- | --- | --- | --- | --- |
| 1. Fundamentos y contratos | Cerrar arquitectura, seguridad, flags, tipos y puertos. Depende de auditoria aprobada. | Docs, codigo aislado y tests; no almacenamiento ni rutas funcionales. | Validaciones actuales, flags falsas, serializacion y cero cambio de flujo/bundle material. | Retirar imports aislados o apagar flags. | `feat: define offline foundations` |
| 2. Almacenamiento local de solo lectura | Implementar Dexie tras repositorios. Depende de clasificacion y cuota. | Esquema vacio, migraciones locales y limpieza; no ordenes reales ni UI. | Transacciones, upgrade/downgrade soportado, aislamiento y cuota. | Borrar base versionada y desactivar flag. | `feat: add offline storage adapter` |
| 3. Bootstrap y consulta offline | Implementada: proyeccion minimizada con revision temporal `updated_at`. | Lectura de ordenes asignadas; no escrituras operativas. | Automatizacion aprobada; comparacion online/offline real pendiente de tecnico QA confirmado. | Apagar tecnico y eliminar proyeccion. | `feat: add offline bootstrap` |
| 4. Cola local de operaciones | Implementada localmente sobre Dexie v3; sin transporte. | `TEST_OPERATION` solo en harness automatizado; no push ni UI productiva. | Orden causal, idempotencia, recuperacion, aislamiento y limites automatizados. | Limpiar cola sintetica y conservar baseline Read-Only v1.0. | `feat: add offline operation queue` |
| 5. Sincronizacion manual | Push/pull estructurado. Depende de idempotencia/versiones servidor. | Boton manual y lotes pequenos; no auto sync. | Resultados parciales, replay, revocacion, carga y fallos de red. | Apagar sync; conservar cola local. | `feat: add manual offline sync` |
| 6. Evidencias | Captura, prepare, cuarentena y confirm. Depende de cuota y Storage autorizado. | Imagen temporal limitada; no base64 ni carga directa. | MIME/firma/hash, expiracion, duplicado, cuota y limpieza. | Apagar evidencia; conservar/exportar pendiente. | `feat: add offline evidence sync` |
| 7. Experiencia de usuario | Estados claros para piloto autorizado. Depende de flujos estables. | Indicadores, acciones de recuperacion y accesibilidad; no cambiar usuarios sin flag. | Responsive, accesibilidad, errores y pruebas de tecnico. | Ocultar UI por flag. | `feat: add technician offline experience` |
| 8. Conflictos y recuperacion | Resolver matriz completa. Depende de telemetria real. | Comparacion y escalamiento; no ultima escritura gana. | Todos los casos de matriz y no perdida de datos. | Bloquear operaciones conflictivas. | `feat: add offline conflict recovery` |
| 9. Automatizacion controlada | Evaluar auto sync. Depende de piloto manual estable. | Listeners diferidos y politica; no depender solo de Background Sync. | Bateria/red, duplicados, reintentos y apagado remoto. | Apagar `OFFLINE_AUTO_SYNC_ENABLED`. | `feat: add controlled offline auto sync` |
| 10. Certificacion del piloto | Seguridad, rendimiento y operacion QA. Depende de fases aprobadas. | Activacion limitada en QA; no produccion sin aprobacion. | Matriz E2E, perdida de dispositivo, rollback, carga y aceptacion. | Revocar dispositivos, flags off y limpieza. | `test: certify offline technician pilot` |

## Decisiones que requieren aprobacion posterior

- Migracion para version monotona y tablas de recibos/dispositivos/checkpoints.
- Politica final de lectura con sesion vencida; por defecto esta denegada.
- TTL final segun requisitos legales y operativos.
- Identidad exacta del tenant y usuarios del piloto QA.
- Incorporacion de Dexie en Fase 2 y presupuesto de bundle diferido.
- Paso a Capacitor/SQLite solo despues de resultados del piloto PWA.
