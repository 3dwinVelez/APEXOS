const SIGNATURES = [
  { mime: "image/jpeg", minBytes: 3, matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/png", minBytes: 8, matches: (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  { mime: "image/webp", minBytes: 12, matches: (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP" },
  { mime: "application/pdf", minBytes: 5, matches: (bytes) => ascii(bytes, 0, 5) === "%PDF-" },
  { mime: "video/mp4", minBytes: 12, matches: (bytes) => ascii(bytes, 4, 8) === "ftyp" },
  { mime: "video/webm", minBytes: 4, matches: (bytes) => [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value) }
];

function ascii(bytes, start, end) {
  return Buffer.from(bytes.subarray(start, end)).toString("ascii");
}

function detectFileMime(bytes) {
  if (!bytes?.length) return null;
  return SIGNATURES.find((signature) => bytes.length >= signature.minBytes && signature.matches(bytes))?.mime || null;
}

function decodeBase64Prefix(value, maxBytes = 16) {
  const input = String(value || "");
  const payload = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return Buffer.alloc(0);
  return Buffer.from(payload.slice(0, Math.ceil(maxBytes / 3) * 4), "base64").subarray(0, maxBytes);
}

module.exports = { decodeBase64Prefix, detectFileMime };
