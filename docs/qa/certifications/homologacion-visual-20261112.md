# Certificacion local de la capa visual homologada — 2026-11-12

Cambio: `homologacion-visual-20261112`
Promocion certificada: `desarrollo -> develop` (pre-QA). **No autoriza `main`**, ni promocion, ni despliegue.
Commit funcional certificado: `8ba301c0db7bd272fac6ab21a78384a290ba2409`
Rama candidata: `codex/qa-capa-visual-20261112` (worktree aislado en `%TEMP%\apexos-qa-capa-visual`)
Base del destino: `origin/develop` = `3595a9bbca239fbf0ff7e186aa765e22700f7420`
Ventana de ejecucion: 2026-11-12 (build de produccion + certificacion de navegador + regresion).
Resultado funcional: **PASSED** — 96/96 comprobaciones, 33 capturas, 0 errores de consola y 0 errores HTTP.
Resultado de regresion: **PASSED** — typecheck 0, lint 0, suite web 777/773 (4 fallos preexistentes, 0 nuevos).

## Alcance certificado

El candidato es una reconstruccion aislada de la intervencion visual sobre el `develop` vigente. Su diff
frente a `3595a9bb` es exacto: **100 rutas (79 A / 21 M / 0 D)**.

| Grupo | Rutas | Contenido |
|---|---|---|
| `apps/web/app/**` | 9 | Lobby, administracion y suscripciones, gestion comercial y agenda, productos nuevos, servicios, nueva orden de venta, `globals.css` |
| `apps/web/components/**` | 9 | Shell (chrome, guard, sidebar, cabecera de tecnico, badge de sesion), alertas de plataforma, `TransportSearchSelect`, `DataTable` y la primitiva nueva `ui/search-select.tsx` |
| `apps/web/lib/**` | 1 | `selectMatch.ts` (normalizacion y busqueda de opciones) |
| `apps/web/test/**` | 5 | Contrato nuevo de `SearchSelect` y ajustes a las pruebas de comercio, monitor de servicios, transporte y tema |
| `docs/design/**` | 1 | `AUDITORIA_VISUAL.md` |
| `docs/qa/evidence/visual-homologation-20261112/**` | 75 | Evidencia visual de la intervencion (antes/despues, claro/oscuro, 980 y movil) |

No viaja nada fuera de este alcance: no hay `apps/api/**`, `apps/api/prisma/**`, `apps/control-tower/**`,
bundle de modulos locales ni commits previos sin promover. `allowed_deletions` queda vacio porque el
candidato no elimina rutas.

## Que se homologo

1. **Primitiva `SearchSelect`** (`apps/web/components/ui/search-select.tsx`): el `<select>` nativo sigue
   oculto pero autoritativo (`name`, `required`, `FormData`, validacion); el campo visible es un
   `input role="combobox"` y la lista un `role="listbox"` en portal. `choose()` escribe el valor en el
   select y despacha un `change` con burbuja, de modo que los formularios y sus payloads no cambian.
   Sin coincidencias muestra `role="status"`; `onInvalid` reabre el combobox en lugar de romper el flujo.
2. **Migracion de los tres formularios nombrados**: nueva orden de venta (cliente y producto), agenda de
   gestion comercial (cuatro selectores del dialogo) y producto nuevo. Los selects visibles restantes del
   formulario son 0 en los tres casos.
3. **Estados de espera y textos del shell**: `RouteAccessGuard` conserva su contrato de acceso y su
   esqueleto de "Validando permisos"; se corrigieron textos visibles y se retiraron solo enlaces
   duplicados exactos.
4. **Tokens y tablas**: unificacion de superficies, bordes, halos y tipografia en el chrome y en las
   tablas, sin alterar datos ni eventos.

## Ambiente de ejecucion

- Build de produccion del candidato: `npm run build` (exit 0) y `next start -p 3002` sobre el worktree
  aislado con `node_modules` real (copia fisica; Turbopack rechaza junctions fuera del proyecto).
- API real local en `127.0.0.1:3000`. El cliente web llama `/api/v1/**` same-origin y el proxy del
  candidato la resuelve server-side; no se configuro CORS ni se toco la API.
- Inquilino de demostracion `demo@apex.local` (rol `APEX_ADMIN`, permisos `*:*`), el mismo que usa la
  certificacion de develop. Sesion iniciada por la interfaz real en cada corrida.
- Las **escrituras se interceptan** en el navegador y se registran con su payload; nunca llegan a la
  base. Las **lecturas viajan reales**, salvo maestros que el inquilino demo no tiene sembrados
  (clientes, asesores, zonas, motivos, resultados y ajustes comerciales), donde se sirve un fixture
  controlado. El catalogo de productos y la autenticacion son reales.
- Evidencia escrita en `docs/qa/evidence/homologacion-visual-candidate-20261112/`.

## Comprobaciones funcionales (96/96)

### Hubs del portafolio — 1440 y 980

Los 13 hubs se abren con sesion real, sin desbordamiento horizontal, sin pantalla rota y con el `h1`
esperado. En cada ancho se ejecutan 3 comprobaciones (acceso coherente, sin desbordamiento, sin pantalla
rota) y se toma captura.

| Hub | Ruta | 1440 | 980 |
|---|---|---|---|
| Lobby | `/dashboard` | allowed | allowed |
| Inventario | `/dashboard/inventario` | allowed | allowed |
| Compras | `/dashboard/compras` | allowed | allowed |
| Ventas | `/dashboard/ventas` | allowed | allowed |
| Gestion comercial | `/dashboard/gestion-comercial` | allowed | allowed |
| Comercio | `/dashboard/comercio` | allowed | allowed |
| Contabilidad | `/dashboard/contabilidad` | allowed | allowed |
| Transporte | `/dashboard/transporte` | allowed | allowed |
| Talento humano | `/dashboard/talento-humano` | allowed | allowed |
| Servicios | `/dashboard/servicios` | allowed | allowed |
| Reportes | `/dashboard/reportes` | allowed | allowed |
| Administracion | `/dashboard/administracion` | allowed | allowed |
| Gastos menores | `/dashboard/gastos-menores` | `documented_denied` | `documented_denied` |

**Denegacion documentada.** El inquilino demo no tiene licenciado el modulo `M-29`
(`tenant_active_modules`), por lo que `RouteAccessGuard` deniega Gastos menores. Se verifico el mismo
comportamiento en `desarrollo` contra la misma API: es el estado de licenciamiento del inquilino, no un
defecto del candidato ni una regresion. La pantalla denegada se valida por su contenido ("Acceso no
autorizado" + volver al tablero) y por ausencia de desbordamiento.

### Nueva orden de venta — 11 comprobaciones

- 0 selects nativos visibles dentro del formulario y 2 combobox (cliente y producto).
- La lista de clientes abre con `PRUEBA HOMOLOGACION` y escribe `987654` en el select nativo.
- La lista de productos abre con el catalogo real (`RAW-AZU-25 · Azucar saco 25kg`, item `3`).
- La orden se publica y el payload conserva el contrato exacto:

```json
{"customer_id":987654,"lines":[{"item_id":3,"qty":1,"unit_price":95000}]}
```

- Tema oscuro y ancho movil (390) sin desbordamiento.
- Sin maestros: solo ofrece el marcador vacio ("Seleccionar cliente") y **no** escribe la orden
  (el envio queda bloqueado por validacion nativa).

### Agenda de gestion comercial — 3 comprobaciones

- El dialogo abre; usa `SearchSelect` sin select nativo visible (4 combobox, 0 selects visibles).
- Lista los clientes controlados, incluida la opcion "Sin cliente / prospeccion".

### Producto nuevo — 2 comprobaciones

- Sin pantalla rota y sin desbordamiento en movil. La ruta resuelve a la lista de productos con su
  formulario en ventana.

### Consola y red

- 0 errores de consola y 0 respuestas HTTP fallidas en toda la corrida. `/favicon.ico` se responde 204
  porque develop no publica favicon; no cuenta como error.

## Regresion de plataforma (PASSED)

| Paso | Resultado |
|---|---|
| `tsc -p tsconfig.typecheck.json --noEmit` | exit 0 |
| `eslint .` | exit 0 |
| Suite web (`node --experimental-strip-types --test test/*.mjs`) | 777 pruebas, 773 pasan, 4 fallan |

Baseline medido en el `develop` de control (`3595a9bb`): 770 pruebas, 5 fallos. El candidato **no agrega
fallos nuevos**; los 4 que persisten son exactamente los ya medidos:

1. `el registro de funciones cubre todas las rutas del dashboard`
2. `apiInternal consulta el guard antes de intentar el respaldo en respuestas no OK`
3. `el respaldo preventivo tambien consulta el guard cuando no hay API configurada`
4. `la impresion aisla el tema claro y restaura el tema previo al salir sin persistir cambios`

El quinto fallo del baseline (`react` y `react-dom/server` de la misma instalacion) no aparece en el
candidato porque el worktree usa una copia fisica real de `node_modules` en lugar de una junction.
La comparacion exacta vive en `scripts/certifications/visual-homologation-known-failures.json` y el
veredicto en `visual-homologation-regression.json` (`status: passed`, `unexpected: 0`).

## Evidencia

Directorio `docs/qa/evidence/homologacion-visual-candidate-20261112/`:

- `candidate-certification.json` — 96 comprobaciones, escrituras interceptadas, errores de consola y HTTP.
- `visual-homologation-regression.json` — typecheck, lint, suite y comparacion contra baseline.
- 33 capturas: 13 hubs a 1440, 13 hubs a 980, nueva orden de venta (claro, oscuro y movil), agenda con
  el dialogo abierto y producto nuevo (1440 y movil).

## Limites de esta certificacion

- **No hay escrituras reales**: las altas se interceptan y se valida el payload, no la persistencia.
  La creacion real de ordenes y visitas queda para QA funcional.
- **Fixtures de maestros**: clientes, asesores, zonas, motivos, resultados y ajustes comerciales se
  sirven controlados porque el inquilino demo no los tiene sembrados. Los productos y la autenticacion
  son reales.
- **Accesibilidad**: se valida el contrato ARIA del combobox y la navegacion por teclado, pero no se
  ejecuta una auditoria automatizada (axe) ni lector de pantalla.
- **Datos del inquilino demo**: Gastos menores queda denegado por licenciamiento; debe verificarse en QA
  con un inquilino que tenga `M-29` activo.

## Reproduccion

```bash
# 1. Worktree candidato (node_modules real, no junction)
cd "$TEMP/apexos-qa-capa-visual" && npm run build
node node_modules/next/dist/bin/next start -p 3002

# 2. Certificacion de navegador contra el build del candidato
cd "C:/Users/mq1/Documents/Proyectos/APEXOS"
CERT_WEB_URL=http://127.0.0.1:3002 CERT_COMMIT=8ba301c0 CERT_EVIDENCE_LABEL=candidate \
  node scripts/certifications/visual-homologation-browser.cjs

# 3. Regresion de plataforma (typecheck + lint + suite con baseline)
CERT_REPO_DIR="$TEMP/apexos-qa-capa-visual" CERT_COMMIT=8ba301c0 \
  node scripts/certifications/visual-homologation-regression.cjs

# 4. Compuertas de promocion (sin promover)
npm run qa:promotion:scope -- docs/qa/manifests/homologacion-visual-20261112-scope.json \
  codex/qa-capa-visual-20261112 origin/develop
npm run qa:preqa:evidence -- docs/qa/manifests/homologacion-visual-20261112-preqa.json
```

La compuerta pre-QA exige `approval.status = approved` con responsable y fecha. Este manifiesto nace en
`pending`: solo el propietario autoriza mover la intervencion a `develop` (QA). Hasta entonces el
comando 4 queda bloqueado exactamente por esa linea y por ninguna otra.

## Estado de autorizacion

- Certificacion local: **completa y en verde**.
- Rama candidata: `codex/qa-capa-visual-20261112` en `8ba301c0`, sin push.
- `develop`, `main`, despliegues y migraciones remotas: **no ejecutados**.
- Siguiente paso: autorizacion explicita del propietario para la promocion pre-QA.
