# Filosofia de producto e interfaz

APEXOS debe sentirse profesional, simple, intuitivo y amable. Cada modulo debe abrir con un proposito claro y guiar al usuario hacia las acciones disponibles sin saturar la pantalla.

## Principios obligatorios

- Una pantalla debe tener una funcion principal.
- Las acciones secundarias deben vivir en botones, tarjetas de accion, menus o ventanas flotantes.
- No mezclar creacion, edicion, consulta, configuracion y monitoreo en el mismo bloque si eso genera desorden.
- Los formularios largos o auxiliares deben abrirse en modales, paneles laterales o pantallas dedicadas.
- Las vistas principales deben priorizar resumen, acciones principales, filtros simples y listados faciles de escanear.
- Las pantallas moviles deben tener botones tactiles, buen espaciado y acciones de una mano.
- El texto visible debe ser breve y funcional.
- La decoracion no debe competir con la operacion.
- La consistencia entre modulos es parte de la funcionalidad.

## Patron aplicado

Se agregaron componentes compartidos para extender esta filosofia:

- `ActionCard`: tarjeta tactil para acciones principales y accesos a subflujos.
- `ModalFrame`: ventana flotante reutilizable para formularios y tareas secundarias.

## Reglas para cambios futuros

- Si una pantalla tiene mas de una funcion, separar la accion secundaria en modal o subpantalla.
- Si una funcion requiere captura de datos, no colocar el formulario abierto junto al listado principal salvo que sea una pantalla dedicada.
- Si una pantalla contiene maestros y operacion, separar maestro, consulta y creacion.
- Si el usuario operativo usara celular, disenar primero para tactil.
- Cada modulo debe conservar su flujo funcional, pero la interfaz debe reducir carga visual.
