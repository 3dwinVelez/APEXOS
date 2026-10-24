import type { ReactNode } from "react";
import "./inventory.css";
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return <div className="inventory-workspace">{children}</div>;
}
