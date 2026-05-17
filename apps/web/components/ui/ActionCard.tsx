import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type ActionCardProps = {
  title: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

export function ActionCard({ title, detail, icon: Icon, href, onClick, primary = false }: ActionCardProps) {
  const className = `flex min-h-24 items-center gap-4 rounded-md border bg-white p-4 text-left transition hover:bg-paper ${
    primary ? "border-apex" : "border-line hover:border-apex"
  }`;
  const iconClass = `flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${
    primary ? "bg-apex text-white" : "bg-paper text-apex"
  }`;
  const content = (
    <>
      <span className={iconClass}><Icon size={22} /></span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-neutral-600">{detail}</span>
      </span>
    </>
  );

  if (href) return <Link className={className} href={href}>{content}</Link>;
  return <button className={className} onClick={onClick} type="button">{content}</button>;
}
