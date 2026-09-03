# Criterios funcionales

- Un usuario de marcaciones ve unicamente horarios asignados para el dia actual en `America/Bogota`.
- Un horario pasado o futuro no puede usarse para marcar, iniciar/cerrar sesion ni registrar actividad.
- La secuencia valida sigue siendo `entrada -> inicio_almuerzo -> fin_almuerzo -> salida` por horario.
- Reenviar exactamente una solicitud con la misma clave devuelve la marca existente.
- Cien usuarios pueden completar sus cuatro eventos sin perdida, duplicados ni contaminacion entre tenants.
- Un rechazo funcional visible no bloquea la sincronizacion de los eventos validos posteriores.
