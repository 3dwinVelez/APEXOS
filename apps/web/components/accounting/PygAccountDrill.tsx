"use client";

import type { TransportPygAccountChild } from "@/lib/api";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { vehicleMoney } from "./PygVehicleReadings";

export function AccountDrillRow({ account }: { account: TransportPygAccountChild }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className="border-t border-line bg-surface-muted/40">
        <td className="py-1.5 pl-10 pr-3 text-xs text-content-muted">
          {account.centers.length ? (
            <button aria-expanded={open} aria-label={`Desglosar ${account.account_name}`} className="inline-flex items-center gap-1 text-left" onClick={() => setOpen((value) => !value)} title={`Cuenta ${account.account_code}`} type="button">
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="truncate font-medium text-content-strong">{account.account_name}</span>
            </button>
          ) : <span className="font-medium text-content-strong" title={`Cuenta ${account.account_code}`}>{account.account_name}</span>}
          {account.budget_coverage === "partial" ? <span className="ml-2 text-[10px] font-bold text-amber-400">P</span> : null}
        </td>
        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-content-muted">{account.budget == null ? "—" : vehicleMoney.format(account.budget)}</td>
        <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${account.actual < 0 ? "text-red-400" : ""}`}>{vehicleMoney.format(account.actual)}</td>
        <td className="px-3 py-1.5" colSpan={2} />
      </tr>
      {open ? account.centers.map((center) => (
        <tr className="border-t border-line/60 bg-surface-muted/20" key={`${account.account_code}-${center.center_code}-${center.branch_code}`}>
          <td className="py-1.5 pl-16 pr-3 text-xs text-content-muted" title={`Centro ${center.center_code} · Sucursal ${center.branch_code}`}>
            <span className="text-content-strong">{center.center_name}</span>
            {center.branch_name ? <span className="ml-1 text-[10px] text-content-subtle">· {center.branch_name}</span> : null}
          </td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-content-muted">{center.budget == null ? "—" : vehicleMoney.format(center.budget)}</td>
          <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${center.actual < 0 ? "text-red-400" : ""}`}>{vehicleMoney.format(center.actual)}</td>
          <td className="px-3 py-1.5" colSpan={2} />
        </tr>
      )) : null}
    </Fragment>
  );
}
