"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type User = { id?: number | string; name?: string; email?: string; active?: boolean };
type Candidate = User & { id: number; employee_id: number | null; document_match: boolean; available: boolean };

export default function EmployeeUserAssociation({ document, documentType, employeeId, user, value, readOnly, onChange, onOpenEmployee }: {
  document: string; documentType: string; employeeId?: number | string; user?: User;
  value: string; readOnly: boolean; onChange: (id: string) => void; onOpenEmployee: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (readOnly || user?.id) return;
    let cancelled = false;
    setCandidates([]);
    setError("");
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ document, document_type: documentType, q: query });
      if (employeeId) params.set("employee_id", String(employeeId));
      setLoading(true);
      try {
        const rows = await api<Candidate[]>(`/api/v1/talento-humano/usuarios-vinculables?${params}`, { cache: "no-store" });
        if (!cancelled) setCandidates(rows);
      } catch {
        if (!cancelled) setError("No se pudieron consultar los usuarios. Intenta nuevamente antes de asociar una cuenta.");
      } finally { if (!cancelled) setLoading(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [document, documentType, employeeId, query, readOnly, user?.id]);

  return <section className="rounded-md border border-line bg-paper p-3 md:col-span-2" aria-label="Asociacion de usuario APEX">
    <h3 className="text-sm font-semibold">Usuario APEX</h3>
    {user?.id ? <p className="mt-1 text-sm">{user.name} · {user.email}{user.active === false ? " · Usuario inactivo" : ""}</p> : readOnly ? <p className="mt-1 text-sm">Sin usuario</p> : <>
      <p className="mt-1 text-sm text-neutral-600">El tipo y numero de documento permiten encontrar la ficha del usuario. Si ya existe, completa esa ficha para conservar su historial. Tambien puedes elegir una cuenta sin empleado asociado.</p>
      <label className="mt-3 block text-sm font-semibold">Buscar usuario por nombre o correo
        <input className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 font-normal" value={query} onChange={event => setQuery(event.target.value)} placeholder="Escribe al menos 2 caracteres" />
      </label>
      {loading ? <p role="status" className="mt-2 text-sm">Buscando usuarios...</p> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {value && chosen ? <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span>Se asociara al guardar: {chosen.name} · {chosen.email}</span><button type="button" className="underline" onClick={() => { onChange(""); setChosen(null); }}>Quitar seleccion</button></div> : null}
      <ul className="mt-2 space-y-2">
        {candidates.map(candidate => <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-white p-2 text-sm">
          <span>{candidate.name} · {candidate.email}{candidate.document_match ? " · Documento coincidente" : ""}{candidate.active === false ? " · Inactivo" : ""}
            {candidate.employee_id && !candidate.available ? <span className="block text-xs text-neutral-600">Ya tiene ficha laboral. No se creara un duplicado ni se trasladara el usuario.</span> : null}
          </span>
          {candidate.available ? <button type="button" className="rounded-md border border-line px-3 py-1" onClick={() => { setChosen(candidate); onChange(String(candidate.id)); }}>Seleccionar usuario</button> : candidate.employee_id ? <button type="button" className="rounded-md border border-line px-3 py-1" onClick={() => onOpenEmployee(candidate.employee_id!)}>Abrir ficha existente</button> : null}
        </li>)}
      </ul>
      {!loading && !error && !candidates.length ? <p className="mt-2 text-xs text-neutral-600">Sin coincidencias. Puedes guardar el empleado sin usuario y crear su cuenta despues con el mismo documento.</p> : null}
    </>}
  </section>;
}
