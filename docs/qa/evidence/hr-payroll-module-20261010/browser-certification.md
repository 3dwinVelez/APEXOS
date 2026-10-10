# Certificacion funcional local - Modulo de nomina y talento humano

Fecha: 2026-10-10
Ambiente: LOCAL (BD + Redis via docker compose, app en localhost)
Responsable funcional: solicitante (manue / edwar.lopez@hogarymoda.com.co)

El solicitante valido funcionalmente en su base local los siguientes flujos del modulo,
revisando los resultados en pantalla:

- Creacion/edicion de empleado y afiliaciones a entidades.
- Importacion de jornadas externas (plantilla Excel) con validacion de duplicados y rangos de periodo.
- Liquidacion de nomina por quincena y por mes (mes comercial de 30 dias; descanso desde la malla).
- Hora extra diurna y recargo nocturno segun value_type configurable (recargo = % adicional; hora extra = factor total).
- Divisor de hora ordinaria 210 (jornada 42h, Ley 2101), parametrizable con vigencia.
- Auxilio de transporte proporcional con forma de pago configurable (ambas / ultima quincena).
- Jornada ordinaria externa reflejada como "Salario" y salario pagado por dia (salario/30).
- Provisiones de prestaciones sociales (prima, cesantias, intereses recalculados sobre el acumulado, vacaciones) tomando quincenas por rango.
- Pago de prestaciones provisionadas.
- Aportes sociales con resumen por empleado (IBC, empleado/empleador por concepto, estilo PILA).
- Comprobante de nomina y descarga de PDF.
- Reportes: nomina por concepto y saldos de prestaciones (consolidado por empleado + exportacion Excel).
- Listado de ajustes oculta anulados; validacion de rango de periodo en la UI.

Resultado: los flujos se ejecutaron correctamente y los valores liquidados coincidieron con lo esperado.
