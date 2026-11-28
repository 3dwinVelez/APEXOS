"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Search, ShieldOff } from "lucide-react";
import { ConfirmWindow } from "@/components/hr/ConfirmWindow";
import { api } from "@/lib/api";
import { hasStoredRolePermission } from "@/lib/rolePermissions";

// Maestro de celulares compartidos para marcar jornada (camion: un celular, dos
// empleados). El registro se hace DESDE el celular del camion en APEXOS Web Movil
// (la llave WebAuthn nace en ese telefono); aqui se consulta y se revoca.
// La huella prueba el celular autorizado; la selfie de cada marcacion prueba la persona.
type SharedDevice = {
  id: number;
  device_id: string;
  vehicle_plate: string;
  label: string | null;
  device_model: string | null;
  rp_id: string;
  active: boolean;
  enrolled_by: number | null;
  enrolled_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  last_used_at: string | null;
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

export default function DispositivosMarcacionPage() {
  const [access, setAccess] = useState({ ready: false, canRead: false, canWrite: false });
  const [rows, setRows] = useState<SharedDevice[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<SharedDevice | null>(null);

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
      setRows(await api<SharedDevice[]>("/api/v1/hr/shared-devices", { cache: "no-store" }));
      setError("");
    } catch (caught) {
      setError(describeError(caught, "No fue posible cargar los celulares de marcacion."));
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
    return rows.filter((row) => [row.vehicle_plate, row.label, row.device_model, row.device_id]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, rows]);

  const activeCount = rows.filter((row) => row.active).length;

  // Revocar cierra el celular para marcar pero conserva su historial: la pregunta se lee en la
  // ventana de la pantalla, con la placa y el ultimo uso, no en el cuadro nativo del sistema.
  async function revoke(row: SharedDevice) {
    setBusyId(row.id);
    setMessage("");
    try {
      // POST sin cuerpo: un cuerpo JSON vacio dispara FST_ERR_CTP_EMPTY_JSON_BODY en Fastify.
      const saved = await api<SharedDevice>(`/api/v1/hr/shared-devices/${row.id}/revoke`, { method: "POST" });
      setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setMessage(`Celular del vehiculo ${row.vehicle_plate} revocado. Su historial de marcaciones se conserva.`);
      setError("");
      setPendingRevoke(null);
    } catch (caught) {
      setError(describeError(caught, "No fue posible revocar el celular."));
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
        El maestro de celulares de marcacion no esta disponible para este perfil. Solicita hr:read al administrador.
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
            <h1 className="text-xl font-semibold">Celulares de marcacion (camiones)</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600">
              Celulares compartidos registrados con huella. En cada uno pueden marcar las personas con malla del dia en esa placa.
              La huella prueba que la marcacion salio del celular autorizado; la selfie prueba quien marco.
              El registro se hace desde el celular del camion en APEXOS Web Movil (Perfil &gt; Celular del camion).
            </p>
          </div>
          <button className="btn-secondary" onClick={() => void load()} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Actualizar
          </button>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-white p-4"><p className="text-xs uppercase text-neutral-500">Registrados</p><p className="text-2xl font-semibold">{rows.length}</p></div>
        <div className="rounded-md border border-line bg-white p-4"><p className="text-xs uppercase text-neutral-500">Activos</p><p className="text-2xl font-semibold text-emerald-700">{activeCount}</p></div>
        <div className="rounded-md border border-line bg-white p-4"><p className="text-xs uppercase text-neutral-500">Revocados</p><p className="text-2xl font-semibold text-neutral-600">{rows.length - activeCount}</p></div>
      </div>
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <label className="relative block max-w-xl">
            <Search className="absolute left-3 top-3 text-neutral-400" size={16} />
            <input className="control pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por placa, etiqueta o modelo" value={query} />
          </label>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-neutral-500">Cargando celulares de marcacion...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-paper text-left text-xs uppercase text-neutral-500">
                  <th className="p-3">Placa</th>
                  <th>Etiqueta</th>
                  <th>Modelo</th>
                  <th>Registrado</th>
                  <th>Ultimo uso</th>
                  <th>Estado</th>
                  {access.canWrite ? <th className="pr-3 text-right">Accion</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3 font-mono font-semibold">{row.vehicle_plate}</td>
                    <td className="p-3">{row.label || "--"}</td>
                    <td className="p-3">{row.device_model || "--"}</td>
                    <td className="p-3">{dateTime(row.enrolled_at)}</td>
                    <td className="p-3">{dateTime(row.last_used_at)}</td>
                    <td className="p-3">
                      {row.active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Activo</span>
                      ) : (
                        <span className="rounded-full bg-paper px-2 py-1 text-xs font-medium text-neutral-600" title={row.revoke_reason || undefined}>
                          Revocado {row.revoked_at ? `el ${dateTime(row.revoked_at)}` : ""}
                        </span>
                      )}
                    </td>
                    {access.canWrite ? (
                      <td className="p-3 pr-3 text-right">
                        {row.active ? (
                          <button className="btn-secondary" disabled={busyId === row.id} onClick={() => setPendingRevoke(row)} type="button">
                            <ShieldOff size={16} /> {busyId === row.id ? "Revocando..." : "Revocar"}
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td className="p-8 text-center text-neutral-500" colSpan={access.canWrite ? 7 : 6}>
                      {rows.length
                        ? "No hay celulares que coincidan con la busqueda."
                        : "Aun no hay celulares registrados. Registra el primero desde el celular del camion en APEXOS Web Movil."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingRevoke ? (
        <ConfirmWindow
          busy={busyId === pendingRevoke.id}
          confirmLabel="Revocar el celular"
          description={`El celular del vehiculo ${pendingRevoke.vehicle_plate} dejara de poder marcar. Para volver a usarlo hay que registrarlo de nuevo desde el celular.`}
          detail={`${pendingRevoke.label || pendingRevoke.device_model || "Celular compartido"} · ultimo uso ${dateTime(pendingRevoke.last_used_at)}. El historial de marcaciones ya registradas se conserva.`}
          onClose={() => setPendingRevoke(null)}
          onConfirm={() => void revoke(pendingRevoke)}
          title="Revocar el celular de marcacion"
        />
      ) : null}
    </div>
  );
}
