# Seguimiento UI/UX APEX OS

Actualizado: 2026-09-09
Rama de implementación: `desarrollo`  
Flujo autorizado: `desarrollo -> develop -> main`

Leyenda: `[x]` terminado y validado · `[-]` en curso · `[ ]` pendiente · `[!]` bloqueado.

## Fase 0 — Corregir lo roto

- [x] Guía APEX AI bajo demanda mediante ayuda contextual `?`.
- [x] Cierre de la guía sin propagación ni navegación accidental.
- [x] Persistencia de “No mostrar de nuevo”.
- [x] Componente reutilizable `EmptyState` con icono, descripción y dos acciones.
- [x] Empty state de órdenes de venta.
- [x] Empty state de productos con distinción entre catálogo vacío y filtros sin resultado.
- [x] Empty state de órdenes de compra, diferenciando catálogo vacío y filtros sin resultado.
- [x] Empty state de Transporte en tarifarios, adaptado a permisos de escritura.
- [x] Auditoría WCAG AA: contraste base, foco, movimiento reducido, nombres accesibles y anuncios verificados en Login, Inventario, Compras y Ventas, incluyendo inspección manual en escritorio y móvil.
- [x] Login responsive con temas claro/oscuro y movimiento reducido accesible.
- [x] Skeleton durante validación de permisos.
- [x] Sistema global de toast de éxito/error/reintento.
- [x] Loading y bloqueo de doble envío en Ventas, Compras e Inventario.
- [x] Loading y toast en acciones críticas de Inventario: ajustes, traslados, cargue inicial, productos, familias, bodegas y clasificaciones.
- [x] Títulos nativos en módulos del sidebar colapsado.
- [x] Tooltips visuales consistentes para el sidebar colapsado, visibles con mouse y teclado.

## Fase 1 — Estandarizar y pulir

- [x] Consolidar tokens de color, tipografía, espaciado, radios y sombras.
- [x] Estandarizar Button, Input, Select, Textarea y estados de validación.
- [x] Estandarizar Card, Tabs, Modal, Drawer, Toast, Badge, Avatar y Skeleton.
- [x] Implementar DataTable con selección, ordenamiento, filtros y paginación.
- [x] Agregar acciones masivas y configuración persistente de columnas.
- [x] Normalizar formularios a dos columnas y validación `onBlur`.
- [x] Dividir formularios extensos en pasos.
- [x] Resolver overflow de pestañas.
- [x] Unificar centro e historial de notificaciones.
- [x] Inspección visual autenticada de Fase 1 en escritorio y móvil, sin overflow horizontal ni controles sin nombre en las rutas críticas.

## Fase 2 — Experiencia inteligente

- [x] Command palette global y acciones rápidas.
- [x] Dashboard contextual por rol.
- [x] APEX AI operativo: anomalías, sugerencias y alertas predictivas.
- [x] Atajos de navegación y breadcrumbs avanzados.
- [x] Trazabilidad universal entre módulos.
- [x] Operaciones críticas offline-first.
- [x] Internacionalización ES/EN/PT.

## Fase 3 — World-class

- [x] Microinteracciones y transiciones con movimiento reducido.
- [-] Accesibilidad AAA y navegación completa por teclado: base global terminada; auditoría profunda por módulo en curso.
- [ ] Temas, densidad, tamaño de fuente, favoritos y vistas guardadas.
- [ ] Colaboración y presencia en tiempo real.
- [ ] Analytics, drill-down y reportes programados.
- [ ] Objetivos de rendimiento percibido y virtualización.
- [ ] Onboarding interactivo y checklist de configuración.
- [ ] Experiencia tablet/móvil y PWA.
- [ ] Confianza visual: sesión, auditoría, permisos y 2FA.
- [ ] Detalles de productividad: fechas, moneda, copiar, undo/redo y autocomplete.

## Evidencia acumulada

| Fecha | Incremento | Evidencia |
|---|---|---|
| 2026-09-07 | Login, guía contextual, permisos y empty states iniciales | `apps/web/test/login-phase-zero-ux.test.mjs`; typecheck y build aprobados |
| 2026-09-07 | Toast global accesible con temas, cierre automático y reintento | `components/system/ToastCenter.tsx`; prueba contractual en `login-phase-zero-ux.test.mjs` |
| 2026-09-07 | Loading y feedback en creación de OV y OC | Typecheck, lint del alcance, 6/6 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Loading y feedback en ajustes de Inventario | Bloqueo de doble envío, reintento con la misma clave de idempotencia, typecheck, lint del alcance, 7/7 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Loading y feedback en traslados y cargue inicial | Bloqueo de doble acción, toast de éxito/error y reintento seguro; typecheck, lint del alcance, 9/9 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Loading y feedback en maestro de productos | Bloqueo de guardados simultáneos, toast para creación/edición y reintento de edición; typecheck, lint del alcance, 10/10 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Loading y feedback en maestros secundarios de Inventario | Familias, bodegas y clasificaciones con bloqueo de dobles acciones y feedback accesible; typecheck, lint del alcance, 11/11 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Empty states de Compras y Transporte | Estados vacíos accionables y sensibles a filtros/permisos; typecheck, lint del alcance, 12/12 pruebas UX y build de 98 rutas aprobados |
| 2026-09-07 | Accesibilidad del sidebar colapsado | Tooltips flotantes no recortados, nombres accesibles, página activa y foco visible; typecheck, lint del alcance, 13/13 pruebas UX y build de 98 rutas aprobados; inspección visual local pendiente |
| 2026-09-07 | Auditoría WCAG AA transversal | Contraste programático, foco visible global, movimiento reducido y regiones vivas; typecheck, lint del alcance, 15/15 pruebas UX y build de 98 rutas aprobados |
| 2026-09-08 | Cierre integral de Fase 0 | `docs/qa/evidence/ui-ux-phase-zero-20260908/local-validation.md`; auditoría manual de 11 rutas en escritorio y móvil (390 px), Stock corregido, 17/17 pruebas UX, typecheck, lint y build aprobados |
| 2026-09-08 | Sistema de diseño y cierre técnico de Fase 1 | `docs/qa/evidence/ui-ux-phase-one-20260908/local-validation.md`; tokens y componentes compartidos, DataTable avanzado en Productos, formularios por pasos/onBlur, tabs adaptables y centro de notificaciones; 23/23 pruebas, typecheck y build aprobados |
| 2026-09-08 | Corrección de superposición entre ayuda APEX AI y acciones de formulario | `docs/qa/evidence/ui-ux-guide-overlap-20260908/local-validation.md`; clic físico en Continuar sin reapertura de guía, 13/13 certificación navegador, 23/23 pruebas, typecheck, lint y build aprobados; QA pendiente |
| 2026-09-09 | Cierre integral de Fase 2 | `docs/qa/evidence/ui-ux-phase-two-20260908/local-validation.md`; command palette, dashboard por rol, pulso APEX AI, breadcrumbs, trazabilidad, estado offline e idiomas ES/EN/PT; 14/14 certificación navegador, 30/30 contratos UX, 49/49 pruebas offline, typecheck, lint sin errores y build de 100 rutas aprobados |
| 2026-09-09 | Inicio de Fase 3: movimiento y teclado global | `docs/qa/evidence/ui-ux-phase-three-foundation-20260909/local-validation.md`; transiciones de página/diálogo con movimiento reducido, skip link, anuncios de ruta y paleta con foco restaurado; 7/7 navegador, 33/33 contratos acumulados, typecheck, lint y build aprobados |
