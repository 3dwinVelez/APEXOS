# APEXOS UI V3 - Aislamiento y correccion de regresiones por ruta

Fecha: 2026-08-03

## Hallazgo inicial

La muestra final anterior de 5 repeticiones reportaba beneficio global de 4.6% y senales negativas en `/dashboard` y `/dashboard/administracion/suscripciones`. Esa muestra era insuficiente para cerrar p95 porque las rutas tenian alta variabilidad y mucho trafico RSC secundario.

## Aislamiento

Se agregaron filtros `BENCH_ROUTES` y `BENCH_PROFILES` al benchmark operacional y se amplio la muestra focal a 15 repeticiones. En esa corrida, `/dashboard` dejo de comportarse como regresion estable: T3 p50 +4.2%, T4 p50 +6.7%, T4 p95 +27.2%. La ruta `administracion-suscripciones` si mantuvo degradacion antes de la correccion: T3 p50 -12.3%, T4 p50 -12.2%, T4 p90 -19.3%.

## Causa

El waterfall mostro prefetch automatico de Next hacia multiples rutas `?_rsc=...` disparado por enlaces de sidebar, dashboard y mobile nav. Esas solicitudes competian con auth/API y contenido critico antes de T3/T4. En muestras focales previas se observaron decenas de RSC fallidas/abortadas en candidata.

## Correccion

Se desactivo `prefetch` en:

- `apps/web/components/shell/Sidebar.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/components/shell/MobileNav.tsx`

La correccion no cambia navegacion visible ni contratos de ruta; solo evita carga anticipada no critica en superficies con muchos enlaces.

## Resultado final

| Ruta | T3 p50 | T4 p50 | T4 p95 | Estado |
| --- | ---: | ---: | ---: | --- |
| login | -3.7% | -3.9% | +8.5% | observacion menor p50 |
| dashboard | +21.5% | +24.1% | +16.9% | corregida |
| administracion | +24.3% | +19.5% | +18.6% | estable |
| administracion-suscripciones | +19.1% | +20.1% | +5.8% | corregida |
| servicios | +20.5% | +22.6% | +21.2% | estable |
| detalle-orden | +16.6% | +16.5% | +9.6% | estable |
| proyectos | +28.9% | +23.6% | +19.4% | estable y bundle corregido |
| mobile servicios | +14.6% | +13.6% | +30.0% | estable |
| mobile detalle-orden | +9.6% | +8.8% | +2.8% | estable |

No queda regresion critica de ruta en T3/T4 p95 dentro de la matriz operacional validada.
