# Brief — Curaduría del portafolio: 11 visibles y 21 retirados

- **ID**: `2026-11-12-curaduria-portafolio`
- **Fecha**: `2026-11-12`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "Aplica el corte de 17 visibles sin tocar los seeds del backend" · "Si hay que bajar a 17, retira también Facturación" · "vamos a ocultar totalmente también los módulos que te menciono … por ahora solo deseo que en apex sea visual lo que realmente está funcionando y operando" (sobre la captura con X en Contabilidad, Tesorería, Proyectos, APEX Control y APEX AI Core) · "cartera y cxc también debemos ocultarlo aún no tiene funcionalidad"

## 0. Naturaleza del cambio — curaduría de catálogo, no capa visual

- **Qué es**: la ficha de cada módulo se conserva, pero solo los desarrollados forman el
  **portafolio publicado** que ven lobby, barra lateral, buscador y URL directa. Los retirados no se
  borran: quedan en el catálogo con su ficha y sus assets por si se retoman.
- **Inventario esperado**: `apps/web/lib/modules.ts`, `apps/web/lib/moduleFunctions.ts`,
  `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/[module]/page.tsx`,
  `apps/web/components/shell/Sidebar.tsx`, `apps/web/components/system/CommandPalette.tsx`, dos
  pruebas existentes cuyo contrato de código cambia, la prueba nueva `module-portfolio.test.mjs`,
  documentación y evidencia, y agentes.
- **Cero cambios en el backend**: por decisión del dueño no se tocan `SEED_MODULES` ni el plan crown
  de `apps/api/src/modules/auth/service.js`. Los códigos retirados que un tenant ya tenga en
  `active_modules` dejan de verse igual, porque el portafolio filtra antes de la habilitación.
- **Lógica de negocio intacta**: no se cambian consultas, permisos ni datos. El corte es de
  presentación del catálogo; `loadModuleAccess` sigue calculando habilitación exactamente igual.
- **Corrección de la lista y cierre en 11.** Al recorrer el catálogo completo apareció **APEX AI
  Core** (`id: "AI-CORE"`), que la tabla previa omitió por su identificador no numérico: el primer
  corte real fue 18/14 sobre 32 fichas. El dueño luego pidió retirar **Facturación** (17/15), marcó
  con X **Contabilidad, Tesorería, Proyectos, APEX Control y APEX AI Core** porque «aún falta mucho
  para trabajarlos» (12/20) y, al final, pidió ocultar **Cartera y CxC** porque «aún no tiene
  funcionalidad». El corte final es **11 visibles / 21 retirados**.
- **Siete retirados conservan superficie: se retiran de la oferta, no del código.** Facturación,
  Contabilidad, Tesorería, Proyectos, APEX Control y APEX AI Core tenían pantalla raíz publicada;
  **Cartera y CxC** nunca tuvo ficha raíz —`/dashboard/cxc` da 404 por el `notFound()` de la ficha
  genérica— y conserva sus cuatro subrutas (`/documentos`, `/clientes`, `/reportes/cartera`,
  `/retenciones`). Se quitan **17 entradas de oferta** en total (2 de Facturación, 11 de
  Contabilidad, 1 de Tesorería y 3 de CxC) para que no aparezcan en acciones frecuentes ni en el
  buscador, y las rutas siguen respondiendo para quien las tenga guardadas. La prueba del portafolio
  declara las siete excepciones: seis con ruta heredada y una con subrutas heredadas sin raíz; la
  del buscador exime sus rutas de la cobertura.
- **Consecuencia declarada: dos superficies solo por URL.** El monitor certificado de **Facturas
  recibidas** (`/dashboard/contabilidad/facturas-recibidas`) pierde su entrada de oferta y la
  bandeja de documentos de **CxC** pierde sus tres. Ambas pantallas siguen cargando por URL directa,
  pero dejan de anunciarse en el centro de comandos hasta que su módulo vuelva al portafolio.
- **Verificación funcional de no-regresión**: suite web **697/697**, `typecheck` limpio y ESLint
  sin errores.

## 1. Objetivo

Evitar que el lobby y la navegación ofrezcan herramientas que aún no existen o aún no operan, sin
perder el trabajo de fichas y assets:

1. **Criterio medido, no el campo `status`.** Se clasificó por pantalla real, llamada a API y
   certificación. `status` estaba desactualizado: marcaba «En construcción» a Ventas, Facturación,
   Tesorería, Transporte y Talento humano, todos con flujo real.
2. **Retirar 21 fichas sin borrarlas.** Punto de venta, Costos, Presupuestos, Producción, Recetas,
   Calidad, Devoluciones, Comercio exterior, Activos, CRM, Planeación de demanda, Facturación,
   Facturación electrónica, Configuración inicial, Suscripciones, Contabilidad, Tesorería,
   Proyectos, APEX Control, APEX AI Core y Cartera y CxC dejan de ofrecerse; las 14 sin pantalla
   solo abrían la página genérica `[module]`, las seis con raíz conservan sus rutas publicadas y
   CxC conserva sus cuatro subrutas sin raíz.
3. **Corregir la ficha de lo que sí opera.** Ventas, Facturación y Tesorería pasan a «Base
   funcional»; Transporte y Talento humano a «Listo para operar».

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/web/lib/modules.ts` | Constante `RETIRED_MODULE_SLUGS` (21), helpers `isPortfolioModule`/`isRetiredModuleSlug` y listas derivadas `PORTFOLIO_MODULES`/`RETIRED_MODULES`; estados corregidos en 5 fichas |
| `M` | `apps/web/app/dashboard/page.tsx` | Lobby filtra por `PORTFOLIO_MODULES` y enlaza con `moduleHome` (CxC abre su superficie real, no la ficha genérica) |
| `M` | `apps/web/components/shell/Sidebar.tsx` | La barra solo construye ítems del portafolio y usa `moduleHome`: los retirados desaparecen en lugar de quedar como candados |
| `M` | `apps/web/components/system/CommandPalette.tsx` | Acciones, funciones y módulos del buscador exigen que el módulo esté en el portafolio |
| `M` | `apps/web/lib/moduleFunctions.ts`, `apps/web/lib/operationalWorkspace.ts` | Salen 17 entradas de oferta: 2 de Facturación, 11 de Contabilidad, 1 de Tesorería y 3 de CxC; sus rutas siguen activas |
| `M` | `apps/web/app/dashboard/[module]/page.tsx` | Un slug retirado responde `notFound()` aunque el tenant conserve su código en `active_modules` |
| `M` | `apps/web/test/command-palette-module-functions.test.mjs`, `apps/web/test/commercial-visit-selection.test.mjs` | Afirman el nuevo contrato de filtro, `moduleHome`, la exención de rutas de un retirado y que PYG deja de ofrecerse |
| `A` | `apps/web/test/module-portfolio.test.mjs` | 6 pruebas: 32 fichas / 11 visibles / 21 retirados, pantalla propia por visible, retirado sin pantalla fuera de la ficha genérica, seis excepciones con ruta heredada y una con subrutas, consumidores filtrados, 404 directo, estados corregidos y funciones sin destinos retirados |
| `A` | `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png`, `evidence-portfolio-metrics.json` | Capturas del lobby con sesión real y métricas de tiles, barra, buscador y URL directa |
| `M` | `docs/qa/evidence/lobby-v4-20261110/validacion.md` | Ronda 10, filas de cambios y recuento de suite |
| `A` | `docs/briefs/2026-11-12-curaduria-portafolio.md` | Este brief |
| `M` | `.qoder/skills/**`, `agents/**`, `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de los agentes requeridos y entrada de la intervención |

### Módulos (`change_intent.modules`)

- `web-portfolio`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno. Las fichas retiradas y sus imágenes permanecen en el repositorio.

## 3. Fuera de alcance

- `apps/api/**` y `apps/api/prisma/**`: no se tocan seeds ni el plan crown, por decisión del dueño.
- Assets del lobby: las 32 fotografías siguen en `public/assets/lobby/`; las retiradas simplemente
  no se ofrecen.
- Datos de tenants: no se reescribe `active_modules` de ningún tenant.
- Páginas operativas de los módulos retirados: siguen publicadas y sin cambios de negocio.
- Promoción a `develop`/`main`, despliegues, migraciones remotas e infraestructura: requieren
  autorización explícita e independiente.
- `.tmp/`: herramientas locales, no entran al commit.

## 4. Restricciones

- Rama: solo `desarrollo`. Push únicamente a `origin/desarrollo` al cierre.
- El certificador `certify-ui-ux-phase-two-local.mjs` exige «Bienvenido,» y «Priorizadas para tu
  perfil»; el lobby conserva ambos.
- Un módulo visible no puede carecer de pantalla; la prueba lo verifica contra el sistema de archivos.
- Un retirado no puede reaparecer por `active_modules`, buscador ni URL directa, salvo las seis rutas
  heredadas declaradas y las cuatro subrutas de CxC.

## 5. Criterios de aceptación

1. `cd apps/web && node --test "test/*.test.mjs"` → **697/697** en verde.
2. `node --test test/module-portfolio.test.mjs` → **6/6**.
3. `tsc --noEmit` sin hallazgos y ESLint sin errores.
4. Evidencia (`evidence-portfolio-metrics.json`): lobby con **10 tiles** para el tenant demo
   (11 publicados menos Gastos Menores, que no está habilitado en ese tenant), **0** slugs retirados
   en tiles o barra, **0** candados en la barra, buscador sin fichas ni funciones retiradas
   («tesoreria», «proyectos», «apex control», «apex ai», «pyg», «cuentas por cobrar» y «crm» → 0) y
   las fichas genéricas de `punto-de-venta`, `configuracion-inicial` y `/dashboard/cxc` con **404**.
   Las seis rutas heredadas —`/dashboard/facturacion`, `/dashboard/contabilidad`,
   `/dashboard/contabilidad/facturas-recibidas`, `/dashboard/tesoreria`, `/dashboard/proyectos`,
   `/dashboard/apex-control` y `/dashboard/apex-ai`— y las cuatro subrutas de CxC siguen cargando su
   pantalla. Desbordamiento horizontal `0` en claro y oscuro. `/dashboard/compras`,
   `/dashboard/comercio`, `/dashboard/inventario`, `/dashboard/ventas` y
   `/dashboard/talento-humano/rutas` abren pantallas reales.
5. Las capturas muestran sesión real (`demo@apex.local`, «Sesión activa»).

## 6. Evidencia y certificación exigida

- Pruebas: suite web **697/697** y `module-portfolio.test.mjs` **6/6**.
- Evidencia: `docs/qa/evidence/lobby-v4-20261110/evidence-portfolio-lobby-{light,dark}.png` y
  `evidence-portfolio-metrics.json`; ronda 10 en `validacion.md`.
- Nota de lectura del buscador: «punto de venta» devuelve «Vender en el mostrador» y «presupuesto»
  «Gestionar presupuestos comerciales», ambas funciones de módulos visibles; las consultas de los
  retirados —incluida «cuentas por cobrar»— devuelven cero resultados; ninguna coincidencia es una
  ficha ni una función retirada.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Acceso por tenant** — `loadModuleAccess` no cambia; el portafolio filtra presentación, no permisos.
- **Trazabilidad** — las 32 fichas siguen en el catálogo; retirar es reversible quitando el slug del set.
- **Navegación real** — todo módulo publicado tiene al menos una pantalla; CxC usa `moduleHome`.
- **Rendimiento** — sin peticiones, librerías ni animaciones nuevas.

## 8. Riesgos y rollback

- Riesgo: que un tenant pierda un módulo que sí opera al no estar en la lista → Mitigación: la lista
  se derivó por pantalla y API; cualquier exclusión se corrige sacando el slug de
  `RETIRED_MODULE_SLUGS`. Rollback: revert del commit.
- Riesgo: que los seeds reinyecten módulos retirados → Medido: aunque el código siga en
  `active_modules`, el lobby, la barra, el buscador y la URL los descartan; queda como deuda
  declarada no tocar `apps/api` en esta ronda.
- Riesgo: que el buscador siga mostrando palabras de un retirado → Medido: solo aparecen funciones
  de módulos visibles; la prueba impide que una función apunte a un retirado.
- Riesgo: que un flujo certificado dependa de una entrada de oferta retirada → Medido: Facturas
  recibidas y la bandeja de documentos de CxC siguen cargando por URL y se declaran como
  consecuencia; si el dueño las quiere de vuelta en el buscador, basta devolver sus entradas sin
  reabrir el módulo completo.

## 9. Supuestos y preguntas abiertas

- Supuesto: retirar del portafolio no exige borrar fichas ni assets; se conservan para retomarlos.
- Decisión del dueño: el portafolio queda en **11 visibles**; Contabilidad, Tesorería, Proyectos,
  APEX Control, APEX AI Core y Cartera y CxC se ocultan por completo de la oferta aunque sus rutas
  sigan activas. Bloquear también esas rutas es una ronda aparte con redirección y aviso.
- Cartera y CxC es un caso distinto: nunca tuvo pantalla raíz, así que `/dashboard/cxc` da 404 con
  el corte y lo que sobrevive son sus cuatro subrutas. Si el dueño quiere bloquearlas, es la misma
  ronda aparte que las rutas heredadas.
- Deuda declarada: alinear `SEED_MODULES` y el plan crown en la API requiere su propia ronda con
  agentes de backend, seguridad y QA.

## 10. Autorizaciones requeridas

- [x] Implementación en `desarrollo` (decisión del dueño: corte de portafolio).
- [x] Portafolio en 11 visibles con Contabilidad, Tesorería, Proyectos, APEX Control, APEX AI Core y
  Cartera y CxC retirados de la oferta (decisión explícita del dueño, la última con el texto
  «cartera y cxc también debemos ocultarlo aún no tiene funcionalidad»).
- [x] No tocar seeds del backend (decisión explícita del dueño).
- [ ] Promoción a `develop`/`main`: no solicitada ni incluida.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `OK`; ruteo `equipo-apexos`, `apexos-brief`, `apexos-frontend` y
  `apexos-qa`.
- **Documentación actualizada**: este brief y `validacion.md` (ronda 10).
- **Agentes actualizados**: `apexos-frontend` 2.23.3, `apexos-qa` 2.52.2, `equipo-apexos` 2.30.2 y
  `apexos-brief` 2.43.2 (el corte de 21 retirados con seis rutas heredadas y una de subrutas).
- **Registro**: `agents/registry.json` y `agents/CHANGELOG.md` en el mismo commit.
- **Secuencia de cierre**: `agents:sync` → `agents:check` → `test:agents` → `agents:preflight` →
  `agents:coverage` → pruebas → commit → `git push origin desarrollo`.
