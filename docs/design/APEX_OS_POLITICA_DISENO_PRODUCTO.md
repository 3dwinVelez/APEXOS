# APEX OS · Política de diseño de producto

Versión: 1.0  
Estado: Normativa de continuidad para nuevos desarrollos  
Fecha: 2026-09-10  
Aplica a: frontend web de APEX OS

## Propósito

Esta política asegura que los próximos desarrollos de APEX OS mantengan la misma lógica de interfaz que se consolidó en las mejoras recientes del producto: experiencia operativa, navegación por dominios, tablas ERP consistentes, asistencia AI no intrusiva, temas claro/oscuro y foco en productividad.

La pregunta obligatoria para aprobar una pantalla es:

> ¿Esta interfaz ayuda al usuario operativo a terminar una tarea real más rápido, con menos duda y sin perder contexto?

Si la respuesta es no, la pantalla debe simplificarse antes de pasar a QA.

## Principios rectores

1. APEX OS es un ERP operativo, no un dashboard decorativo.
2. La interfaz debe priorizar trabajo pendiente, acciones frecuentes, alertas accionables y navegación rápida.
3. Todo módulo debe sentirse parte del mismo sistema, aunque tenga procesos distintos.
4. La inteligencia de APEX AI debe acompañar sin tapar, distraer ni reemplazar la operación principal.
5. El diseño debe funcionar en tema claro y oscuro con contraste suficiente.
6. Ningún elemento visual debe bloquear botones, formularios, tablas, menús o acciones flotantes.
7. La estética moderna se acepta solo si mejora claridad, confianza o velocidad de uso.

## Inicio operativo

La pantalla de inicio debe estar pensada para un usuario que entra a trabajar, no para revisar métricas genéricas.

Debe incluir:

- Acciones frecuentes según permisos y rol.
- Módulos disponibles ordenados por relevancia operativa.
- Actividad reciente basada en navegación o hechos reales, no datos inventados.
- Estados claros de carga, error y vacío.
- Acceso rápido a búsqueda global o centro de comandos.

Debe evitar:

- Gráficas decorativas sin decisión asociada.
- Contadores en cero que no guían acción.
- Mensajes orientados a una sola industria cuando el ERP debe servir a múltiples tipos de empresa.
- Bloques grandes que empujen la operación principal hacia abajo.

## Navegación lateral

La navegación debe agrupar módulos por dominios funcionales:

- Operación
- Comercial
- Finanzas
- Personas y gestión
- Control y plataforma
- Otros

Reglas:

- Las categorías deben iniciar colapsadas en modo expandido para reducir ruido.
- Los textos de categorías deben tener contraste suficiente en tema claro y oscuro.
- La búsqueda debe cubrir módulos, nombres funcionales y capacidades.
- El estado colapsado debe conservar navegación accesible con iconos y tooltips.
- No se deben mostrar módulos sin permiso efectivo.
- El orden debe favorecer las tareas más usadas, no la estructura técnica interna.

## Barra superior y herramientas globales

La barra superior debe quedarse liviana.

Elementos principales permitidos:

- Estado de conexión.
- Selector de idioma.
- Centro de comandos.
- Notificaciones.
- Herramientas secundarias agrupadas.

Las herramientas secundarias como trazabilidad, equipo, preferencias, productividad o controles avanzados deben ir agrupadas bajo un menú compacto cuando no son la tarea principal.

No se permite llenar la barra superior con botones que compitan con la acción del módulo.

## APEX AI y asistencia contextual

APEX AI debe comportarse como asistencia discreta.

Reglas obligatorias:

- No mostrar banners globales grandes en todos los módulos.
- Usar un launcher pequeño tipo mascota o asistente flotante.
- Abrir recomendaciones con doble click o interacción explícita equivalente.
- No superponerse a botones de guardar, crear, editar, filtros, paginación, ayuda crítica ni acciones flotantes del módulo.
- El contenedor flotante debe usar `pointer-events` de forma segura: solo el launcher y el panel abierto deben capturar interacción.
- Debe poder cerrarse fácilmente.
- Debe respetar teclado, foco visible y etiquetas accesibles.

APEX AI puede mostrar:

- Alertas accionables.
- Recomendaciones del módulo actual.
- Atajos de productividad.
- Lectura contextual cuando el usuario la solicita.

APEX AI no debe:

- Tapar contenido.
- Abrirse automáticamente en cada pantalla.
- Presentarse como publicidad interna.
- Repetir información ya visible en la página.

## Tablas ERP

Las tablas son la superficie principal del ERP.

Toda tabla operativa nueva o migrada debe usar la estructura estándar:

- Contador de registros.
- Selección visible cuando aplique.
- Control de columnas cuando aplique.
- Encabezado claro y consistente.
- Acciones de fila ubicadas al final.
- Estados de carga, vacío y error.
- Persistencia de preferencias de columnas cuando el usuario las configure.
- Scroll y ancho mínimo controlados para evitar saltos visuales.

No se deben crear estilos de tabla por módulo si la tabla puede usar el estándar común.

Excepciones permitidas:

- Formularios.
- Detalles individuales.
- Diálogos.
- Tablas inteligentes con reglas propias ya justificadas.
- Componentes altamente especializados como planeadores visuales o matrices operativas.

## Formularios y campos de texto

Todo campo editable debe mantener foco estable mientras el usuario escribe.

Reglas:

- No remountar inputs por cada tecla.
- No cambiar `key` dinámicamente con el valor del campo.
- No mover el campo activo durante validación.
- Validar sin sacar al usuario del recuadro de texto.
- Mostrar errores cerca del campo.
- Usar mensajes claros y recuperables.
- Mantener labels visibles.

En tema claro, los mensajes de error deben tener contraste suficiente. No usar texto rosado claro sobre fondo rojo claro.

## Login y entrada pública

El login y la portada pública deben compartir lenguaje visual:

- Moderno, confiable y empresarial.
- Compatible con tema claro y oscuro.
- Animaciones suaves que respeten `prefers-reduced-motion`.
- Copy orientado a operación integral, no a una sola industria.
- Mensajes de error legibles y accionables.
- Acceso seguro sin saturar la pantalla.

La portada pública debe guiar a:

- Entrar.
- Crear empresa cuando aplique.
- Configuración inicial cuando aplique.

## Tema claro y oscuro

Todo componente nuevo debe revisarse en ambos temas.

Reglas:

- No fijar colores que funcionen solo en dark mode.
- No usar texto demasiado claro en modo claro.
- No depender únicamente de opacidad para jerarquía.
- Los estados `disabled`, `muted`, `placeholder` y categorías colapsadas deben seguir siendo legibles.
- Los mensajes de error, advertencia, éxito e información deben tener contraste propio por tema.

## Productividad operativa

Cada módulo debe facilitar acciones repetitivas.

Patrones recomendados:

- Copiar valores frecuentes.
- Autocompletar donde reduzca errores.
- Deshacer cuando una acción sea reversible.
- Formatos regionales para fechas, moneda, cantidades y números.
- Atajos desde el centro de comandos.
- Búsqueda cercana a la tabla o superficie principal.

La productividad no debe depender de entrenamiento previo del usuario.

## Responsive y móvil

La experiencia móvil debe adaptar la tarea, no solo encoger desktop.

Reglas:

- Acciones principales con altura táctil suficiente.
- Tablas largas deben convertirse en listas, cards operativas o vistas simplificadas cuando sea necesario.
- Mantener navegación y acciones sin solapamientos.
- Evitar paneles flotantes que cubran formularios.
- Probar al menos una resolución móvil representativa cuando cambie una pantalla operativa.

## Accesibilidad mínima obligatoria

Todo desarrollo debe cumplir:

- Foco visible.
- Navegación por teclado en controles principales.
- `aria-label` en botones solo-icono.
- Labels asociados a inputs.
- Contraste AA razonable en claro y oscuro.
- Respeto por `prefers-reduced-motion`.
- Estados no comunicados únicamente por color.

## Reglas de implementación

Antes de crear una solución local por pantalla, revisar si ya existe un patrón común:

- `DashboardChrome`
- `Sidebar`
- `CommandPalette`
- `AiExperienceLayer`
- `StandardTableExperience`
- componentes base de UI
- tokens y clases globales en `globals.css`

No duplicar patrones. Si un módulo necesita una variante, debe documentar:

- Por qué el estándar no alcanza.
- Qué riesgo operacional resuelve.
- Cómo se comporta en tema claro, oscuro y móvil.

## Checklist obligatorio para nuevos desarrollos UI

Antes de cerrar una tarea de interfaz:

- [ ] La pantalla responde qué debe hacer el usuario ahora.
- [ ] La acción principal es visible y no compite con elementos secundarios.
- [ ] Los módulos y acciones respetan permisos.
- [ ] Las tablas usan la estructura estándar cuando aplica.
- [ ] Los inputs no pierden foco al escribir.
- [ ] No hay banners globales innecesarios.
- [ ] APEX AI no se superpone a funcionalidades.
- [ ] El tema claro tiene contraste suficiente.
- [ ] El tema oscuro no queda forzado cuando el usuario cambia tema.
- [ ] La pantalla tiene carga, vacío y error recuperable.
- [ ] La experiencia móvil no queda rota ni saturada.
- [ ] Hay pruebas o evidencia proporcional al riesgo del cambio.

## Validación recomendada

Para cambios de frontend, ejecutar al menos:

- Pruebas de contrato/UX del módulo modificado.
- `npm --workspace apps/web run typecheck`
- ESLint desde `apps/web` sobre archivos tocados.
- `npm --workspace apps/web run build` antes de promover.

Para promoción a QA, seguir siempre el flujo:

```text
desarrollo -> develop -> main
```

La promoción requiere manifiesto de alcance, evidencia pre-QA y autorización explícita según las reglas del repositorio.

## Relación con otras normas

Esta política complementa:

- `docs/design/APEXOS_OPERATIONAL_DESIGN_SYSTEM.md`
- `docs/design/APEXOS_DESIGN_STANDARDS.md`
- `docs/design/APEX_OS_TABLE_STANDARDIZATION_CHECKLIST.md`
- `docs/agents/quality-gates.md`

Si hay conflicto, prevalece la regla más estricta para proteger operación, accesibilidad, permisos y trazabilidad.
