# Escenarios negativos QA

- Un cambio de campo sin diferencia fue rechazado con `409 SERVICE_CORRECTION_NO_CHANGES`.
- El rol limitado del mismo tenant fue rechazado con `403`.
- El usuario autorizado de otro tenant fue rechazado con `403` o `404`, sin fuga de datos.
- El envio visual incompleto informo los tres requisitos exactos y no creo una correccion.
- La primera ejecucion detecto que la restriccion historica rechazaba el detalle de pieza. El hotfix compatible se desplego y la repeticion completa aprobo; la orden interrumpida `53` quedo cancelada tras la recuperacion.

