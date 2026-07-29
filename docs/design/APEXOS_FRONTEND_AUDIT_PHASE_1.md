# APEXOS Frontend Audit Phase 1

Fecha: 2026-07-29

Rama de trabajo: `codex/qa-operational-design-system-v2`

Ambiente autorizado: QA

## Alcance

Esta auditoria cubre solo frontend: `apps/web/app`, `apps/web/components`, `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` y dependencias UI de `apps/web/package.json`.

No se revisaron ni modificaron backend, API, Prisma, RLS, seguridad, autenticacion, base de datos ni contratos.

## Inventario

| Area | Hallazgo |
| --- | --- |
| Framework | Next.js 15.1.3, React 19, TypeScript 5.8.2, Tailwind CSS 3.4.17 |
| Estado cliente | Zustand, TanStack React Query, hooks locales con `useState`/`useEffect` |
| Formularios | Inputs nativos, selects nativos, `react-hook-form`, validaciones con Zod en algunas zonas |
| Iconografia | `lucide-react` como libreria principal |
| Graficas | `recharts` instalado para dashboards/reportes |
| Componentes reutilizables UI | `Button`, `ModalFrame`, `ActionCard` |
| Shell | `Sidebar`, `MobileNav`, `UserSessionBadge`, `TechnicianWorkspaceHeader`, `ThemeToggle`, `PlatformAlerts`, `SessionLifecycle` |
| Operacion movil | `PhotoCapture`, `SignatureCapture`, flujos de servicios y marcacion |
| Componentes de modulo | Navs por modulo, `inventory-panel`, componentes de APEX AI |
| Rutas de pagina | 58 `page.tsx` en `apps/web/app` |
| Rutas API bajo web | 8 `route.ts` en `apps/web/app/api` |
| Componentes TS/TSX | 25 archivos bajo `apps/web/components` |
| CSS global | Un unico `globals.css` amplio con tokens, dark mode, estilos publicos, estilos de tablas y overrides |

## Componentes Detectados

### Base

- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/ModalFrame.tsx`
- `apps/web/components/ui/ActionCard.tsx`

### Layout y navegacion

- `apps/web/app/layout.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `apps/web/components/shell/Sidebar.tsx`
- `apps/web/components/shell/MobileNav.tsx`
- `apps/web/components/shell/TechnicianWorkspaceHeader.tsx`
- Navs por modulo: compras, contabilidad, CxC, facturacion, inventario, ventas.

### Operacion y campo

- `apps/web/components/operations/PhotoCapture.tsx`
- `apps/web/components/operations/SignatureCapture.tsx`
- Pantallas clave: servicios, detalle de servicio, solicitud publica, marcacion, mapa, rutas.

### Alertas, sesion y sistema

- `PlatformAlerts`
- `SessionLifecycle`
- `ThemeToggle`
- `UserSessionBadge`
- `RouteAccessGuard`

### AI

- `AiAssistanceToggle`
- `AiExperienceLayer`
- `ApexAiHeader`
- `BrainPanel`
- `useApexAiAccess`

## Hallazgos Principales

1. El Design System aun no esta centralizado.
   Existen pocos componentes base, mientras la mayoria de botones, inputs, selects, cards, tablas, badges y estados se declaran directamente dentro de cada pagina.

2. La paleta actual no coincide totalmente con la identidad oficial v2.0.
   `globals.css` usa `--color-apex: 20 108 99` en claro y `52 211 181` en oscuro. La norma oficial exige `#14B8A6` como turquesa institucional.

3. Hay deuda visual contraria a Operational First Design.
   Se detectan gradientes, radial gradients, sombras grandes, `backdrop-blur`, transparencias y radios decorativos en CSS global y pantallas.

4. Las tablas son frecuentes pero no tienen un componente base unico.
   Hay tablas con sticky header en algunas pantallas, pero tambien hay tablas repetidas con clases locales, anchos arbitrarios y comportamiento inconsistente.

5. Los formularios no comparten primitivas.
   Inputs, selects y textareas se repiten con clases Tailwind parecidas. Esto encarece cambios de densidad, foco, error, disabled y accesibilidad.

6. Las pantallas complejas mezclan logica de UI, estado local y markup extenso.
   Administracion, servicios e inventario/WMS contienen superficies muy largas. Esto aumenta riesgo de re-render innecesario y hace mas costosa la migracion por pantalla.

7. Mobile ya tiene rutas operativas diferenciadas, pero falta una norma estricta.
   Hay `MobileNav`, headers de tecnico, barras inferiores y componentes de captura; sin embargo, la experiencia movil aun comparte muchos patrones de escritorio.

8. El modo oscuro depende de overrides globales extensos.
   Hay reglas `html.dark` que corrigen multiples familias de Tailwind. Esto funciona, pero hace dificil garantizar consistencia futura.

9. No hay fuente unica declarada como token formal.
   La documentacion exige Inter o IBM Plex Sans; el frontend debe consolidar una sola familia antes de migrar componentes.

10. Hay mediciones iniciales, pero falta una baseline formal de UI.
    Existen documentos y scripts de performance, pero esta actualizacion necesita baseline por pantalla: carga, bundle, Lighthouse, captura visual y smoke funcional.

## Riesgos

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Migracion masiva de UI | Regresiones funcionales | Migrar un componente o pantalla por PR de QA |
| Cambiar tokens sin inventario visual | Cambios inesperados en modulos | Primero componentes base, despues pantallas |
| Reemplazar tablas localmente | Inconsistencia y bugs de scroll | Crear `DataTable` base antes de migrar tablas |
| Mobile adaptado desde desktop | Baja productividad en campo | Flujos moviles independientes por tarea |
| Overlays con blur/sombras | Peor rendimiento percibido | Modal/Drawer sin blur y con sombras moderadas |

## Recomendacion De Fases

### Fase 2: Design System

- Definir tokens definitivos en documentacion y luego en Tailwind/CSS.
- Crear contrato de componentes antes de modificar pantallas.
- Decidir fuente unica: Inter por defecto, IBM Plex Sans solo si producto la adopta oficialmente.
- Definir densidades: desktop compacto, mobile tactil.

### Fase 3: Componentes Base

Prioridad sugerida:

1. `Button`
2. `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`
3. `Badge`, `Alert`, `Skeleton`, `EmptyState`
4. `ModalFrame`, `Drawer`
5. `DataTable`, `Pagination`, filtros y toolbar de tabla
6. `Card`, `Tabs`, `Breadcrumbs`
7. `Sidebar`, `Navbar`, `MobileNav`, layout shells

### Fase 4: Migracion Controlada

Orden sugerido:

1. Pantallas de bajo riesgo: reportes simples y listados sin escritura.
2. Modulos administrativos con tablas.
3. Inventario y compras.
4. Ventas, facturacion y CxC.
5. Servicios desktop.
6. Servicios mobile y flujos de tecnico.

## Validacion Obligatoria Por Cambio

Cada fase o pantalla debe ejecutar:

- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run lint`
- `npm --workspace apps/web run build`
- Pruebas unitarias disponibles
- Smoke test funcional manual o automatizado
- Comparacion visual desktop y mobile
- Lighthouse/performance cuando haya pantalla migrada

Si una validacion falla, detener la migracion y corregir antes de continuar.

