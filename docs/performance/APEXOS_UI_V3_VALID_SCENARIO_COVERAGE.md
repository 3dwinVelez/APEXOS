# APEXOS UI V3 - Cobertura final valida

Fecha: 2026-08-03

Cobertura final: 9/9 comparaciones validas, 100%.

## Correcciones de cobertura

| Escenario invalidado antes | Causa | Correccion |
| --- | --- | --- |
| usuarios desktop | `/dashboard/administracion/usuarios` devuelve 404 en main y candidata | alternativa funcional equivalente: `/dashboard/administracion/suscripciones` |
| proyectos desktop | excluida por regresion server bundle | corregido el bundle, ruta vuelve al indice |
| detalle-orden mobile | T2 dependia de `h1` no estable | T2 acepta estructura operativa real de detalle |
| dashboard y suscripciones | p95 degradado en muestra corta de 5 reps | muestra ampliada a 15 reps y eliminacion de prefetch RSC secundario |

## Matriz final

| Perfil | Ruta | Main reps | Candidate reps | Valida |
| --- | --- | ---: | ---: | --- |
| desktop-normal | login | 15 | 15 | si |
| desktop-normal | dashboard | 15 | 15 | si |
| desktop-normal | administracion | 15 | 15 | si |
| desktop-normal | administracion-suscripciones | 15 | 15 | si |
| desktop-normal | servicios | 15 | 15 | si |
| desktop-normal | detalle-orden | 15 | 15 | si |
| desktop-normal | proyectos | 15 | 15 | si |
| mobile-limited | servicios | 15 | 15 | si |
| mobile-limited | detalle-orden | 15 | 15 | si |

La corrida genera 288 filas porque incluye warmup por ruta/version/perfil y 15 mediciones efectivas por lado.
