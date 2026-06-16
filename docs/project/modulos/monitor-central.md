# Monitor central

## Objetivo

El inicio de APEXOS es un resumen dinámico de la actividad real de cada empresa. Su composición depende de los módulos habilitados y de los permisos del usuario; no funciona como un catálogo general ni muestra indicadores de módulos inactivos.

## Comportamiento aplicado

- El dashboard espera la resolución de módulos activos antes de mostrar o consultar información.
- Cada fuente de datos se consulta únicamente cuando su módulo está habilitado.
- Los indicadores usan cantidades y estados verificables. No se calculan porcentajes artificiales de salud, riesgo o desempeño.
- Las excepciones muestran pendientes reales que requieren atención y desaparecen cuando su valor es cero.
- Un módulo activo sin una fuente analítica confiable aparece como acceso disponible, pero no genera KPI vacío o estimado.
- Los accesos, tarjetas y resúmenes respetan los permisos efectivos del usuario.
- La tendencia principal conserva el gráfico de líneas y representa servicios programados durante los últimos siete días.
- Las cifras clave se presentan en una franja compacta, evitando tarjetas KPI grandes que saturen la pantalla.
- La interfaz evita textos introductorios y reserva el espacio principal para cifras, gráficos, estados y acciones.
- Las fuentes que no responden se reportan explícitamente; no se convierten silenciosamente en indicadores con valor cero.

## Fuentes actuales

- **Servicios:** órdenes abiertas, cerradas, programadas hoy, no ejecutadas, evidencias e incidentes.
- **Talento humano:** personas planeadas, señal reciente, rutas, marcaciones y preoperacionales.
- **Transporte:** vehículos registrados, activos, confiables, bloqueados, pendientes de validación y documentos por vencer.

## Regla de experiencia

El monitor central debe responder dos preguntas con datos objetivos: qué está ocurriendo hoy y qué requiere atención. Al activar nuevos módulos, el inicio incorpora solamente la información útil y confiable de esos módulos, conservando una lectura simple y profesional.

## Modelos visuales base

- Línea temporal para tendencias reales disponibles.
- Franja compacta de cifras clave con acceso al módulo de origen.
- Barras de actividad para conteos reales cuando no existe una dimensión temporal confiable.
- Distribuciones por estado cuando el dato tiene categorías verificables.
- Lista de excepciones para pendientes concretos.
- Resumen por módulo con acceso directo a la operación.
