# Error and negative evidence - hr-report-alerts-presentation-20261001

TEST: Reporte sin alertas.
RESULTADO: passed.
ESPERADO: Una jornada sin alertas debe seguir mostrando `--` sin romper la tabla.
OBTENIDO: `PunchAlertStack` retorna el mismo placeholder `--` cuando `alerts.length` es cero.
EVIDENCIA: revision estatica del diff y `local-certification.json`.

TEST: Varias alertas del mismo tipo en una jornada.
RESULTADO: passed.
ESPERADO: Las alertas deben conservarse completas y renderizarse con claves React unicas.
OBTENIDO: Las claves usan `rowKey`, `alert.type` e indice, evitando colisiones cuando hay varias alertas del mismo tipo.
EVIDENCIA: `validation-checks.json`.

TEST: Cambio sin permisos nuevos.
RESULTADO: passed.
ESPERADO: La vista no debe introducir acciones, endpoints ni permisos nuevos.
OBTENIDO: El diff modifica solo renderizado cliente, prueba local y certificador; no hay cambios API, RBAC, Supabase, secretos ni infraestructura.
EVIDENCIA: `security-review.md`.

