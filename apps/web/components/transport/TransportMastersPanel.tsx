import Link from "next/link";

// Compatibilidad de importaciones antiguas; los maestros se administran en el catalogo central.
export function TransportMastersPanel() {
  return <Link href="/dashboard/administracion">Abrir Administración APEXOS</Link>;
}
