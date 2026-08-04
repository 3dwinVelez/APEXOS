# APEXOS UI v3 Route Comparison

Base `develop`: `26b1331`

Rama local: `codex/operational-ui-v3-local`

| Ruta | Develop Route Size | Rama Route Size | Delta | Develop First Load JS | Rama First Load JS | Delta |
| ---- | -----------------: | --------------: | ----: | --------------------: | -----------------: | ----: |
| `/dashboard` | 11.6 kB | 7.13 kB | -4.47 kB | 264 kB | 158 kB | -106 kB |
| `/dashboard/administracion` | 23.1 kB | 22.9 kB | -0.2 kB | 181 kB | 181 kB | 0 kB |
| `/dashboard/servicios` | 16.8 kB | 16.4 kB | -0.4 kB | 157 kB | 156 kB | -1 kB |
| `/dashboard/servicios/[id]` | 14.9 kB | 14.9 kB | 0 kB | 165 kB | 165 kB | 0 kB |
| Shared First Load JS | 103 kB | 103 kB | 0 kB | 103 kB | 103 kB | 0 kB |

No se agregaron dependencias visuales. Las metricas DOM, requests y renders requieren navegador autenticado local y quedan pendientes.
