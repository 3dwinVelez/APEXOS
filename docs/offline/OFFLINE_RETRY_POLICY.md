# Politica local de reintentos

No se ejecuta red en Fase 4.

| Categoria | Politica |
|---|---|
| `NETWORK`, `TIMEOUT`, `SERVER_TEMPORARY` | `RETRYABLE` con backoff |
| `AUTHENTICATION` | requiere reautenticacion futura |
| `AUTHORIZATION`, `VALIDATION` | `BLOCKED` |
| `CONFLICT` | `CONFLICT` modelado |
| `LOCAL_STORAGE`, `UNKNOWN` | degradacion segura |

El backoff parte de 5 segundos, duplica por intento y se limita a una hora. Al
alcanzar 8 intentos la operacion queda `BLOCKED`. Una operacion interrumpida en
`PROCESSING` por mas de 5 minutos vuelve a `RETRYABLE` al abrir la cola, nunca a
`CONFIRMED`.

Los logs y metadata guardan codigos y categorias, no payloads.
