"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { downloadTransferRemissionPdf } from "@/lib/transferRemissionPdf";

type Warehouse = { id: number; code: string; name: string; warehouse_type?: string; address?: string; city?: string };
type TransferLine = {
  id: number;
  item_id: number;
  qty: number;
  unit_cost: number;
  lot?: string;
  item?: { code: string; name: string; unit: string };
};
type TransferUser = { id: number; name: string; email: string };
type Transfer = {
  id: number;
  number: string;
  society_code: string;
  status: "draft" | "in_transit" | "received";
  reason?: string;
  created_at: string;
  dispatched_at?: string;
  received_at?: string;
  origin?: Warehouse;
  destination?: Warehouse;
  created_by_user?: TransferUser | null;
  dispatched_by_user?: TransferUser | null;
  received_by_user?: TransferUser | null;
  lines: TransferLine[];
};

const statusName = (status: Transfer["status"]) =>
  status === "draft"
    ? "Borrador"
    : status === "in_transit"
      ? "En tránsito"
      : "Descargado";
const formatDate = (value?: string) =>
  value
    ? new Date(value).toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "--";

export default function TransfersPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    origin_place_id: "",
    destination_place_id: "",
    status: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    const [warehouseRows, transferRows] = await Promise.all([
      api<Warehouse[]>("/api/v1/inventory/warehouses"),
      api<Transfer[]>("/api/v1/inventory/transfers?" + params.toString()),
    ]);
    setWarehouses(warehouseRows);
    setTransfers(transferRows);
  }, [filters]);

  useEffect(() => {
    void load().catch((err) =>
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los traslados",
      ),
    );
  }, [load]);

  async function openDetail(id: number) {
    try {
      setSelected(await api<Transfer>("/api/v1/inventory/transfers/" + id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el detalle",
      );
    }
  }

  async function action(id: number, name: "dispatch" | "receive") {
    try {
      await api("/api/v1/inventory/transfers/" + id + "/" + name, {
        method: "POST",
        body: "{}",
      });
      setMessage(
        name === "dispatch"
          ? "Mercancía despachada a tránsito"
          : "Traslado descargado completamente",
      );
      setSelected(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo procesar el traslado",
      );
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">Inventario</p>
          <h1 className="text-3xl font-semibold">Reporte de traslados</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Documentos en borrador, en tránsito y descargados.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-md bg-apex px-4 py-2 text-sm font-medium text-white"
          href="/dashboard/inventario/traslados/nuevo"
        >
          <Plus size={16} /> Nuevo traslado
        </Link>
      </header>
      <InventoryNav />
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-sm">
            Desde
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-2"
              type="date"
              value={filters.from_date}
              onChange={(e) =>
                setFilters({ ...filters, from_date: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Hasta
            <input
              className="mt-1 h-10 w-full rounded-md border border-line px-2"
              type="date"
              value={filters.to_date}
              onChange={(e) =>
                setFilters({ ...filters, to_date: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            Origen
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-2"
              value={filters.origin_place_id}
              onChange={(e) =>
                setFilters({ ...filters, origin_place_id: e.target.value })
              }
            >
              <option value="">Todos</option>
              {warehouses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Destino
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-2"
              value={filters.destination_place_id}
              onChange={(e) =>
                setFilters({ ...filters, destination_place_id: e.target.value })
              }
            >
              <option value="">Todos</option>
              {warehouses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Estado
            <select
              className="mt-1 h-10 w-full rounded-md border border-line px-2"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Todos</option>
              <option value="draft">Borrador</option>
              <option value="in_transit">En tránsito</option>
              <option value="received">Descargado</option>
            </select>
          </label>
          <button
            className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-apex text-sm text-apex"
            onClick={() => void load()}
            type="button"
          >
            <Search size={16} /> Consultar
          </button>
        </div>
      </section>
      <section className="overflow-x-auto rounded-md border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500">
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Destino</th>
              <th className="px-3 py-2">Líneas</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((row) => (
              <tr
                className="border-b border-line/70 last:border-0 hover:bg-paper/60"
                key={row.id}
              >
                <td className="px-3 py-2">
                  <button
                    className="font-mono text-apex underline-offset-2 hover:underline"
                    onClick={() => void openDetail(row.id)}
                    title="Ver detalle del documento"
                    type="button"
                  >
                    {row.number}
                  </button>
                </td>
                <td className="px-3 py-2">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2">
                  {row.origin?.code} - {row.origin?.name}
                </td>
                <td className="px-3 py-2">
                  {row.destination?.code} - {row.destination?.name}
                </td>
                <td className="px-3 py-2">{row.lines.length}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-paper px-3 py-1 text-xs">
                    {statusName(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.status === "in_transit" ? (
                    <button
                      className="text-apex hover:underline"
                      onClick={() => void action(row.id, "receive")}
                      type="button"
                    >
                      Descargar completo
                    </button>
                  ) : (
                    "--"
                  )}
                </td>
              </tr>
            ))}
            {!transfers.length ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-neutral-500"
                  colSpan={7}
                >
                  No hay traslados con los filtros seleccionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between border-b border-line p-4">
              <div>
                <p className="text-sm text-neutral-500">
                  Documento de traslado
                </p>
                <h2 className="text-xl font-semibold">{selected.number}</h2>
                <p className="text-sm">
                  {selected.origin?.name} → {selected.destination?.name} ·{" "}
                  {statusName(selected.status)}
                </p>
              </div>
              <div className="flex items-center gap-2"><button className="inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm text-apex" onClick={() => downloadTransferRemissionPdf(selected)} type="button"><Download size={16} /> Descargar remisión PDF</button><button onClick={() => setSelected(null)} type="button"><X size={20} /></button></div>
            </header>
            <div className="grid gap-2 p-4 text-sm md:grid-cols-3">
              <p>
                <strong>Creado:</strong> {formatDate(selected.created_at)}
                <span className="block text-xs text-neutral-500">{selected.created_by_user?.name || selected.created_by_user?.email || "--"}</span>
              </p>
              <p>
                <strong>Despachado:</strong>{" "}
                {formatDate(selected.dispatched_at)}
                <span className="block text-xs text-neutral-500">{selected.dispatched_by_user?.name || selected.dispatched_by_user?.email || "--"}</span>
              </p>
              <p>
                <strong>Descargado:</strong> {formatDate(selected.received_at)}
                <span className="block text-xs text-neutral-500">{selected.received_by_user?.name || selected.received_by_user?.email || "--"}</span>
              </p>
              <p><strong>Sociedad:</strong> {selected.society_code}</p>
              <p className="md:col-span-2">
                <strong>Motivo:</strong> {selected.reason || "--"}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-paper text-left">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2 text-right">Cantidad</th>
                  <th className="px-4 py-2 text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line) => (
                  <tr className="border-b border-line/70" key={line.id}>
                    <td className="px-4 py-2 font-mono">{line.item?.code}</td>
                    <td className="px-4 py-2">{line.item?.name}</td>
                    <td className="px-4 py-2 text-right">
                      {line.qty} {line.item?.unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: "COP",
                      }).format(line.unit_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
