import { CommercialNav } from "@/components/commercial-nav";
import type { ReactNode } from "react";

export default function CommercialManagementLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <CommercialNav />
      {children}
    </div>
  );
}
