# Apex Heart — diagnóstico de implementación

Fecha: 2026-09-06

Rama de trabajo: `desarrollo`

Fuente contrastada: `C:\Users\pc\Downloads\PRODUCTOS ABC\Dashboard ABC.spec` y su fuente adyacente `dashboard_abc.py`.

## Lectura del proyecto de referencia

El archivo `.spec` no contiene reglas de negocio: es el manifiesto de empaquetado PyInstaller. La lógica real está en `dashboard_abc.py` (Streamlit/Pandas, 573 KB), conectado a SQL Server y con alternativa de snapshot PKL. El referente combina ventas, costo, compras, inventario valorizado y cartera; calcula Pareto ABC, margen, GMROI, rotación, inventario óptimo/exceso, esfuerzo y ciclo de caja, costo financiero y margen económico.

La implementación en APEX OS no ejecuta ni copia el binario Python. Traduce su núcleo a la arquitectura multiempresa existente (Next.js + Fastify + Prisma/Supabase), usa las transacciones nativas de cada empresa y respeta permisos y aislamiento por tenant.

## Cobertura implementada

| Capacidad | Estado en Apex Heart |
|---|---|
| Entrada desde Reportes y navegación M-28 | Implementada |
| Ventas, unidades, costo, utilidad y margen | Implementada |
| Pareto A/B/C, participación, acumulado y score | Implementada |
| Inventario actual/promedio, días, GMROI y exceso | Implementada |
| Compras, CxP, CxC, vencida, DSO/DPO | Implementada |
| Esfuerzo de caja, ciclo, costo financiero y margen económico | Implementada |
| Tendencia mensual y flujo Compra → Caja | Implementada |
| Reglas configurables por empresa | Implementada |
| Alertas persistentes, criticidad y reconocimiento | Implementada |
| Aviso dentro de APEX OS y cola de correo a dueño/administrador | Implementada; envío efectivo depende de Redis/SMTP del ambiente |
| Enfriamiento configurable de avisos | Implementada |
| Snapshot diario y evaluación automática multiempresa | Implementada a las 05:30, cuando workers/Redis están activos |
| Datos modelo para demostración | Implementados: 12 meses, 6 productos, compras, cartera e inventario |
| Tablas Prisma y migración Supabase con RLS | Implementadas, no aplicadas remotamente |

## Diferencias conscientes frente al programa original

El primer corte funcional concentra el control gerencial y las métricas decisivas. Aún no replica los análisis secundarios del archivo de referencia: jerarquía grupo→marca→línea→producto, aging detallado por proveedor, mapas de calor, EOQ de Wilson por SKU, simuladores de pago y exportación HTML completa. Estos deben entrar como incrementos posteriores para no mezclar un port masivo sin trazabilidad con la primera activación del corazón gerencial.

## Validación local

- Certificación HTTP autenticada: 11/11 controles aprobados.
- Datos certificados: ventas COP 461.543.000; utilidad bruta COP 160.918.000; inventario COP 122.130.000; 6 productos; 6 reglas; 5 condiciones activas.
- TypeScript: aprobado.
- Build Next.js: aprobado; incluye `/dashboard/reportes` y `/dashboard/reportes/apex-heart`.
- Validación visual local: navegación, KPIs, alertas y tabla ABC verificadas.
- Migración: probada de forma no destructiva en la base aislada `apexos_heart_cert`.

## Bloqueos para promoción remota a `develop`

La implementación está en `desarrollo` local. No puede declararse publicada ni promoverse todavía porque la política exige, sobre el commit exacto del candidato, certificación QA en navegador, pruebas de rol sin permiso y tenant cruzado, auditoría de esquema, manifiesto de alcance v2 y aprobación funcional identificada. Además, aplicar Supabase, desplegar o promover ramas requiere autorización independiente. La cadena histórica de migraciones de la base local principal también presenta una falla anterior y ajena a Apex Heart; por eso se validó esta migración aditiva en una base aislada sin resetear ni perder datos.

Ruta obligatoria pendiente: `desarrollo -> develop`. `main` queda fuera del alcance.
