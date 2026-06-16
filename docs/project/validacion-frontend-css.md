# Validacion frontend y CSS

## Problema corregido

El frontend podia cargar funcionalmente pero sin estilos cuando el servidor de desarrollo usaba `.next` y una compilacion de produccion eliminaba o reemplazaba assets CSS mientras el dev server seguia activo.

## Solucion aplicada

- El dev server usa `NEXT_DIST_DIR=.next-dev`.
- El build usa `.next`.
- Se agrego una verificacion de assets CSS para validar que los links generados por Next existan.
- Se agrego fallback de CSS compilado cuando la verificacion detecta assets faltantes.

## Archivos relevantes

- `apps/web/next.config.ts`
- `scripts/dev-web.js`
- `scripts/ensure-web-css.js`
- `scripts/start-local-windows.js`
- `apps/web/package.json`
- `package.json`

## Comandos de validacion

```powershell
npm --workspace apps/web run lint
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
npm run verify:web-assets
```

## Criterio de aceptacion

- Lint, typecheck y build terminan sin errores ni advertencias.
- Los efectos React declaran dependencias estables para evitar consultas con filtros o datos obsoletos.
- Las evidencias y previsualizaciones usan `next/image` con dimensiones explicitas; las fuentes base64 o dinamicas usan `unoptimized`.
- La pagina carga con fondo, tipografia y componentes Tailwind aplicados.
- `/_next/static/css/...` responde correctamente.
- El build no rompe el servidor de desarrollo activo.

## Limpieza aplicada

- Se eliminaron 28 advertencias del frontend sin desactivar reglas de ESLint.
- Se estabilizaron cargas y filtros de Administracion, APEX AI, Contabilidad, Inventario, Proyectos, Servicios y Talento Humano.
- Se corrigieron dependencias silenciosas en sincronizacion de formularios, reportes, presencia GPS y mapa operativo.
- Se migraron previsualizaciones fotograficas y mosaicos del mapa a `next/image`.
- El generador de CSS de respaldo ejecuta Tailwind directamente con Node, evitando la advertencia de seguridad por procesos hijos con `shell: true`.
