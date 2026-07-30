export type AllowedFileMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

export function detectFileMime(bytes: Uint8Array): AllowedFileMime | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export async function inspectFileSignature(file: Blob): Promise<AllowedFileMime | null> {
  const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return detectFileMime(prefix);
}
