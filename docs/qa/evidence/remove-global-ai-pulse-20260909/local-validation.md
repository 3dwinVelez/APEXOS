# Validación local — retiro de la señal global APEX AI

Fecha: 2026-09-09  
Entorno: LOCAL  
Rama: `desarrollo`

## Alcance

Se retiró `ApexIntelligencePulse` de `DashboardChrome` para que la franja de señal inteligente prioritaria no se inserte automáticamente sobre ningún módulo. El encabezado, asistente y acceso al tablero de APEX AI permanecen disponibles.

## Evidencia

- `node --test apps/web/test/phase-two-intelligent-experience.test.mjs`: 7/7 pruebas aprobadas.
- `npm --workspace apps/web run typecheck`: aprobado.
- ESLint dirigido a `components/shell/DashboardChrome.tsx`: aprobado.
- Inspección en `http://127.0.0.1:3001/dashboard/compras/proveedores`: encabezado `Proveedores` visible y cero elementos con `aria-label="Señal inteligente prioritaria"`.
- No se modificaron ni guardaron datos funcionales.

## Regresión protegida

La prueba versionada verifica que `DashboardChrome` siga integrando las capacidades globales de Fase 2 y que no contenga ninguna referencia a `ApexIntelligencePulse`.
