# APEXOS Design Standards

Version: 2.0

Estado: Normativa QA

## Objetivo

Este documento define las reglas obligatorias para construir y revisar cualquier interfaz de APEXOS.

Pregunta de aprobacion:

> Esta decision hace que el usuario complete su trabajo mas rapido, con menos esfuerzo y con mayor claridad?

Si la respuesta es no, la decision no debe entrar al producto.

## Regla De Cambio

Todo cambio visual debe:

- Mantener funcionalidad existente.
- No modificar permisos, roles ni contratos.
- Ser reversible.
- Entrar por QA.
- Compilar sin errores.
- Tener validacion visual y funcional.

## Prohibiciones

No usar en pantallas operativas:

- Glassmorphism.
- Blur y backdrop filter.
- Sombras exageradas.
- Gradientes innecesarios.
- Fondos decorativos.
- Transparencias esteticas.
- Animaciones largas.
- Microanimaciones permanentes.
- Widgets decorativos.
- Cards sin funcion operacional.
- Iconografia redundante.
- Espaciados fuera de escala.
- Colores fuera de la paleta oficial.

## Estructura De Pantalla

Cada pantalla debe responder:

- Que requiere atencion?
- Que accion debe ejecutar el usuario?
- Que informacion bloquea o habilita el trabajo?
- Que puede omitirse sin afectar productividad?

Orden recomendado:

1. Encabezado compacto con titulo, contexto y accion principal.
2. Filtros o busqueda si son necesarios.
3. Superficie principal de trabajo.
4. Estados y acciones secundarias.
5. Informacion auxiliar solo si reduce errores.

## Dashboard

El dashboard no es un panel decorativo.

Debe mostrar:

- Trabajo pendiente.
- Riesgos operativos.
- Tareas atrasadas.
- Bloqueos.
- Alertas accionables.
- Indicadores que generen decision.

Eliminar graficas, contadores o widgets que no conduzcan a una accion.

## Cards

Usar cards solo para:

- Elementos repetidos.
- Resumenes accionables.
- Estados vacios.
- Modales o herramientas enmarcadas.

No usar cards para envolver secciones completas sin necesidad. No anidar cards.

## Iconos

- Usar `lucide-react`.
- Usar icono + texto en acciones importantes.
- Usar solo icono cuando el significado sea comun o tenga `aria-label`.
- Evitar iconos redundantes junto a labels autoexplicativos.

## Copy

El texto debe ser corto, directo y operacional.

Preferir:

- "Crear usuario"
- "Guardar cambios"
- "Completar servicio"
- "Filtrar por estado"

Evitar:

- Textos promocionales.
- Explicaciones largas en pantalla.
- Titulos decorativos.
- Mensajes que describan la interfaz.

## Accesibilidad

Minimo obligatorio:

- Labels asociados a campos.
- `aria-label` en botones de icono.
- Foco visible.
- Contraste suficiente en claro y oscuro.
- Estados disabled distinguibles.
- No depender solo del color para estados criticos.
- Respetar `prefers-reduced-motion` en animaciones futuras.

## Revision De Pull Request

Antes de aprobar un cambio UI:

- Verificar que usa componentes del Design System.
- Confirmar que no hay colores arbitrarios.
- Confirmar que no hay gradientes/blur/sombras decorativas.
- Confirmar que mobile no hereda tablas complejas de desktop.
- Confirmar que hay estado de carga, vacio y error.
- Ejecutar validaciones obligatorias.
- Adjuntar evidencia visual de desktop y mobile si la pantalla cambio.

## Excepciones

Toda excepcion debe documentar:

- Pantalla o componente.
- Regla exceptuada.
- Motivo operacional.
- Riesgo.
- Fecha de revision.
- Responsable.

Las excepciones esteticas no son validas.

