# Contexto del proyecto - APEXOS

APEXOS es una plataforma modular de gestion empresarial para empresas pequenas, medianas y en crecimiento. El producto debe simplificar procesos operativos, administrativos y estrategicos con modulos claros, agiles y faciles de usar.

## Documentacion canonica

La documentacion de trabajo del proyecto vive en `docs/project`.

- `README.md`: indice general.
- `guia-inicio.md`: comandos y programas necesarios para iniciar el proyecto.
- `filosofia-producto-ui.md`: principios obligatorios de experiencia de usuario.
- `validacion-frontend-css.md`: validacion de estilos y assets frontend.
- `modulos/*.md`: cambios y reglas por modulo.

Los documentos historicos en `modules/*` y `docs/APEX_LEGACY_MIGRATION.md` se conservan como trazabilidad, pero los cambios nuevos deben registrarse en esta carpeta.

## Reglas de trabajo

- Leer este contexto antes de modificar codigo.
- Identificar el modulo afectado.
- Consultar el documento del modulo en `docs/project/modulos`.
- Evitar cambios fuera del alcance de la tarea.
- No duplicar funciones existentes si ya hay componentes o utilidades compartidas.
- Validar typecheck, build o flujos segun el riesgo del cambio.
- Documentar cambios funcionales y de experiencia cuando impacten al usuario.

## Prioridades actuales

- Mantener alineados Servicios, Talento Humano, Administracion, Transporte, Ventas y Facturacion con la migracion legacy.
- Evitar pantallas saturadas.
- Usar acciones claras, modales o pantallas dedicadas para creacion, edicion y configuracion.
- Preservar rendimiento y estabilidad del frontend.
