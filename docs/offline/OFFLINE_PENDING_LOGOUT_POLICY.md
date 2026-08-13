# Politica de logout con operaciones pendientes

Esta politica esta modelada y probada, pero **no esta integrada al logout
productivo** en Fase 4.

## Sin pendientes

El logout certificado conserva su comportamiento: elimina completamente la
base local.

## Con pendientes

La decision requerida es `REQUIRE_EXPLICIT_DECISION`. No se permite borrar o
conservar silenciosamente. Las opciones futuras son:

1. Volver para sincronizar cuando esa capacidad sea autorizada.
2. Descartar mediante confirmacion explicita.

Una exportacion diagnostica requerira autorizacion posterior y no se modela
como salida actual. Otro usuario nunca abre la misma base porque el nombre
fisico esta particionado por contexto.
