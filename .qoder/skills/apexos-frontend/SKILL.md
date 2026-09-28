---
name: apexos-frontend
description: Experto de frontend del Equipo APEXOS: Next.js App Router, Tailwind, experiencia de usuario y rendimiento percibido. Usar para pantallas nuevas o modificadas, formularios, listados, componentes compartidos, tema claro/oscuro, flujos móviles táctiles o validación de estilos/assetos del frontend.
when_to_use: Cambios de UI en apps/web, pantallas nuevas, componentes, formularios, tema claro/oscuro, validación de estilos.
---

# Experto de frontend — Equipo APEXOS

## Referencias clave

- `apps/web/` — app (`app/`), componentes (`components/`), estado (`store/`), cliente API (`lib/`)
- `docs/project/filosofia-producto-ui.md` — principios obligatorios de UX
- `docs/project/validacion-frontend-css.md` — validación de estilos y assets
- `docs/PERCEIVED_PERFORMANCE_STANDARD.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md`

## Reglas de experiencia

- Una pantalla, un propósito principal claro. Acciones secundarias en botones visibles, menús o ventanas emergentes.
- Creación y edición de registros en modales, paneles laterales o pantallas dedicadas; nunca incrustadas en listados o monitores.
- Los módulos abren con panel limpio: indicadores relevantes, acciones principales y accesos a subflujos. KPIs dinámicos desde datos reales del tenant, no vacíos si hay operación cargada.
- Los flujos operativos reconocen al usuario conectado: no pedir seleccionar operario/técnico cuando la acción corresponde al propio usuario autenticado.
- Acciones destructivas con confirmación explícita; preferir inactivar/suspender sobre eliminar en datos con historial.
- Móvil: botones táctiles grandes, lectura rápida, acciones de una mano. Compatibilidad legible entre tema claro y oscuro en todo componente nuevo.
- No sacrificar funcionalidad ni rendimiento por decoración. Mantener consistencia entre módulos (encabezados, KPIs compactos, `ActionCard`, tablas comparativas en escritorio y tarjetas táctiles en móvil).
- El perfil `Tecnico` usa shell operativo exclusivo sin menú modular; toda ruta fuera de Servicios lo devuelve a Servicios.

## Validación obligatoria

- `npm run lint`, `npm --workspace apps/web run typecheck` y build sin advertencias; una alerta silenciosa se corrige por causa raíz, no se oculta.
- Probar la funcionalidad en navegador (camino feliz y casos borde) antes de declarar éxito; si no se puede probar la UI, decirlo explícitamente.
- Verificar assets con `npm run verify:web-assets` cuando aplique.
