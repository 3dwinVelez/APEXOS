# Filosofia de producto e interfaz

APEXOS debe sentirse profesional, simple, intuitivo y amable. Cada modulo debe abrir con un proposito claro y guiar al usuario hacia las acciones disponibles sin saturar la pantalla.

## Premisa universal de diseno

Toda pantalla debe poder entenderse sin capacitacion extensa. Antes de considerarse atractiva, debe ser legible, practica y evidente para una persona que entra por primera vez.

- La interfaz debe explicar su uso mediante jerarquia, nombres claros y acciones visibles; no mediante textos largos.
- Una pantalla bonita que dificulta encontrar, comparar o completar una tarea se considera incorrecta.
- La informacion debe organizarse segun la pregunta real del usuario: que debo hacer, que necesita atencion y como continuo.
- En escritorio, los conjuntos de registros comparables deben preferir tablas legibles con columnas estables y una accion clara por fila.
- En movil, las tablas deben transformarse en tarjetas o bloques tactiles que mantengan la misma jerarquia de informacion.
- Cada columna, indicador, tarjeta o control debe justificar el espacio que ocupa.
- Los datos administrativos y analiticos deben vivir en dashboards; los modulos operativos deben reservar espacio para ejecutar trabajo.
- Todas las pantallas deben ser legibles y operables tanto en tema claro como oscuro; colores, estados, bordes, formularios y acciones deben conservar contraste suficiente.
- El tema seleccionado debe persistir entre sesiones y poder alternarse sin interrumpir el flujo del usuario.
- Las acciones primarias con fondo `apex` deben adaptar tambien el color del texto en tema oscuro; no se debe asumir que texto blanco conserva contraste sobre el color de marca iluminado.
- Los nuevos componentes deben preferir los tokens `paper`, `line`, `ink` y `apex` sobre colores hexadecimales fijos. Los colores semanticos se reservan para estados y deben incluir fondo, borde y texto legibles en ambos temas.
- La transicion entre temas debe ser breve y afectar superficies, texto, bordes, campos y sombras sin producir destellos claros.

## Principios obligatorios

- Una pantalla debe tener una funcion principal.
- Las acciones secundarias deben vivir en botones, tarjetas de accion, menus o ventanas flotantes.
- No mezclar creacion, edicion, consulta, configuracion y monitoreo en el mismo bloque si eso genera desorden.
- Los formularios largos o auxiliares deben abrirse en modales, paneles laterales o pantallas dedicadas.
- Las vistas principales deben priorizar resumen, acciones principales, filtros simples y listados faciles de escanear.
- Los listados deben permitir comparar registros rapidamente sin obligar a abrir cada elemento.
- Las pantallas moviles deben tener botones tactiles, buen espaciado y acciones de una mano.
- El texto visible debe ser breve y funcional.
- La decoracion no debe competir con la operacion.
- La consistencia entre modulos es parte de la funcionalidad.

## Patron aplicado

Se agregaron componentes compartidos para extender esta filosofia:

- `ActionCard`: tarjeta tactil para acciones principales y accesos a subflujos.
- `ModalFrame`: ventana flotante reutilizable para formularios y tareas secundarias.

## Patron de estado ante fallo: la tecnica no es interfaz

Un fallo de la API, de la base de datos o de la red es un estado del dato, no una notificacion. La pantalla que no pudo cargar dice que no pudo cargar, si el trabajo del usuario se perdio y que puede hacer despues; cuando exista, cita una referencia para soporte (`request_id` o `digest`). La ruta, el codigo HTTP y el detalle crudo del servidor no se pintan: se registran (`POST /api/v1/admin/platform-logs/client`) y solo se muestran si soporte enciende `localStorage.apexos_diagnostics = "1"` en ese navegador, con presupuesto de 5 tarjetas por minuto y cierre automatico. El cascaron vive en `apps/web/lib/platformAlerts.ts` y `apps/web/components/system/PlatformAlerts.tsx`; el embudo de errores en `apps/web/lib/api.ts`. La sesion cerrada se explica en el propio formulario de acceso, no como ventana.

## Reglas para cambios futuros

- Si una pantalla tiene mas de una funcion, separar la accion secundaria en modal o subpantalla.
- Si una funcion requiere captura de datos, no colocar el formulario abierto junto al listado principal salvo que sea una pantalla dedicada.
- Si una pantalla contiene maestros y operacion, separar maestro, consulta y creacion.
- Si el usuario operativo usara celular, disenar primero para tactil.
- Cada modulo debe conservar su flujo funcional, pero la interfaz debe reducir carga visual.
- Ningun fallo tecnico nuevo se presenta como ventana emergente al usuario: se agrega estado a la pantalla afectada y registro a platform-logs.
- Los temporizadores de refresco de una pantalla son parte de la interfaz: se eligen segun el costo de la lectura, no por defecto, y se respaldan en el evento que ya llega por otro canal.
