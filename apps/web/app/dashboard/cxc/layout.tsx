import { redirect } from "next/navigation";
import type { ReactNode } from "react";

// Cartera y CxC salio del portafolio: las pantallas se conservan para cuando vuelva el modulo,
// pero toda la ruta redirige al lobby en lugar de cargar.
export default function CxcLayout(): ReactNode {
  redirect("/dashboard");
}
