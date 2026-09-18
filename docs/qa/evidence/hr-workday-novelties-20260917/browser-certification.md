# Browser Certification

- URL: `http://127.0.0.1:3001/dashboard/talento-humano/configuracion-laboral`
- Result: HTTP 200 from the local Next.js server.
- Covered view: Configuracion laboral for night-hour parameters, overtime limits and surcharge concepts.

Authenticated API calls are guarded by the existing token middleware; unauthenticated direct API smoke returned `TOKEN_INVALIDO`, which is expected.
