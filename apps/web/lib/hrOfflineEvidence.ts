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

// --- Fotos degradadas: el canal de subida existe, la foto NO ------------------
//
// Cuando el navegador no puede decodificar lo que entregó la cámara (HEIC/HEIF/
// AVIF en WebKit, TIFF) no hay JPEG que enviar: re-codificar es imposible y
// mandar los bytes crudos es exactamente el 400 que le costó la jornada al
// `user 231` el 2026-11-19. La marcación sobrevive sin la foto, pero la foto no
// puede desaparecer en silencio: se guarda aquí, fuera de la cola de sincronización
// (no tiene POST posible), con su motivo técnico para que el supervisor sepa qué
// pedir. Vive en su propio almacén porque `pruneHrOfflineEvidence` borra todo lo
// que no este referenciado por un item encolado, y una selfie rechazada nunca lo esta.
const PENDING_DATABASE_NAME = "apexos_hr_pending_evidence";

export type PendingReviewEvidence = {
  ref: string;
  base64: string;
  size: number;
  /** Formato real olfateado en los bytes, no el declarado por la cámara. */
  type: string;
  name: string;
  /** `undecodable` | `too_large` | `encode_failed`, del contrato de PhotoCapture. */
  reason: string;
  punch_type: string;
  punched_at: string;
  created_at: string;
};

type PendingReviewRecord = PendingReviewEvidence & { key?: string };

class HrPendingEvidenceDatabase extends Dexie {
  pending!: EntityTable<PendingReviewRecord, "ref">;

  constructor() {
    super(PENDING_DATABASE_NAME);
    this.version(1).stores({ pending: "ref,created_at" });
  }
}

let pendingDatabase: HrPendingEvidenceDatabase | null = null;
let pendingUnavailable = false;

function openPendingDatabase(): HrPendingEvidenceDatabase | null {
  if (pendingUnavailable) return null;
  if (typeof indexedDB === "undefined") {
    pendingUnavailable = true;
    return null;
  }
  if (!pendingDatabase) {
    try {
      pendingDatabase = new HrPendingEvidenceDatabase();
    } catch {
      pendingDatabase = null;
      pendingUnavailable = true;
    }
  }
  return pendingDatabase;
}

export async function putPendingReviewEvidence(record: Omit<PendingReviewEvidence, "created_at">): Promise<boolean> {
  const db = openPendingDatabase();
  if (!db || !record?.ref) return false;
  try {
    await db.pending.put({ ...record, created_at: new Date().toISOString() });
    return true;
  } catch {
    // Sin almacenamiento local la novedad igual se declara: perder el binario es
    // mejor que perder la marcación o bloquear la pantalla.
    return false;
  }
}

export async function listPendingReviewEvidence(): Promise<PendingReviewEvidence[]> {
  const db = openPendingDatabase();
  if (!db) return [];
  try {
    const rows = await db.pending.toArray();
    return rows.map(({ key, ...rest }) => rest as PendingReviewEvidence).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  } catch {
    return [];
  }
}

export async function deletePendingReviewEvidence(ref: string) {
  const db = openPendingDatabase();
  if (!db || !ref) return;
  try {
    await db.pending.delete(ref);
  } catch {
    // Best-effort.
  }
}
