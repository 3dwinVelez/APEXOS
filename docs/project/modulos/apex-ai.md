# Modulo APEX AI

## Revision de experiencia

- La pantalla organiza salud operativa, seleccion de modulo, mentor contextual y senales priorizadas.
- La accion de generar recomendaciones esta separada como accion primaria.
- El usuario puede cambiar contexto sin perder la lectura de recomendaciones.
- 2026-06-14: La capa global y el panel de APEX AI consultan insights solo cuando el tenant y el rol tienen acceso real al modulo. Los tenants sin APEX AI dejan de generar respuestas 403 repetitivas y muestran estado no habilitado sin ocultar fallos tecnicos reales.

## Regla de experiencia

APEX AI debe comportarse como copiloto transversal: resumir, priorizar y recomendar. No debe competir con los modulos operativos ni reemplazar sus flujos.

## Validaciones esperadas

- Cargar recomendaciones.
- Cambiar modulo del mentor.
- Generar recomendaciones sin bloquear la lectura del panel.
