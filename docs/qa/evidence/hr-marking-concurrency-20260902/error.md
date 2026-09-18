# Escenarios de error exigidos

- Horario ajeno: `409 HORARIO_AJENO_DENEGADO`.
- Horario fuera del dia: `409 HORARIO_FUERA_DEL_DIA`.
- Marca fuera de secuencia: `409 MARCACION_FUERA_DE_SECUENCIA`.
- Jornada ya completa: `409 JORNADA_COMPLETA`.
- Pool o serializacion agotados después de cinco intentos: `503 MARCACION_CONCURRENCIA_TEMPORAL`; el cliente conserva la solicitud para reintento.
- Validacion permanente `4xx`: el cliente retira solo esa solicitud y avisa que no fue aceptada.
