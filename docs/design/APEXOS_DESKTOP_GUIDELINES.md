# APEXOS Desktop Guidelines

Version: 2.0

Estado: Normativa QA

## Proposito

Desktop es la experiencia principal para administracion, inventarios, compras, ventas, gerencia, supervision, contabilidad y operaciones.

Debe servir a usuarios que trabajan entre 6 y 10 horas continuas frente al computador.

## Principios

- Alta densidad de informacion.
- Uso eficiente del espacio horizontal.
- Jerarquia clara.
- Navegacion predecible.
- Grandes tablas.
- Formularios amplios y rapidos.
- Pocos adornos.
- Baja fatiga visual.

## Layout

- Usar sidebar persistente para modulos.
- Mantener encabezados compactos.
- Preferir shells de ancho completo para operaciones densas.
- Usar paneles laterales cuando ayuden a comparar o editar sin perder contexto.
- Evitar heroes, tarjetas grandes y espacio vacio decorativo.

## Encabezado De Pantalla

Debe incluir:

- Titulo claro.
- Contexto operacional breve.
- Una accion primaria.
- Acciones secundarias agrupadas si hay mas de dos.

Altura sugerida: 56px a 88px segun complejidad.

## Tablas Desktop

Requisitos:

- Texto de 13px a 14px.
- Filas compactas.
- Header sticky.
- Scroll horizontal controlado cuando haya muchas columnas.
- Toolbar con busqueda, filtros y accion primaria.
- Columnas con alineacion semantica: texto izquierda, numeros derecha, estados centro o izquierda segun lectura.
- Acciones por fila compactas, preferiblemente agrupadas.

Cuando una tabla supere 100 filas potenciales, evaluar paginacion o virtualizacion antes de migrar.

## Formularios Desktop

- Usar grid de 2 a 4 columnas cuando reduzca desplazamiento.
- Agrupar campos por tarea, no por decoracion.
- Campos requeridos visibles.
- Validacion inmediata solo si evita errores costosos.
- Guardado con una unica accion primaria.

## Navegacion

- Sidebar: modulos principales, busqueda y estado de acceso.
- Breadcrumbs: obligatorios en pantallas profundas o de detalle.
- Tabs: para vistas hermanas de una misma entidad, no para reemplazar navegacion de modulos.

## Atajos

Cuando aplique:

- `Ctrl+K`: busqueda o comando global.
- `/`: buscar en tabla si el foco no esta en un input.
- `Esc`: cerrar modal/drawer.
- `Ctrl+S`: guardar formularios complejos.

Todo atajo debe tener alternativa visible.

## Densidad Visual

Preferir:

- Separadores sutiles.
- Filas y paneles compactos.
- Estados inline.
- Barras sticky funcionales.

Evitar:

- Cards alrededor de cada seccion.
- Iconos grandes sin funcion.
- Graficas no accionables.
- Sombras para separar contenido normal.

## Validacion Desktop

Antes de aprobar una pantalla:

- Revisar 1366x768.
- Revisar 1440x900.
- Revisar 1920x1080.
- Confirmar que no hay solapamientos.
- Confirmar que tablas mantienen lectura y acciones.
- Confirmar que el usuario puede completar la tarea sin recorrer la pantalla innecesariamente.

