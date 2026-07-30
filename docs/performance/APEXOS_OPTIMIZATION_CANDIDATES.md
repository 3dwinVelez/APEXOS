# Candidatos de optimización

| Prioridad | Hipótesis | Evidencia | Piloto propuesto | Umbral | Riesgo |
|---|---|---|---|---|---|
| P0 | La cascada de permisos retrasa contenido útil | hasta 5 llamadas, 3/4 olas; guard envuelve página | instrumentar y paralelizar las dos actualizaciones de contexto si son independientes | eliminar una ola o ≥10% TTI | Alto |
| P0 | El shell autenticado hidrata más de lo necesario | 6 islas globales; 77 límites cliente | diferir `AiExperienceLayer` hasta interacción/idle y medir todas las rutas | ≥10% First Load o trabajo principal | Medio |
| P1 | Acceso se consume dos veces | Sidebar + guard, promesa compartida | almacén/snapshot único por identidad y empresa | ≥15% menos renders; cero request extra | Alto |
| P1 | Datos de servicio dominan red | órdenes 309 ms avg; evidencia 200 ms avg | instrumentar endpoint/SQL y reducir cascada/payload según campos usados | ≥10% contenido útil | Medio |
| P2 | Gráficos inflan Dashboard | 262 kB y Recharts en dos rutas | cargar gráficos después del resumen visible | ≥10% First Load Dashboard | Bajo |
| P3 | dependencias instaladas sin consumidor | React Query/RHF/Zod sin imports encontrados | confirmar lock/workspaces y retirar solo si no hay consumidores | instalación menor, no KPI runtime | Bajo |

## Pilotos ejecutados

Ninguno conservado. Sin una sesión QA reproducible no se puede medir contenido útil, renders ni revocación de permisos con seguridad. Hacer un cambio en acceso o caché sin esas pruebas violaría el requisito de evidencia y el límite funcional.

## Secuencia recomendada

1. Añadir marcas de rendimiento a documento, acceso, datos y primer contenido; no cambiar comportamiento.
2. Ejecutar matriz autenticada desktop/móvil con caché fría/caliente y CPU/red limitadas.
3. Pilotar solo una causa: primero eliminar una ola de permisos; revertir si no supera umbral.
4. Pilotar diferimiento de IA; medir First Load y tiempo de hilo principal.
5. Instrumentar Supabase/API hasta consulta SQL antes de recomendar índices o payloads.
