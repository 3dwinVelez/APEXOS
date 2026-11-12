import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default function CxcPage(): ReactNode {
  redirect("/dashboard");
}
