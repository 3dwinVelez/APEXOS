# Consolidacion de maestros en Administracion APEXOS

Desarrollo local, rama `desarrollo`, 2026-10-19. No se modifican datos existentes, contratos del backend, permisos, migraciones ni ambientes remotos.

Se retira el panel independiente Maestros de transporte. Sus dos rutas antiguas redirigen a Administracion. El catalogo administrativo registra por separado Destinos / tiendas, Tipos de liquidacion y Transportadoras en Operacion logistica, todos mediante el modal Maestros de plataforma y el selector central de catalogos. El editor usa los maestros persistidos existentes, con listado, busqueda, creacion y edicion. Liquidacion enlaza directamente al catalogo central de destinos.

Se retira del panel la creacion paralela de conductores. La flota conserva su asociacion preexistente con empleados. No se eliminan registros TransportDriver ni se cambian referencias de viajes historicos o contratos de integraciones antiguas; esta correccion consolida la administracion y retira la superficie duplicada, sin una migracion destructiva de esos datos.

## Validacion

- `node --test apps/web/test/transport-tms-ui.test.mjs apps/web/test/transport-settlement-tower.test.mjs apps/web/test/transport-settlement-tariff-interactions.test.mjs`: 40 pruebas aprobadas, incluyendo catalogos centrales, ausencia de alta de conductores, redirecciones y soporte de tipos de liquidacion.
- Certificacion real de navegador versionada: `scripts/certifications/transport-central-masters-browser.mjs`. Cinco controles aprobados: modal central, ausencia de formulario paralelo de conductores, creacion de destino, edicion y persistencia tras recarga. Resultado `<TEMP>/apexos-central-masters-browser-20261019.json`. Registro sintetico conservado: `QA-CENTRAL-1792429828912`.
- Redireccion real de `/dashboard/administracion/maestros-transporte` a `/dashboard/administracion` comprobada en navegador. El catalogo muestra las entradas Destinos / tiendas y Tipos de liquidacion.
- Captura revisada: `<TEMP>/apexos-central-masters-20261019.png`. Se cerro exclusivamente la pestaña temporal de prueba.
- TypeScript, ESLint de Administracion, editor de catalogos y editor de liquidacion, y `git diff --check`.

Sin commit, push o promocion. La evidencia local no autoriza publicacion en develop/main.
