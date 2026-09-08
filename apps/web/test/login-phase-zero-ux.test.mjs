import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const read = (relativePath) => fs.readFileSync(path.join(webRoot, relativePath), "utf8");
const luminance = ([red, green, blue]) => {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (first, second) => {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

test("el login conserva el flujo de autenticacion y mejora seguridad visual y accesibilidad", () => {
  const source = read("app/login/page.tsx");
  assert.match(source, /loginWithCredentials/);
  assert.match(source, /autoComplete="email"/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /showPassword/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Entrar de forma segura/);
  assert.match(source, /<ThemeToggle \/>/);
});

test("el login define superficies diferenciadas para tema claro y oscuro", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /html\[data-theme="light"\] \.apex-login-split/);
  assert.match(styles, /html\[data-theme="light"\] \.apex-login-panel/);
  assert.match(styles, /html\[data-theme="dark"\] \.apex-login-split > button/);
});

test("la portada pública comparte el lenguaje visual moderno y adaptable del login", () => {
  const source = read("app/page.tsx");
  const styles = read("app/globals.css");
  assert.match(source, /apex-login-split/);
  assert.match(source, /apex-login-visual/);
  assert.match(source, /apex-login-panel/);
  assert.match(source, /apex-flow-wave/);
  assert.match(source, /Entrar de forma segura/);
  assert.match(source, /href="\/login"/);
  assert.match(styles, /html\[data-theme="light"\] \.apex-home-chip/);
  assert.match(styles, /html\[data-theme="light"\] \.apex-home-secondary/);
});

test("la onda del login tiene movimiento suave y respeta reduced motion", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /@keyframes apexWaveDrift/);
  assert.match(styles, /@keyframes apexWaveBreathe/);
  assert.match(styles, /\.apex-flow-wave > path/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.apex-login-split \*/);
});

test("la guia APEX AI es contextual y sus controles no propagan navegacion", () => {
  const source = read("components/brain/AiExperienceLayer.tsx");
  assert.match(source, /setCoachOpen\(false\)/);
  assert.match(source, /Abrir ayuda contextual de APEX AI/);
  assert.match(source, /event\?\.preventDefault\(\)/);
  assert.match(source, /event\?\.stopPropagation\(\)/);
  assert.match(source, /No mostrar de nuevo/);
});

test("los permisos usan skeleton y EmptyState admite icono y dos acciones", () => {
  const guard = read("components/shell/RouteAccessGuard.tsx");
  const feedback = read("components/ui/feedback.tsx");
  assert.match(guard, /aria-label="Validando permisos"/);
  assert.match(guard, /<Skeleton/);
  assert.match(feedback, /icon\?: ReactNode/);
  assert.match(feedback, /primaryAction\?: ReactNode/);
  assert.match(feedback, /secondaryAction\?: ReactNode/);
});

test("el feedback global ofrece toast accesible, cierre y reintento", () => {
  const layout = read("app/layout.tsx");
  const toast = read("components/system/ToastCenter.tsx");
  assert.match(layout, /<ToastCenter \/>/);
  assert.match(toast, /aria-live=/);
  assert.match(toast, /Reintentar/);
  assert.match(toast, /Cerrar notificación/);
  assert.match(toast, /dark:bg-rose-950/);
});

test("los ajustes de inventario bloquean doble envío y reintentan con la misma idempotencia", () => {
  const source = read("app/dashboard/inventario/ajustes/nuevo/page.tsx");
  assert.match(source, /if \(saving\) return/);
  assert.match(source, /loading=\{saving\}/);
  assert.match(source, /idempotency_key: idempotencyKey/);
  assert.match(source, /retry: \(\) => void submit\(idempotencyKey\)/);
  assert.match(source, /Ajuste contabilizado/);
});

test("los traslados bloquean doble envío y reutilizan la idempotencia al reintentar", () => {
  const source = read("app/dashboard/inventario/traslados/nuevo/page.tsx");
  assert.match(source, /if \(saving\) return/);
  assert.match(source, /loading=\{saving\}/);
  assert.match(source, /idempotency_key: idempotencyKey/);
  assert.match(source, /createTransfer\(createAnother, idempotencyKey\)/);
  assert.match(source, /El stock salió de la bodega de origen y quedó en tránsito/);
});

test("el cargue inicial informa validación y contabilización, con bloqueo y reintento", () => {
  const source = read("app/dashboard/inventario/cargue-inicial/page.tsx");
  assert.match(source, /if \(busy\) return/);
  assert.match(source, /if \(!preview \|\| busy\) return/);
  assert.match(source, /title: "Plantilla validada"/);
  assert.match(source, /retry: \(\) => void validate\(\)/);
  assert.match(source, /retry: \(\) => void post\(\)/);
  assert.match(source, /loading=\{busy\}/);
});

test("el maestro de productos bloquea guardados simultáneos y comunica el resultado", () => {
  const source = read("app/dashboard/inventario/productos/nuevo/page.tsx");
  assert.match(source, /if \(saving\) return/);
  assert.match(source, /if \(!selectedItem \|\| saving\) return/);
  assert.match(source, /loading=\{saving\}/);
  assert.match(source, /Producto creado/);
  assert.match(source, /Producto actualizado/);
  assert.match(source, /retry: \(\) => void updateSelectedItem\(patch\)/);
});

test("los maestros secundarios de inventario bloquean duplicados y notifican resultados", () => {
  const families = read("app/dashboard/inventario/familias/page.tsx");
  const warehouses = read("app/dashboard/inventario/bodegas/page.tsx");
  const classifications = read("app/dashboard/inventario/clasificaciones/page.tsx");
  assert.match(families, /if \(saving\) return/);
  assert.match(families, /title: "Familia guardada"/);
  assert.match(families, /loading=\{saving\}/);
  assert.match(warehouses, /if \(saving\) return/);
  assert.match(warehouses, /title: "Bodega eliminada"/);
  assert.match(warehouses, /loading=\{saving\}/);
  assert.match(classifications, /if \(saving\) return/);
  assert.match(classifications, /Clasificación actualizada/);
  assert.match(classifications, /loading=\{saving\}/);
});

test("compras y transporte ofrecen estados vacíos accionables", () => {
  const purchases = read("app/dashboard/compras/ordenes/nueva/page.tsx");
  const transportRates = read("app/dashboard/transporte/tarifas/page.tsx");
  assert.match(purchases, /Aún no hay órdenes de compra/);
  assert.match(purchases, /Sin resultados para este filtro/);
  assert.match(purchases, /Crear primera orden/);
  assert.match(purchases, /setOrderFilter\("all"\)/);
  assert.match(transportRates, /Aún no hay tarifarios de transporte/);
  assert.match(transportRates, /Crear primer tarifario/);
  assert.match(transportRates, /<EmptyState/);
});

test("el sidebar colapsado ofrece tooltips visuales y navegación accesible", () => {
  const source = read("components/shell/Sidebar.tsx");
  assert.match(source, /function SidebarTooltip/);
  assert.match(source, /createPortal/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /group-focus-within|onFocus=\{show\}/);
  assert.match(source, /aria-current=\{active \? "page"/);
  assert.match(source, /aria-label=\{collapsed \? item.label/);
  assert.match(source, /focus-visible:outline-apex/);
});

test("la base visual cumple contraste AA y preferencias de foco y movimiento", () => {
  const styles = read("app/globals.css");
  assert.ok(contrast([15, 118, 110], [255, 255, 255]) >= 4.5, "APEX sobre blanco debe cumplir AA");
  assert.ok(contrast([20, 184, 166], [23, 35, 45]) >= 4.5, "APEX sobre superficie oscura debe cumplir AA");
  assert.ok(contrast([5, 25, 23], [20, 184, 166]) >= 4.5, "Texto de botón oscuro debe cumplir AA");
  assert.match(styles, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible/);
  assert.match(styles, /outline: 3px solid rgb\(var\(--color-apex\)\)/);
  assert.match(styles, /animation-duration: 0\.01ms !important/);
  assert.match(styles, /transition-duration: 0\.01ms !important/);
});

test("los flujos prioritarios anuncian errores y confirmaciones", () => {
  const files = [
    "app/dashboard/compras/ordenes/nueva/page.tsx",
    "app/dashboard/ventas/ordenes/nueva/page.tsx",
    "app/dashboard/inventario/ajustes/nuevo/page.tsx",
    "app/dashboard/inventario/traslados/nuevo/page.tsx",
    "app/dashboard/inventario/cargue-inicial/page.tsx",
    "app/dashboard/inventario/productos/nuevo/page.tsx",
    "app/dashboard/inventario/familias/page.tsx",
    "app/dashboard/inventario/bodegas/page.tsx",
    "app/dashboard/inventario/clasificaciones/page.tsx"
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /role="alert"/, `${file} debe anunciar errores`);
    assert.match(source, /role="status"/, `${file} debe anunciar confirmaciones`);
  }
});
