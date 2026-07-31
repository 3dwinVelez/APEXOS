# APEXOS Decorative Elements Removal Report

## Alcance Ejecutado

Se intervino la primera fase local sobre el shell compartido y `/dashboard`.

Elementos eliminados o reemplazados:

- Gradiente y pseudo-decorador de la clase global `.apex-context-hero`.
- Gradiente/sombra de `.apex-section-card`.
- Gradiente de `.apex-soft-gradient`.
- `scroll-behavior: smooth` global para evitar movimiento forzado en toda la app.
- Sombras reintroducidas por dark mode en `.shadow-sm`, `.shadow-md`, `.shadow-lg`, `.shadow-xl`.
- Sombra del item activo en `Sidebar`.
- Sombra y `backdrop-blur` de `MobileNav`.
- Sombra y `backdrop-blur` de `TechnicianWorkspaceHeader`.
- Sombra del `ThemeToggle`.
- Hero decorativo del dashboard, reemplazado por una seccion blanca compacta con enlaces operativos.
- Tres graficos Recharts del dashboard, reemplazados por barras HTML/CSS.

## Pendientes Detectados

Persisten decoradores en pantallas no intervenidas, especialmente `servicios`, `servicios/[id]`, `talento-humano/*`, `inventario/wms`, `administracion/suscripciones` y pantallas publicas. Se dejaron pendientes porque requieren validacion funcional por flujo y rol.
