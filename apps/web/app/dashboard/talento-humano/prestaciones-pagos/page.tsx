"use client";

import { api } from "@/lib/api";
import { Calculator, Download, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PaymentLine = {
  benefit_balance_id: number;
  employee_id: number;
  employee_document?: string;
  employee_name?: string;
  concept_code: string;
  source_period_key: string;
  accrued_amount: number;
  paid_amount: number;
  balance_amount: number;
  amount: number;
  entity_nit?: string;
  entity_name?: string;
  missing_entity?: boolean;
  payment_target: string;
};

type PaymentPreview = {
  payment_type: string;
  period_key: string;
  period_type: string;
  date_start: string;
  date_end: string;
  payment_date: string;
  lines: PaymentLine[];
  total_amount: number;
  document_id?: number;
};

type PaymentDocument = {
  id: number;
  payment_type: string;
  period_key: string;
  payment_date: string;
  status: string;
  total_amount: number;
  lines_count: number;
};

const paymentTypes = [
  { value: "prima", label: "Prima semestral" },
  { value: "cesantias", label: "Cesantías anual al fondo" },
  { value: "intereses_cesantias", label: "Intereses a las cesantías" },
  { value: "vacaciones", label: "Vacaciones" }
];

const today = new Date();
const currentYear = today.getFullYear();

function money(value: number | string | undefined) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function defaultStart(type: string) {
  if (type === "prima") return `${currentYear}-${today.getMonth() < 6 ? "01-01" : "07-01"}`;
  return `${currentYear}-01-01`;
}

function defaultEnd(type: string) {
  if (type === "prima") return `${currentYear}-${today.getMonth() < 6 ? "06-30" : "12-31"}`;
  return `${currentYear}-12-31`;
}

export default function SocialBenefitPaymentsPage() {
  const [paymentType, setPaymentType] = useState("prima");
  const [startDate, setStartDate] = useState(defaultStart("prima"));
  const [endDate, setEndDate] = useState(defaultEnd("prima"));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [documents, setDocuments] = useState<PaymentDocument[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredLines = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    const lines = preview?.lines || [];
    if (!query) return lines;
    return lines.filter((line) => [line.employee_document, line.employee_name, line.concept_code].join(" ").toLowerCase().includes(query));
  }, [employeeQuery, preview]);
  const missingSeveranceFundCount = useMemo(() => filteredLines.filter((line) => line.missing_entity).length, [filteredLines]);

  const loadDocuments = useCallback(async () => {
    const rows = await api<PaymentDocument[]>("/api/v1/talento-humano/prestaciones/pagos/documentos?limit=100", { cache: "no-store" }).catch(() => []);
    setDocuments(rows);
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  function changePaymentType(value: string) {
    setPaymentType(value);
    setStartDate(defaultStart(value));
    setEndDate(defaultEnd(value));
    setPreview(null);
  }

  async function previewPayment() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<PaymentPreview>("/api/v1/talento-humano/prestaciones/pagos/preview", {
        method: "POST",
        body: JSON.stringify({ payment_type: paymentType, fecha_inicio: startDate, fecha_fin: endDate, payment_date: paymentDate })
      });
      setPreview(result);
      setMessage(result.lines.length ? `Previsualización generada: ${result.lines.length} línea(s), total ${money(result.total_amount)}.` : "No hay saldos para pagar con esos filtros.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "No se pudo previsualizar el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function createPayment() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<PaymentPreview>("/api/v1/talento-humano/prestaciones/pagos/documentos", {
        method: "POST",
        body: JSON.stringify({ payment_type: paymentType, fecha_inicio: startDate, fecha_fin: endDate, payment_date: paymentDate })
      });
      setPreview(result);
      setMessage(`Documento de pago creado: ${result.document_id}. Total ${money(result.total_amount)}.`);
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPreview() {
    setMessage("");
    if (!filteredLines.length) {
      setMessage("No hay líneas para exportar con los filtros actuales.");
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pago prestaciones");
    sheet.addRow(["Cedula", "Empleado", "Concepto", "Periodo origen", "Entidad", "Nit entidad", "Causado", "Pagado", "Saldo", "A pagar", "Destino", "Alerta"]);
    filteredLines.forEach((line) => sheet.addRow([
      line.employee_document || line.employee_id,
      line.employee_name || "",
      line.concept_code,
      line.source_period_key,
      line.entity_name || "",
      line.entity_nit || "",
      Number(line.accrued_amount || 0),
      Number(line.paid_amount || 0),
      Number(line.balance_amount || 0),
      Number(line.amount || 0),
      line.payment_target,
      line.missing_entity ? "Falta fondo de cesantías" : ""
    ]));
    sheet.columns.forEach((column) => { column.width = 22; });
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pago-prestaciones-sociales.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function voidDocument(id: number) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/talento-humano/prestaciones/pagos/documentos/${id}`, { method: "DELETE" });
      setMessage("Documento anulado y saldos reversados.");
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo anular el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">Talento Humano - Prestaciones</p>
        <h1 className="text-3xl font-semibold">Pago de prestaciones sociales</h1>
        <p className="mt-1 text-sm text-neutral-600">Paga prima, cesantías, intereses y vacaciones desde saldos provisionados.</p>
      </header>

      {message ? <p className="rounded-md border border-line bg-white p-3 text-sm text-neutral-700">{message}</p> : null}
      {missingSeveranceFundCount ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{missingSeveranceFundCount} empleado(s) tienen cesantías por pagar sin fondo de cesantías asociado.</p> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm">Tipo de pago
            <select className="mt-1 h-10 w-full rounded-md border border-line px-3" value={paymentType} onChange={(event) => changePaymentType(event.target.value)}>
              {paymentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="text-sm">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-sm">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="text-sm">Fecha pago<input className="mt-1 h-10 w-full rounded-md border border-line px-3" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          <label className="text-sm">Empleado<input className="mt-1 h-10 w-full rounded-md border border-line px-3" placeholder="Cédula o nombre" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-60" disabled={busy} onClick={previewPayment} type="button"><Calculator size={16} /> Previsualizar</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || !preview?.lines.length} onClick={createPayment} type="button"><Save size={16} /> Crear pago</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-60" disabled={!filteredLines.length} onClick={() => void exportPreview()} type="button"><Download size={16} /> Excel</button>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-base font-semibold">Previsualización</h2>
            <p className="text-sm text-neutral-500">{filteredLines.length} línea(s), total {money(filteredLines.reduce((sum, line) => sum + Number(line.amount || 0), 0))}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Cédula</th><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Entidad</th><th className="px-3 py-2 text-right">Causado</th><th className="px-3 py-2 text-right">Pagado</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-right">A pagar</th></tr></thead>
            <tbody>{filteredLines.map((line) => <tr className="border-b border-line/70" key={`${line.benefit_balance_id}-${line.concept_code}`}><td className="px-3 py-2">{line.employee_document || line.employee_id}</td><td className="px-3 py-2 font-medium">{line.employee_name || line.employee_id}</td><td className="px-3 py-2">{line.concept_code}<p className="text-xs text-neutral-500">{line.source_period_key}</p></td><td className="px-3 py-2">{line.entity_name || (line.payment_target === "fondo_cesantias" ? "Fondo pendiente" : "Trabajador")}{line.missing_entity ? <p className="text-xs font-semibold text-amber-700">Falta fondo de cesantías</p> : null}</td><td className="px-3 py-2 text-right">{money(line.accrued_amount)}</td><td className="px-3 py-2 text-right">{money(line.paid_amount)}</td><td className="px-3 py-2 text-right">{money(line.balance_amount)}</td><td className="px-3 py-2 text-right font-semibold">{money(line.amount)}</td></tr>)}</tbody>
          </table>
          {!filteredLines.length ? <p className="p-4 text-sm text-neutral-500">Previsualiza un periodo con saldos provisionados para pagar.</p> : null}
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4"><h2 className="text-base font-semibold">Documentos de pago</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-line bg-paper text-left text-xs uppercase text-neutral-500"><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Periodo</th><th className="px-3 py-2">Fecha pago</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Acciones</th></tr></thead>
            <tbody>{documents.map((doc) => <tr className="border-b border-line/70" key={doc.id}><td className="px-3 py-2 font-semibold">#{doc.id}</td><td className="px-3 py-2">{doc.payment_type}</td><td className="px-3 py-2">{doc.period_key}</td><td className="px-3 py-2">{String(doc.payment_date).slice(0, 10)}</td><td className="px-3 py-2">{doc.status}</td><td className="px-3 py-2 text-right">{money(doc.total_amount)}</td><td className="px-3 py-2 text-right">{doc.status !== "anulado" ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold text-red-700" disabled={busy} onClick={() => void voidDocument(doc.id)} type="button"><RotateCcw size={14} /> Anular</button> : "--"}</td></tr>)}</tbody>
          </table>
          {!documents.length ? <p className="p-4 text-sm text-neutral-500">Aún no hay documentos de pago.</p> : null}
        </div>
      </section>
    </div>
  );
}
