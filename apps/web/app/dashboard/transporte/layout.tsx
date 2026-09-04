import { TransportNav } from "@/components/transport-nav";
import type { ReactNode } from "react";

export default function TransportLayout({ children }: { children: ReactNode }) {
  return <><TransportNav />{children}</>;
}
