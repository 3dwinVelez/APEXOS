# APEXOS_CONTEXT.md

## Propósito general de APEXOS

APEXOS es una plataforma modular de gestión empresarial orientada a empresas pequeñas, medianas y en crecimiento. Su objetivo es simplificar procesos operativos, administrativos y estratégicos mediante módulos claros, ágiles y fáciles de usar.

El sistema debe evitar complejidad innecesaria. Cada cambio debe aportar valor real al usuario final.

---

## Regla principal para Codex

Antes de modificar cualquier archivo, Codex debe:

1. Leer este documento.
2. Consultar la documentacion canonica en `docs/project`.
3. Identificar el módulo afectado.
4. Leer el archivo de contexto del modulo correspondiente en `docs/project/modulos`.
5. Revisar el estado actual del código antes de proponer cambios.
6. Evitar modificar archivos fuera del alcance de la tarea.
7. Registrar en `docs/project` los cambios funcionales o de experiencia relevantes.

---

## Reglas de oro del proyecto

- No modificar módulos no relacionados con la tarea.
- No rediseñar arquitectura sin instrucción explícita.
- No crear funciones duplicadas si ya existe una utilidad o componente similar.
- No sobreingenierizar soluciones.
- Priorizar claridad, mantenibilidad y escalabilidad.
- Mantener nombres claros y consistentes.
- Todo cambio debe poder explicarse de forma simple.
- Si una tarea afecta datos, permisos o flujos críticos, debe validarse cuidadosamente.

---

## Filosofía de producto e interfaz

APEXOS debe sentirse como un producto profesional, simple, intuitivo y amable para usuarios operativos y administrativos. La funcionalidad no debe concentrarse de forma desordenada en una sola pantalla.

La guia viva de esta filosofia esta en `docs/project/filosofia-producto-ui.md`.

Todo ajuste de interfaz desde este punto debe seguir estos principios:

- Una pantalla debe tener un propósito principal claro.
- Las acciones secundarias deben ir en botones visibles, menús de acción o ventanas emergentes.
- No mezclar creación, edición, consulta, configuración y monitoreo en el mismo bloque visual si eso genera ruido.
- Los módulos deben abrir con un panel de control limpio: indicadores relevantes, acciones principales y accesos a subflujos.
- Los formularios largos o auxiliares deben vivir en modales, paneles laterales o pantallas dedicadas.
- Las opciones disponibles deben ser evidentes para el usuario sin leer instrucciones extensas.
- La experiencia móvil debe priorizar botones táctiles, lectura rápida y acciones de una mano.
- El diseño debe ser ágil, atractivo, sobrio y profesional; evitar pantallas saturadas, textos innecesarios y controles compitiendo por atención.
- No sacrificar funcionalidad ni rendimiento por decoración visual.
- Mantener consistencia entre módulos: encabezados claros, KPIs compactos, acciones primarias destacadas, acciones secundarias agrupadas y listados fáciles de escanear.

---

## Módulos prioritarios actuales

### 1. Talento Humano

Prioridad alta.

Debe garantizar:
- Gestión correcta de empleados.
- Control de información laboral.
- Estados activos/inactivos.
- Validaciones de datos.
- Flujo claro para crear, editar, consultar y administrar empleados.
- Conexión coherente con otros módulos si aplica.

### 2. Servicios

Prioridad alta.

Debe garantizar:
- Registro correcto de servicios.
- Estados del servicio.
- Relación con clientes, usuarios, empleados o recursos si aplica.
- Flujo simple y entendible.
- Validaciones funcionales.
- Correcta visualización y edición de información.

---

## Criterios para aceptar cambios

Un cambio se considera correcto si:

- Compila sin errores.
- No rompe módulos existentes.
- Respeta la estructura actual.
- Mejora o corrige una funcionalidad específica.
- Tiene nombres claros.
- No agrega complejidad innecesaria.
- Está documentado en el contexto del módulo si es relevante.

---

## Forma de trabajo recomendada

Para cada tarea:

1. Entender el requerimiento.
2. Revisar contexto general.
3. Revisar contexto del módulo.
4. Identificar archivos afectados.
5. Hacer cambios mínimos y precisos.
6. Probar funcionamiento.
7. Actualizar el contexto del módulo.
8. Hacer commit con mensaje claro.

---

## Prohibiciones para Codex

Codex no debe:

- Reescribir todo el proyecto.
- Cambiar nombres de carpetas principales sin autorización.
- Cambiar estructura de base de datos sin documentarlo.
- Eliminar código funcional sin justificarlo.
- Crear módulos paralelos con la misma responsabilidad.
- Asumir reglas de negocio no confirmadas.
- Modificar autenticación, permisos o configuración global sin instrucción explícita.

---

## Estado actual del enfoque

La prioridad actual es estabilizar y validar los módulos de:

- Talento Humano
- Servicios

Todo trabajo nuevo debe proteger estos módulos y evitar cambios innecesarios en otras áreas.
