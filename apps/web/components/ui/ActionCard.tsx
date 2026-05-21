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
  const className = `flex min-h-24 w-full items-center gap-3 rounded-md border bg-white p-3 text-left transition active:scale-[0.99] hover:bg-paper sm:gap-4 sm:p-4 ${
    primary ? "border-apex" : "border-line hover:border-apex"
  }`;
  const iconClass = `flex h-11 w-11 shrink-0 items-center justify-center rounded-md sm:h-12 sm:w-12 ${
    primary ? "bg-apex text-white" : "bg-paper text-apex"
  }`;
  const content = (
    <>
      <span className={iconClass}><Icon size={22} /></span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-neutral-600">{detail}</span>
      </span>
    </>
  );

  if (href) return <Link className={className} href={href}>{content}</Link>;
  return <button className={className} onClick={onClick} type="button">{content}</button>;
}
