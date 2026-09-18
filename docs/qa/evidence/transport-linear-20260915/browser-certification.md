# Certificación visible de Transporte — ambiente local

- Fecha: 2026-09-15
- Ambiente: `LOCAL_DESARROLLO`
- URL: `http://localhost:3001/dashboard/transporte`
- Sesión: empresa Demo APEX, rol APEX_ADMIN
- Resultado: aprobado para validación de desarrollo local

## Recorrido observado

1. La portada explica en lenguaje cotidiano que Transporte lleva los pedidos desde la preparación hasta la entrega y el control del costo.
2. El trabajo está agrupado en tres momentos visibles: preparar pedidos; ejecutar y entregar; preparar la operación.
3. La pantalla de órdenes diferencia la conexión automática con módulos activos de la carga externa por Excel.
4. La carga externa presenta tres pasos: descargar plantilla, diligenciar una fila por pedido y seleccionar/validar el archivo.
5. El instructivo desplegable enumera campos obligatorios y opcionales, y explica que las columnas propias se conservan como datos personalizados.
6. La tabla reabierta mostró la orden `QA-XLS-20260915192346` con 850 kg, 5.5 m³ y estado pendiente.

## Criterio de 20 segundos

La primera pantalla permite identificar qué hace el módulo, dónde comenzar y cuál es el orden del trabajo sin conocimiento previo de transporte. La pantalla de órdenes permite distinguir en una primera lectura si los pedidos llegan desde APEX OS o desde Excel.

## Observaciones no bloqueantes

- La base local conserva transacciones históricas de certificaciones anteriores; conviene ofrecer un filtro inicial por fecha o estado en ambientes con alto volumen.
- El texto de la fuente conectada presenta un espacio visual duplicado antes de “envía”; no afecta comprensión ni operación.
