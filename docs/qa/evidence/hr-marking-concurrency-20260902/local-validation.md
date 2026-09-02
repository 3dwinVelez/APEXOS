# Validacion local

Runtime: Node.js `22.23.2` aislado y compatible con `engines.node=22.x`.

- `doctor:node`: aprobado.
- `prisma:validate`: aprobado.
- `lint`: aprobado con 0 errores y 6 advertencias historicas de navegacion Next.js fuera del alcance.
- `apps/web typecheck`: aprobado.
- `apps/web build`: aprobado; 84/84 paginas generadas.
- Validacion focal posterior a correcciones: 15 pruebas aprobadas, 0 fallidas.
- Regresion HR ampliada inicial: 44 aprobadas y 1 fallida por un delimitador CRLF incorrecto del test estatico `hr-operations-map-contract`; se corrigio el alcance de extraccion sin retirar la asercion.
- Regresion HR ampliada definitiva: 45 aprobadas, 0 fallidas.
- La precertificacion masiva rechazo dos ejecuciones de concurrencia con `Serializable`: PostgreSQL registro `could not serialize access due to read/write dependencies among transactions`. El candidato se corrigio para usar el aislamiento transaccional por defecto más el bloqueo asesor granular; la evidencia fallida permanece versionada.

El script documental `npm run agent:test -- --profile safe` no existe en el `package.json` vigente. Se ejecutaron manualmente todos los gates que `docs/agents/quality-gates.md` declara para ese perfil; esta inconsistencia documental no se registra como gate aprobado ni se corrige dentro del alcance funcional.
