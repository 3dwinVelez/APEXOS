# Premisas UX/UI para pantallas Nyvora/APEXOS

## Principios obligatorios

- Pantallas sin relleno visual.
- Sin textos explicativos extensos.
- Sin parrafos innecesarios.
- Cada pantalla debe resolver una accion concreta.
- Cada boton debe tener una intencion clara.
- Cada formulario debe pedir solo lo necesario para completar la operacion.
- Priorizar listas limpias, filtros utiles y acciones rapidas.
- Diseno profesional, sobrio, moderno y operativo.
- Maximo aprovechamiento del espacio disponible.
- Estados vacios utiles, no decorativos.
- Mensajes cortos, directos y accionables.
- Jerarquia visual clara: contexto, accion, datos, detalle.
- Movil primero para operaciones de campo.
- Escritorio eficiente para administracion.
- Evitar duplicidad de informacion.
- Evitar pantallas que obliguen al usuario a pensar demasiado.
- Evitar componentes decorativos sin funcion.
- Todo texto debe ayudar a decidir, ejecutar o corregir.
- Las pantallas deben sentirse como herramienta empresarial seria, no como demo.
- Cada modulo debe mantener consistencia visual, de navegacion y de acciones.

## Tableros

- Mostrar solo KPIs que cambian decisiones.
- Ubicar excepciones y riesgos antes que metricas decorativas.
- Evitar heroes altos cuando la pantalla es operativa.
- Usar encabezados compactos y acciones primarias visibles.
- Cada tarjeta debe tener una funcion: comparar, alertar, filtrar o abrir una accion.

## Formularios

- Agrupar campos por decision operativa, no por estructura tecnica.
- Pedir primero campos obligatorios y frecuentes.
- Usar pasos o secciones cuando el formulario sea largo.
- Evitar campos avanzados en la primera captura si no son necesarios para crear el registro.
- Validar antes de enviar y mostrar errores cerca del contexto.
- Deshabilitar acciones durante guardado para evitar duplicados.
- Mantener botones finales claros: guardar, cancelar, siguiente, anterior.

## Tablas y listados

- La tabla debe permitir comparar sin abrir cada registro.
- Columnas principales: identificador, estado, responsable/recurso, fecha o vencimiento, accion.
- Incluir busqueda y filtros que correspondan a preguntas reales del usuario.
- Mantener acciones por fila cortas y consistentes.
- En movil usar tarjetas tactiles con la misma informacion esencial.
- Evitar repetir el mismo dato en encabezado, columna y badge si no aporta decision.

## Filtros

- Usar filtros por estado, fecha, responsable, sede, tipo o criticidad cuando sean accionables.
- Incluir limpieza de filtros cuando haya mas de un filtro activo.
- Evitar filtros que no cambian el trabajo del usuario.
- Los filtros deben conservar etiquetas cortas y valores entendibles.

## Modales

- Usar modales para crear, editar, confirmar o revisar detalle enfocado.
- Evitar modales con informacion que deberia vivir en una pantalla completa.
- Encabezado breve: que se esta editando y estado actual.
- Acciones fijas al final cuando el contenido sea largo.
- En movil, permitir lectura y accion sin controles ocultos.

## Estados vacios

- Deben explicar que falta y cual es la siguiente accion.
- No usar ilustraciones decorativas si consumen espacio operativo.
- Si el estado vacio depende de filtros, ofrecer limpiar filtros.
- Si depende de configuracion, enlazar o nombrar el maestro requerido.

## Mensajes de error

- Texto corto y directo.
- Decir que fallo y como corregirlo.
- No ocultar errores de red o permisos como listas vacias.
- Diferenciar error de validacion, error de permisos y error de conectividad.
- No mostrar detalles internos sensibles al usuario final.

## Confirmaciones

- Confirmar solo acciones criticas: borrar, retirar, cerrar, bloquear, publicar, procesar.
- La confirmacion debe nombrar el registro afectado.
- Evitar confirmaciones para acciones reversibles o de navegacion simple.
- Boton destructivo con texto especifico, no generico.

## Navegacion movil

- Una accion principal por pantalla.
- Botones tactiles de al menos 44px.
- Barras inferiores solo para acciones frecuentes de campo.
- Evitar tablas horizontales como experiencia primaria.
- Reducir encabezados pegajosos a contexto minimo.

## Acciones criticas

- Deshabilitar durante ejecucion.
- Mostrar resultado visible despues de guardar.
- Proteger contra doble clic y repeticion.
- Validar en frontend y backend.
- Registrar auditoria cuando cambia estado operativo, documento, cierre, asignacion o permiso.

## Pantallas de operacion en campo

- Priorizar velocidad, GPS, evidencia y siguiente accion.
- No mostrar configuracion administrativa al usuario de campo.
- Usar lenguaje de tarea: marcar, iniciar, cerrar, adjuntar, registrar.
- Mantener historial disponible pero secundario.
- Funcionar bien en celular con una mano.

## Pantallas administrativas

- Priorizar comparacion, busqueda, filtros y trazabilidad.
- Mostrar densidad controlada: mas datos utiles, menos texto de ayuda.
- Acciones masivas solo con previsualizacion y conteo.
- Mantener auditoria y estados visibles para registros sensibles.
- Separar configuracion, operacion y reporte.

## Reglas especificas para Nyvora/APEXOS

- Transporte es maestro de flota: consulta, ficha, documentos y score documental.
- Talento Humano separa operacion diaria, planeacion, mapa, reportes y nomina.
- Marcacion movil debe ser campo primero: GPS, evidencia y accion siguiente.
- Rutas debe permitir asignacion rapida individual o masiva, sin obligar a abrir detalle.
- Mapa GPS debe priorizar rutas, personas, estado de senal y trazabilidad.
- Reportes deben explicar ausencia de datos y errores de carga.
- Administracion debe ser densa y clara, sin lenguaje de demo.
