# Validación local — errores guiados de Transporte

- Fecha: 2026-09-15
- Rama: `desarrollo`
- Ambiente: local
- Caso reproducido: evaluar una consolidación con un origen diferente al de sus pedidos.
- Resultado: aprobado.

## Comportamiento visible

La respuesta operativa `409 TMS_INCOMPATIBLE_ORIGIN` abre una ventana accesible con:

1. Título comprensible: “Los pedidos deben salir del mismo origen”.
2. Explicación de la inconsistencia.
3. Tres acciones concretas para corregirla.
4. Detalle técnico colapsado para soporte.
5. Acción principal “Entendido, voy a corregirlo”.

La segunda ejecución en navegador confirmó que no aparece simultáneamente la alerta técnica global. Los fallos de infraestructura y servidor mantienen su tratamiento técnico habitual.

## Regresión

- Pruebas de interfaz de Transporte: 17/17.
- TypeScript: aprobado.
- ESLint: 0 errores; 9 advertencias preexistentes fuera del cambio.
