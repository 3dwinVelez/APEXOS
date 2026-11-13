# Brief — Promoción controlada de `develop` a `main` por paquetes aislados (2026-11-13)

## 1. Pedido

«Valida el ambiente de `develop` y `main`… migrar todas las actualizaciones de manera controlada hacia
`main`: capa visual, cambios en módulos y funciones, entre otros ajustes… que los datos que ya usan los
clientes en producción no se vean afectados… todo debe estar certificado con la empresa modelo NYVORA…
commit aislado por origen (capa visual, talento humano, corrección de error), sin mezclar todo `develop`
en un solo merge sin control.»

Este brief valida, agrupa y fija la mecánica. **No ejecuta** la promoción ni toca producción.

## 2. Validación de ambientes (medido el 2026-11-13)

| Hecho | Medición |
|---|---|
| Tip de `main` | `4659292f` |
| Despliegue productivo | `apexos-api-prod` y `apexos-web-prod` en `SUCCESS` sobre `4659292f` |
| Tip de `develop` | `beff5132` (capa visual completa) |
| Despliegue QA | web `4c8dbc1d` `SUCCESS` sobre `beff5132`; API QA en `6589af8e`, sin redespliegue |
| Divergencia | 466 commits de `develop` no están en `main`; 105 commits de `main` no están en `develop` |
| Diff neto `main`→`develop` | 1.242 archivos: 976 A / 184 M / 74 D / 7 R |
| Distribución | 568 `docs/`, 391 `apps/web/`, 140 `apps/api/`, 115 `scripts/`, 18 `supabase/`, 4 `infra/` |
| Dependencias nuevas | `exceljs` (API, gastos menores) y `html-to-image` (web, comercio) |

La divergencia no permite un merge: `main` contiene promociones reconstruidas y correcciones propias.
El candidato debe **reconstruirse sobre `main`** con commits temáticos, igual que la promoción de
Comercio del 2026-11-08.

## 3. Deriva de esquema (lo que toca datos de clientes)

Producción tiene **44 migraciones aplicadas**; `main` declara 47. Hay **3 migraciones de `main` sin
aplicar en producción**:

- `20260919130000_align_kilometraje_unique_index_shape`
- `20260921000000_gps_inactivo_sin_senal_novelty_type`
- `20261001120000_transport_settlement_packages`

La tercera es la más seria: el código de `main` usa `TransportSettlementPackage` (26 referencias en
`transport/settlement-service.js`) y producción **no tiene** esas tablas
(`information_schema` solo muestra `TransportSettlement` y `TransportSettlementLine`). Es una brecha
preexistente que la promoción debe cerrar, no heredar.

`develop` añade **21 migraciones** más. En total, **24 migraciones** separan la base productiva del
esquema de `develop`:

| Grupo | Migraciones | Riesgo sobre datos |
|---|---|---|
| Talento Humano / nómina | `20260918100000`…`20260919130000` (14) | Tablas nuevas; producción **no tiene** ninguna. La de `20260919100000` actualiza datos, pero solo de tablas creadas en esta misma cadena |
| Transporte | `20261007120000` planes, `20261009120000` geografía tarifaria, `20261013120000` PYG, `20261019134505` liquidación-vehículo | Tablas nuevas + `DROP NOT NULL` (compatible hacia atrás) |
| Sedes | `20261016123000_sedes_replace_origins` | **RENAME** de `TransportOrigin` a `sedes`. Producción tiene **0 filas** en `TransportOrigin`: el riesgo de datos es nulo, pero el código viejo deja de encontrar la tabla en el instante del rename |
| Gastos menores | `20261009180000` | Tablas nuevas |
| Contabilidad | `20261014120000` | `DROP NOT NULL` en `cnt_cuedoc.party_id` (compatible) |

Además, en el lado Supabase:

- `vehicle-documents` **ya existe** en producción (bucket verificado).
- El esquema `apexos_accounting_private.standard_chart` (2.508 cuentas del piloto, migración
  `20261020173515_standard_chart_piloto.sql`) **no existe** en producción. El código de
  `accounting/service.js` lo usa: si se promueve Contabilidad sin aplicarlo, el arranque de empresas
  nuevas falla.
- El catálogo de módulos M-29 (`20261011100000_petty_cash_module_catalog.sql`) tampoco está aplicado.

## 4. Qué NO debe viajar (aunque esté en `develop`)

| Pieza | Decisión | Prueba |
|---|---|---|
| 20 modelos `Invoice*` / `ReceivedInvoice*` en `schema.prisma` | **Excluir** | No tienen API, UI ni migración; son un experimento local que produciría deriva de esquema |
| 132 JPG de demo en `apps/web/public/comercio/**` y seeders demo | **Excluir** | Ya se excluyeron en la promoción de Comercio; son datos falsos |
| Motor de nómina y marcaciones de Talento Humano | **Excluir por bloqueador legal** (ver §5) | Auditoría 2026-10-30 |
| Evidencia de rondas intermedias que no sustente un paquete | **Excluir** | Solo viaja la evidencia citada por los manifiestos |

## 5. Bloqueadores

1. **Talento Humano / nómina: NO APTO.** La auditoría del 2026-10-30
   (`docs/audits/2026-10-30-marcaciones-nomina/06-veredicto.md`) dejó 13 hallazgos abiertos: hora
   nocturna, recargos dominicales, divisor 220, topes de IBC, provisiones, libranzas, auxilio de
   transporte, cierre y aprobación. La remediación R-01…R-05 está en `desarrollo` pero **no se
   promovió**; no existe reauditoría. Su veredicto es explícito: «no debe promoverse a `develop` ni a
   `main` para uso productivo». Promover el motor nuevo **sin reauditoría** expondría a NYVORA a pagos
   y aportes incorrectos.
2. **Gastos Menores no está licenciado en NYVORA.** Su catálogo de módulos no incluye
   `gastos_menores`. La certificación con la empresa modelo es imposible sin habilitar M-29 en
   producción (cambio de licencia que no debe hacerse para certificar).
3. **Plan de cuentas estándar ausente.** Sin la migración Supabase, Contabilidad no puede promoverse.
4. **Deriva preexistente de `main` vs producción** (§3): 3 migraciones sin aplicar.
5. **Rename de sedes.** Compatible con datos (0 filas), incompatible con código viejo durante la
   ventana; requiere vista de compatibilidad `TransportOrigin` o despliegue API inmediatamente después.

## 6. Paquetes propuestos (un commit aislado cada uno)

| ID | Commit temático | Contenido | Migraciones | ¿NYVORA puede certificarlo? |
|---|---|---|---|---|
| **P0** | `feat(web): capa visual completa` | Lobby V4, tokens, shell, `SearchSelect`, curaduría 12/20, retiro del asistente, textos y evidencia visual (≈143 rutas web) | Ninguna | Sí (navegador, solo lectura) |
| **P1** | `feat(transport): sedes, planes, tarifario, PYG y liquidación por vehículo` | API 16 + transport-pyg 8 + web 13 + tests 35 + docs | 6 de `develop` + las 3 pendientes de `main` | Sí (tiene licencia de transporte; hoy sin datos operativos) |
| **P2** | `feat(petty-cash): cajas menores` | API 3 + web 7 + tests 3 + catálogo M-29 | 1 + Supabase de catálogo | **No**: M-29 no licenciado en NYVORA |
| **P3** | `feat(accounting): PYG, aperturas, reverso y plan de cuentas` | API 10 + web 6 + tests 10 + datos PUC | 1 + Supabase del plan estándar | Sí (contabilidad licenciada) |
| **P4** | `fix(admin,inventory,purchases): correcciones puntuales` | Ventana de empresa, esquema de inventario, servicio de compras, registro de módulos en `server.js` | Ninguna | Sí |
| **HR** | **No se prepara** | Motor de nómina y marcaciones | 14 | Bloqueado por §5.1 |

Orden de ejecución: **P0** (sin base) → **P4** (sin base) → **P3** (Supabase) → **P1** (rename sedes) →
**P2** (si el dueño lo pide). Cada paquete es independiente: si uno no certifica, los demás no se
detienen.

## 7. Mecánica de commits aislados

1. Worktree detachado sobre `origin/main` (nunca merge de `develop`).
2. Un commit por paquete con **solo sus rutas**; los hunks compartidos (`schema.prisma`, `server.js`,
   `core/prisma.js`, `rbac.js`, `globals.css`) se recortan al mínimo que el paquete consume y se
   verifican uno por uno, como en la promoción de Comercio.
3. Cada paquete lleva su manifiesto `qa:promotion:scope` v2 con inventario A/M/D exacto y
   `allowed_deletions` explícito.
4. Cada paquete lleva su `qa:approval:evidence` con certificación NYVORA y aprobación funcional
   explícita. `main` no se toca si la compuerta no está en verde.
5. Ningún commit puede mezclar módulos: si el diff toca dos módulos, se parte antes de promover.

## 8. Seguridad de los datos de clientes

- **Antes:** snapshot/PITR de Supabase y conteo base de las tablas de NYVORA (`employees`,
  `users`, `sales_invoices`, `cnt_cuedoc`, `TransportCarrier`, `TransportOrigin`).
- **Migraciones:** se aplican en ventana de mantenimiento; casi todas son aditivas. La única no
  aditiva es el rename de `TransportOrigin` (0 filas): se aplica y se crea de inmediato la vista de
  compatibilidad `TransportOrigin` para que la API anterior siga respondiendo mientras Railway
  despliega la nueva.
- **Certificación sin escribir:** NYVORA se certifica con `NYVORA_REAL_READONLY` (GET + navegador);
  no se usan los arneses que crean usuarios o marcaciones de prueba en producción.
- **Después:** regresión de masas NYVORA (solo lectura) y los hubs visibles; comparación de conteos
  contra el snapshot.
- **Rollback:** `git revert` del commit promovido + redeploy del deployment anterior en Railway. Las
  migraciones aditivas no se revierten; el rename conserva la vista de compatibilidad.

## 9. Criterios de aceptación

- Cada paquete: compuerta de alcance v2 en verde, suite local del paquete en verde (API + web del árbol
  candidato), certificación NYVORA en verde y compuerta de aprobación `qa:approval:evidence`.
- Producción: `/health` con el commit nuevo, ambos servicios `SUCCESS`, 0 errores nuevos en consola y
  red en los hubs que NYVORA usa, y conteos de datos iguales al snapshot.
- Evidencia versionada en `docs/qa/evidence/<paquete>-main-20261113/`.

## 10. Autorizaciones pendientes (solo el dueño)

1. Alcance: confirmar P0–P4 y exclusión de Talento Humano.
2. Ventana de producción y autorización para aplicar migraciones y desplegar.
3. Gastos Menores: si se quiere en `main`, habilitar M-29 en NYVORA o aceptar certificarlo en QA
   únicamente, declarándolo.
