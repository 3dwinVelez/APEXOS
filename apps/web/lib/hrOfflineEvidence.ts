import Dexie, { type EntityTable } from "dexie";

export type HrOfflinePhoto = { base64: string; size: number; type: string; name: string };

type HrOfflineEvidenceRecord = HrOfflinePhoto & { ref: string; created_at: string };

const DATABASE_NAME = "apexos_hr_offline_evidence";

class HrOfflineEvidenceDatabase extends Dexie {
  evidence!: EntityTable<HrOfflineEvidenceRecord, "ref">;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({ evidence: "ref,created_at" });
  }
}

let database: HrOfflineEvidenceDatabase | null = null;
let unavailable = false;

// La base se abre de forma perezosa y nunca en el alcance del modulo: este archivo tambien
// se evalua durante el SSR, donde no existe indexedDB.
function openDatabase(): HrOfflineEvidenceDatabase | null {
  if (unavailable) return null;
  if (typeof indexedDB === "undefined") {
    unavailable = true;
    return null;
  }
  if (!database) {
    try {
      database = new HrOfflineEvidenceDatabase();
    } catch {
      database = null;
      unavailable = true;
    }
  }
  return database;
}

export function newHrOfflineEvidenceRef(prefix = "hr-evidence") {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${random}`;
}

export async function putHrOfflineEvidence(ref: string, photo: HrOfflinePhoto): Promise<boolean> {
  const db = openDatabase();
  if (!db || !ref || !photo?.base64) return false;
  try {
    await db.evidence.put({ ...photo, ref, created_at: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function getHrOfflineEvidence(ref: string): Promise<HrOfflinePhoto | null> {
  const db = openDatabase();
  if (!db || !ref) return null;
  try {
    const record = await db.evidence.get(ref);
    if (!record?.base64) return null;
    return { base64: record.base64, size: record.size, type: record.type, name: record.name };
  } catch {
    return null;
  }
}

export async function deleteHrOfflineEvidence(ref: string) {
  const db = openDatabase();
  if (!db || !ref) return;
  try {
    await db.evidence.delete(ref);
  } catch {
    // Un blob huerfano no justifica romper la sincronizacion ya confirmada.
  }
}

export async function pruneHrOfflineEvidence(activeRefs: string[]) {
  const db = openDatabase();
  if (!db) return;
  try {
    const keep = new Set(activeRefs.filter(Boolean));
    const refs = await db.evidence.toCollection().primaryKeys();
    const orphans = refs.map(String).filter((ref) => !keep.has(ref));
    if (orphans.length) await db.evidence.bulkDelete(orphans);
  } catch {
    // La limpieza es best-effort.
  }
}
