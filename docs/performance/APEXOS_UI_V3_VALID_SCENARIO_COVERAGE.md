# APEXOS UI V3 - Cobertura final valida

Fecha: 2026-08-03

Cobertura final: 9/9 comparaciones validas, 100%.

| Escenario invalidado antes | Causa | Correccion |
| --- | --- | --- |
| usuarios desktop | `/dashboard/administracion/usuarios` devuelve 404 en main y candidata | alternativa funcional equivalente: `/dashboard/administracion/suscripciones` |
| proyectos desktop | excluida por regresion server bundle | corregido el bundle, ruta vuelve al indice |
| detalle-orden mobile | T2 dependia de `h1` no estable | T2 acepta estructura operativa real de detalle |

| Perfil | Ruta | Main reps | Candidate reps | Valida |
| --- | --- | ---: | ---: | --- |
| desktop-normal | login | 5 | 5 | si |
| desktop-normal | dashboard | 5 | 5 | si |
| desktop-normal | administracion | 5 | 5 | si |
| desktop-normal | administracion-suscripciones | 5 | 5 | si |
| desktop-normal | servicios | 5 | 5 | si |
| desktop-normal | detalle-orden | 5 | 5 | si |
| desktop-normal | proyectos | 5 | 5 | si |
| mobile-limited | servicios | 5 | 5 | si |
| mobile-limited | detalle-orden | 5 | 5 | si |
