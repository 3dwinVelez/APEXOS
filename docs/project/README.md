# Documentacion canonica de APEXOS

Esta carpeta centraliza la documentacion viva del proyecto APEXOS.

## Guias generales

- [Contexto del proyecto](./contexto-proyecto.md)
- [Guia de inicio local](./guia-inicio.md)
- [Proyecto local](./proyecto-local.md)
- [Flujo de ramas y ambientes](./flujo-ramas-y-ambientes.md)
- [Filosofia de producto e interfaz](./filosofia-producto-ui.md)
- [Validacion de frontend y CSS](./validacion-frontend-css.md)

## Modulos

- [Administracion](./modulos/administracion.md)
- [Servicios](./modulos/servicios.md)
- [Talento Humano](./modulos/talento-humano.md)
- [Monitor Central](./modulos/monitor-central.md)
- [Transporte](./modulos/transporte.md)
- [Ventas](./modulos/ventas.md)
- [Facturacion](./modulos/facturacion.md)
- [Compras](./modulos/compras.md)
- [Inventario](./modulos/inventario.md)
- [Contabilidad](./modulos/contabilidad.md)
- [APEX AI](./modulos/apex-ai.md)

## Regla de mantenimiento

Todo cambio funcional, visual o de flujo debe documentarse aqui. Los archivos historicos fuera de esta carpeta pueden existir como soporte, pero la referencia principal del proyecto queda en `docs/project`.

La documentacion operativa, de QA, despliegue y legacy se organiza desde [el indice general de documentacion](../README.md).

## Regla permanente para agentes de desarrollo

- Utilizar siempre la arquitectura existente y los flujos oficiales antes de crear alternativas.
- Modificar unicamente el alcance solicitado.
- Reutilizar servicios, rutas y helpers existentes antes de agregar piezas nuevas.
- Evitar auditorias generales innecesarias.
- Evitar validaciones globales cuando la tarea sea localizada.
- Mantener cambios pequenos, precisos y documentados.
- No realizar refactorizaciones no solicitadas.
- No modificar modulos ajenos a la tarea.
- No introducir codigo demo o QA en produccion.
- Optimizar tiempo, recursos y tokens sin sacrificar seguridad ni calidad.
