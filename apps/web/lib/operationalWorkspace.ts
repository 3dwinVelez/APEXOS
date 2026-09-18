import { ApexModule } from "@/lib/modules";
import { ClipboardCheck, FilePlus2, PackagePlus, ReceiptText, ScanLine, ShoppingCart, Truck, UserPlus, Wrench } from "lucide-react";

export type OperationalAction = { id: string; label: string; description: string; href: string; module: string; icon: typeof PackagePlus; roles?: string[]; keywords: string };

export const OPERATIONAL_ACTIONS: OperationalAction[] = [
  { id: "new-sale", label: "Nueva venta", description: "Registra un pedido de cliente", href: "/dashboard/ventas/ordenes/nueva", module: "ventas", icon: ReceiptText, roles: ["ventas", "comercial", "asesor"], keywords: "pedido orden cliente vender" },
  { id: "new-purchase", label: "Nueva compra", description: "Crea una orden a proveedor", href: "/dashboard/compras/ordenes/nueva", module: "compras", icon: ShoppingCart, roles: ["compras", "abastecimiento"], keywords: "orden oc proveedor abastecer" },
  { id: "receive-purchase", label: "Recibir mercancía", description: "Registra la recepción de una compra", href: "/dashboard/compras/ordenes/recibir", module: "compras", icon: ScanLine, roles: ["compras", "bodega", "almacen"], keywords: "recepcion mercancía entrada proveedor" },
  { id: "new-product", label: "Crear producto", description: "Agrega un artículo o servicio", href: "/dashboard/inventario/productos/nuevo", module: "inventario", icon: PackagePlus, roles: ["inventario", "bodega", "almacen"], keywords: "sku item articulo servicio" },
  { id: "stock-adjustment", label: "Ajustar inventario", description: "Registra una corrección de existencias", href: "/dashboard/inventario/ajustes/nuevo", module: "inventario", icon: ClipboardCheck, roles: ["inventario", "bodega", "almacen"], keywords: "stock ajuste conteo existencia" },
  { id: "new-invoice", label: "Emitir factura", description: "Genera un documento de venta", href: "/dashboard/facturacion/emitir", module: "facturacion", icon: FilePlus2, roles: ["facturacion", "ventas", "caja"], keywords: "factura documento venta" },
  { id: "new-service", label: "Nuevo servicio", description: "Programa una orden de servicio", href: "/dashboard/servicios/nuevo", module: "servicios", icon: Wrench, roles: ["servicio", "tecnico", "operaciones"], keywords: "orden trabajo visita servicio" },
  { id: "transport-operation", label: "Gestionar despacho", description: "Abre la operación de transporte", href: "/dashboard/transporte/operacion", module: "transporte", icon: Truck, roles: ["transporte", "logistica", "despacho"], keywords: "ruta despacho entrega vehiculo" },
  { id: "new-customer", label: "Gestionar clientes", description: "Consulta o registra clientes", href: "/dashboard/ventas/clientes", module: "ventas", icon: UserPlus, roles: ["ventas", "comercial", "asesor"], keywords: "cliente tercero contacto" }
];

export const MODULE_GROUPS = [
  { id: "operation", label: "Operación", areas: ["Operación", "Manufactura", "Logística", "Activos"] },
  { id: "commercial", label: "Comercial", areas: ["Comercial"] },
  { id: "finance", label: "Finanzas", areas: ["Finanzas"] },
  { id: "people", label: "Personas y gestión", areas: ["Personas", "Gestión"] },
  { id: "platform", label: "Control y plataforma", areas: ["Control gerencial", "Plataforma"] }
] as const;

export function actionsForWorkspace(enabledSlugs: Set<string>, roleName: string) {
  const role = roleName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return OPERATIONAL_ACTIONS.filter((action) => enabledSlugs.has(action.module)).sort((a, b) => Number(Boolean(b.roles?.some((term) => role.includes(term)))) - Number(Boolean(a.roles?.some((term) => role.includes(term)))));
}

export function groupModules(modules: ApexModule[]) {
  const claimed = new Set<string>();
  const groups = MODULE_GROUPS.map((group) => { const items = modules.filter((module) => (group.areas as readonly string[]).includes(module.area)); items.forEach((module) => claimed.add(module.slug)); return { ...group, items }; }).filter((group) => group.items.length);
  const other = modules.filter((module) => !claimed.has(module.slug));
  return other.length ? [...groups, { id: "other", label: "Otros", areas: [] as readonly string[], items: other }] : groups;
}
