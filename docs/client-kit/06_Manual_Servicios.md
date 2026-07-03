# Manual de Servicios

Cliente: IMPORTADORA SCJ SAS  
NIT: 901406939  
Producto: NYVORA - APEX OS  
Version del documento: 1.0  
Fecha: 2026-07-03

## Objetivo

Explicar la gestion de servicios en NYVORA, desde la creacion de la orden hasta el seguimiento, evidencias y cierre.

## Alcance

Aplica para administradores, supervisores y tecnicos autorizados a operar servicios de IMPORTADORA SCJ SAS.

## Requisitos

- Modulo Servicios activo.
- Usuarios tecnicos activos.
- Referencias y piezas configuradas.
- Cliente o solicitud registrada.
- Permisos adecuados por rol.

## Descripcion

El modulo Servicios permite registrar solicitudes, asignarlas a tecnicos, controlar estados, cargar evidencias y cerrar la orden con trazabilidad.

## Creacion de servicio

1. Ingrese a Servicios.
2. Seleccione crear nuevo servicio o reciba la solicitud externa.
3. Registre cliente, direccion y telefono.
4. Seleccione tipo de servicio.
5. Seleccione referencia del producto.
6. Agregue observaciones si aplica.
7. Guarde la orden.

## Asignacion de tecnico

1. Abra la orden.
2. Seleccione tecnico disponible.
3. Confirme fecha o programacion.
4. Guarde la asignacion.

El tecnico debe pertenecer a la misma empresa.

## Seguimiento

El monitor permite revisar servicios por estado, fecha, tecnico o solicitud.

Estados recomendados:

- Agendado.
- Pendiente.
- En curso.
- Inspeccion.
- Ejecucion.
- Cerrada.
- No ejecutada.
- Cancelada.

## Cierre

1. Verifique que la orden avance por el flujo correcto.
2. Confirme evidencias requeridas.
3. Revise novedades.
4. Registre observacion final.
5. Cierre la orden.

Una orden no debe duplicarse al cambiar de estado.

## Evidencias

Las evidencias deben relacionarse con la orden correcta, la pieza correcta y la etapa correspondiente.

Recomendaciones:

- Imagen clara.
- Sin informacion ajena al servicio.
- Cargar en el momento de la atencion.
- Verificar que quede guardada.

## Capturas

Pendiente insertar capturas oficiales:

- [Captura: listado de ordenes]
- [Captura: formulario de servicio]
- [Captura: asignacion tecnico]
- [Captura: carga evidencia]
- [Captura: cierre de orden]

## Buenas practicas

- No crear ordenes duplicadas.
- Revisar datos antes de asignar.
- Mantener estados actualizados.
- Usar observaciones claras.
- Validar evidencias antes de cerrar.

## Preguntas frecuentes

**Que hago si no aparece una referencia?**  
El administrador debe revisar el maestro de referencias activas para la empresa.

**Por que una orden no cierra?**  
Puede faltar evidencia, novedad, observacion o permiso.

**Puedo reasignar tecnico?**  
Si el estado y permisos lo permiten.

## Recomendaciones

Durante la primera etapa, revisar diariamente las ordenes cerradas y las que presentan novedades.

## Historial de cambios

| Version | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-07-03 | Manual inicial del modulo Servicios. |
