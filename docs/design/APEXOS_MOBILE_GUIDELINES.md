# APEXOS Mobile Guidelines

Version: 2.0

Estado: Normativa QA

## Proposito

Mobile no es una version reducida de desktop.

Mobile es una experiencia independiente para tecnicos, conductores, operarios, supervisores de campo y personal movil.

La pantalla movil debe responder:

> Puede un tecnico completar esta tarea en menos de 30 segundos y sin capacitacion?

Si la respuesta es no, la pantalla debe redisenarse.

## Principios

- Uso con una sola mano.
- Navegacion natural con el pulgar.
- Acciones evidentes.
- Informacion minima indispensable.
- Alto contraste.
- Flujo paso a paso.
- Cero tablas complejas.
- Cero formularios extensos.
- Confirmacion inmediata.
- Offline First respetado.
- Respuesta tactil inmediata.

## Layout Mobile

- Una tarea principal por pantalla.
- Una accion primaria fija cuando la tarea lo requiera.
- Botones tactiles de minimo 48px.
- Accion operacional critica de 56px o mas.
- Safe area inferior respetada.
- Navegacion inferior cuando reduzca toques.
- Encabezados compactos y persistentes solo si aportan contexto.

## Contenido

Mostrar solo:

- Estado actual.
- Siguiente accion.
- Datos indispensables.
- Evidencia requerida.
- Riesgos o bloqueos.

Ocultar o mover a detalle:

- Historial largo.
- Campos administrativos.
- Tablas.
- Metadatos no accionables.
- Textos explicativos largos.

## Flujos Paso A Paso

Cada paso debe tener:

- Titulo corto.
- Un conjunto pequeno de campos o decisiones.
- Progreso claro si hay multiples pasos.
- Accion primaria evidente.
- Error inmediato y recuperable.

Ejemplos:

- Identificar servicio.
- Tomar fotos.
- Validar piezas.
- Reportar novedad.
- Capturar firma.
- Finalizar.

## Captura De Evidencia

Fotos, firmas y datos de campo deben:

- Tener protagonismo visual.
- Mostrar estado de carga/subida.
- Permitir reintento.
- Confirmar exito.
- Mantener comportamiento offline first.

No ocultar acciones de camara, firma o finalizacion dentro de menus secundarios.

## Formularios Mobile

- No usar mas de 5 campos por paso salvo excepcion justificada.
- Inputs de 48px minimo.
- Teclado adecuado por campo: numerico, telefono, email, fecha.
- Selects simples.
- Evitar grids de varias columnas.
- Placeholders cortos; labels siempre visibles.

## Estados Mobile

Estados obligatorios:

- Cargando.
- Sin conexion o sincronizacion pendiente.
- Error recuperable.
- Evidencia pendiente.
- Tarea completada.

Estados criticos deben usar color, texto e icono.

## Navegacion

- El usuario debe poder volver sin perder datos.
- La accion principal debe estar al alcance del pulgar.
- No usar menus ocultos para acciones criticas.
- Evitar modales grandes; preferir drawers o pasos completos.

## Validacion Mobile

Antes de aprobar:

- Revisar 360x800.
- Revisar 390x844.
- Revisar 412x915.
- Probar con una sola mano.
- Confirmar que no hay tablas complejas.
- Confirmar que textos y botones no se solapan.
- Confirmar que cada tarea critica puede completarse en menos de 30 segundos en condiciones normales.

