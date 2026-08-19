# Niveles de autonomía

## Principio

La autonomía define hasta dónde puede actuar un agente, no qué reglas puede ignorar. Producción, merge y ampliación de permisos quedan fuera de todos los niveles.

| Nivel | Alcance permitido | Aprobación requerida |
| --- | --- | --- |
| A0 — Observación | Leer código, documentación, Git y resultados existentes. | Ninguna para lectura dentro del repositorio. |
| A1 — Propuesta | Elaborar análisis, plan, criterios y diff propuesto sin modificar. | Aprobación antes de implementar cuando el usuario la solicite o el alcance sea sensible. |
| A2 — Implementación local | Editar archivos en una rama no protegida dentro del alcance aprobado. | Requerimiento y alcance confirmados. |
| A3 — Validación segura | Ejecutar lint, typecheck, build y pruebas sin credenciales ni datos compartidos. | Ninguna adicional si no hay efectos externos. |
| A4 — Validación local con datos | Ejecutar suites que escriben únicamente en infraestructura local y desechable verificada. | Confirmación del destino local y posibilidad de descarte. |
| A5 — Propuesta de PR | Preparar cambios, informe y texto de pull request. | Revisión humana antes de publicar o enviar. |

## Acciones siempre humanas

- Aprobar o hacer merge en el chat de codex se podra dar la autorizacion
- Desplegar o promover ambientes.
- Acceder o escribir en producción.
- Rotar o proporcionar credenciales.
- Aprobar cambios contables, tributarios, de inventario o costo.
- Autorizar migraciones con pérdida o transformación irreversible.
- Cambiar permisos de agentes, GitHub, Supabase, RBAC o RLS.

## Automejora

`erp-self-improvement` opera como máximo en A2 para preparar cambios locales y A5 para proponerlos. Debe:

1. Citar evidencia repetible.
2. Mantener o reducir permisos.
3. Incluir prueba o validación de la mejora.
4. Someter el cambio a revisión independiente.
5. No modificar esta tabla para habilitar su propia propuesta.
