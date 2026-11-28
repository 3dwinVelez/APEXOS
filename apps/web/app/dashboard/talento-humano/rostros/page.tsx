"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, RotateCcw, Search } from "lucide-react";
import { ConfirmWindow } from "@/components/hr/ConfirmWindow";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";

// Maestro de rostros (M-17). Varios empleados marcan en el mismo celular y el lector de
// huella del telefono no identifica a la persona: cada empleado registra su rostro en
// APEXOS Web Movil (Marcar jornada) y cada selfie de marcacion se compara con el.
// Aqui se consulta quien tiene rostro registrado y se restablece (para registrarlo de nuevo).
type FaceEnrollment = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string | null;
  reference_photo: { base64_data?: string; type?: string } | null;
  model: string;
  consent_version: string;
  consent_at: string;
  enrolled_at: string;
};

function describeError(caught: unknown, fallback: string) {
  if (caught instanceof Error) {
    const code = (caught as Error & { code?: string }).code;
    return code ? `${caught.message} (${code})` : caught.message;
  }
  return fallback;
}

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "--";

export default function RostrosRegistradosPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false });
  const [rows, setRows] = useState<FaceEnrollment[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingReset, setPendingReset] = useState<FaceEnrollment | null>(null);

  useEffect(() => {
    setAccess({
      ready: true,
      canRead: hasStoredRolePermission("hr", "read"),
      canWrite: hasStoredRolePermission("hr", "write")
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<FaceEnrollment[]>("/api/v1/hr/face-enrollments", { cache: "no-store" }));
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los rostros registrados."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.canRead) void load();
  }, [access.ready, access.canRead, load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.employee_name, row.employee_code].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  // La victima es el rostro guardado: el empleado vuelve a marcar sin verificacion hasta que se
  // registre de nuevo. La pregunta se lee en la ventana de la pantalla, no en el cuadro del sistema.
  async function reset(row: FaceEnrollment) {
    setBusyId(row.id);
    setMessage("");
    try {
      await api(`/api/v1/hr/employees/${encodeURIComponent(String(row.employee_id))}/face-enrollment`, { method: "DELETE", body: JSON.stringify({ reason: "Restablecido desde el maestro de rostros" }) });
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage(`Rostro de ${row.employee_name} restablecido. Puede registrarlo de nuevo desde Marcar jornada.`);
      setError("");
      setPendingReset(null);
    } catch (caught) {
      setError(describeError(caught, "No fue posible restablecer el rostro."));
    } finally {
      setBusyId(null);
    }
  }

  if (!access.ready) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-neutral-600">Validando permisos de Talento Humano...</div>;
  }

  if (!access.canRead) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        El maestro de rostros no esta disponible para este perfil. Solicita hr:read al administrador.
      </div>
    );
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="rounded-md border border-line bg-white p-5">
        <Link className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800" href="/dashboard/talento-humano">
          <ArrowLeft size={16} /> Talento Humano
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Rostros registrados</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600">
              Cada empleado registra su rostro una vez en APEXOS Web Movil (Marcar jornada), con su autorizacion de datos biometricos.
              Cada selfie de marcacion se compara con este rostro: si no coincide, la marcacion queda senalada en Reportes.
            </p>
          </div>
          <button className="btn-secondary" onClick={() => void load()} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar
          </button>
        </div>
      </header>
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <label className="relative block w-full max-w-xl">
            <Search className="absolute left-3 top-3 text-neutral-400" size={16} />
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o codigo" value={query} />
          </label>
          <span className="text-sm text-neutral-500">{rows.length} empleados con rostro registrado</span>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando rostros registrados...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Foto de referencia</th>
                  <th>Empleado</th>
                  <th>Registrado</th>
                  <th>Autorizacion</th>
                  {access.canWrite ? <th className="pr-3 text-right">Accion</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3">
                      {row.reference_photo?.base64_data ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`Rostro de ${row.employee_name}`} className="h-16 w-16 rounded-md border border-line object-cover" src={row.reference_photo.base64_data} />
                      ) : "--"}
                    </td>
                    <td className="p-3"><p className="font-medium">{row.employee_name}</p><p className="text-xs text-neutral-500">{row.employee_code || `ID ${row.employee_id}`}</p></td>
                    <td className="p-3">{dateTime(row.enrolled_at)}</td>
                    <td className="p-3 text-xs text-neutral-600">Version {row.consent_version}<br />{dateTime(row.consent_at)}</td>
                    {access.canWrite ? (
                      <td className="p-3 pr-3 text-right">
                        <button className="btn-secondary" disabled={busyId === row.id} onClick={() => setPendingReset(row)} type="button">
                          <RotateCcw size={16} /> {busyId === row.id ? "Restableciendo..." : "Restablecer"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td className="p-8 text-center text-neutral-500" colSpan={access.canWrite ? 5 : 4}>
                      {rows.length ? "Ningun empleado coincide con la busqueda." : "Aun no hay rostros registrados. Cada empleado lo registra desde Marcar jornada en APEXOS Web Movil."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingReset ? (
        <ConfirmWindow
          busy={busyId === pendingReset.id}
          confirmLabel="Restablecer rostro"
          description={`${pendingReset.employee_name} tendra que registrar su rostro otra vez en APEXOS Web Movil antes de que sus marcaciones vuelvan a verificarse.`}
          detail={`Registro del ${dateTime(pendingReset.enrolled_at)} (version ${pendingReset.consent_version}). Al restablecer se pierde la foto de referencia guardada.`}
          onClose={() => setPendingReset(null)}
          onConfirm={() => void reset(pendingReset)}
          title="Restablecer el rostro registrado"
        />
      ) : null}
    </div>
  );
}
