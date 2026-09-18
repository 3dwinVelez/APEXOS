import type { ReactNode } from "react";

export default function TransportLayout({ children }: { children: ReactNode }) {
  return <div className="transport-workspace">{children}</div>;
}
