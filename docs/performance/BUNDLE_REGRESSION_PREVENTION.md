# APEXOS - Bundle Regression Prevention

Fecha: 2026-08-03

## Presupuestos

- `/dashboard/proyectos`: route size aproximado 12.2 kB y First Load JS aproximado 152 kB.
- Cualquier crecimiento mayor al 10% frente al baseline validado requiere analisis.
- Una pagina server no debe importar librerias de graficos, mapas o editores sin aislamiento.

## Guardas automaticas

Ejecutar:

```bash
node scripts/performance/assert-projects-no-server-recharts.js
```

La guarda falla si `apps/web/app/dashboard/proyectos/page.tsx` importa `recharts` directa o dinamicamente.

## Revision de bundle

Antes de promover:

- ejecutar build;
- revisar el resumen de rutas;
- comparar route size y First Load JS contra baseline;
- buscar librerias pesadas en server chunks cuando una ruta crece;
- documentar excepciones con causa y presupuesto aceptado.

## Rechazo de regresiones

No se acepta promocion si:

- reaparece `recharts` en el server page de Proyectos;
- `/dashboard/proyectos` vuelve a un orden cercano a 115 kB;
- el First Load JS vuelve a un orden cercano a 255 kB;
- hay degradacion nueva de T3/T4 o p95 sin explicacion.
