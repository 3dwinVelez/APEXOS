# Evidencia local: reportes de Talento Humano

## Diagnostico

- Los campos Desde/Hasta no participaban en las consultas ni en el filtrado visible.
- `GET /hr/attendance` en el fallback Supabase recuperaba unicamente el dia actual.
- Las actividades se asociaban por identidad o ruta sin exigir la misma fecha de la jornada.
- La salida era CSV y no aplicaba la autorizacion fina `hr:export`.

## Resultado local

- Candidato reconstruido sobre `origin/desarrollo@c952033`: `3147dba`, sin conflictos ni archivos fuera del alcance.
- Pruebas API y contratos protegidos de Talento Humano: 18/18 aprobadas.
- Pruebas web de Talento Humano, XLSX, filtros, RBAC y monitor: 21/21 aprobadas.
- Contrato del certificado QA versionado: 2/2 aprobadas.
- TypeScript: aprobado.
- ESLint oficial del workspace: aprobado.
- Build productivo reproducible con Next.js 16.3.2: aprobado; 75 paginas generadas, incluida `/dashboard/talento-humano/reportes`.
- `npm audit --omit=dev --audit-level=high`: aprobado sin vulnerabilidades altas; permanecen 2 avisos moderados transitivos de `uuid` heredados por ExcelJS, cuya correccion propuesta degrada ExcelJS a una version incompatible.
- Libro XLSX abierto nuevamente con ExcelJS: firma OOXML valida, tabla filtrable, formato numerico y panel congelado verificados.
- Interfaz local: la ruta cargo y el control de acceso nego correctamente una sesion sin autenticar.

## Seguridad y alcance

- Las consultas conservan el contexto de tenant existente.
- Los rangos quedan limitados a 92 dias en API y UI.
- La descarga requiere `hr:export` en el cliente y no contiene formulas generadas desde valores de usuario.
- No se agregaron migraciones, secretos, dependencias ni cambios de infraestructura.
- No se autoriza ninguna eliminacion.

## Bloqueo de certificacion remota

La certificacion navegador QA no se ejecuto: `config/qa.env` no existe y la sesion local disponible no esta autenticada. El script `scripts/certifications/hr-reports-export-qa.js` queda versionado para validar commit desplegado, rol autorizado, rol sin exportacion, aislamiento de otro tenant y estructura del XLSX.

Conforme a `AGENTS.md`, esta evidencia local no sustituye la certificacion funcional QA ni autoriza push o promocion a `develop`.
