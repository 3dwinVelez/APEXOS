const catalog = require("./data/puc-colombia-20261015.json");
const provenance = require("./data/puc-colombia-20261015.provenance.json");

const CODE_LENGTHS = new Set([1, 2, 4, 6]);
const TYPES_BY_CLASS = Object.freeze({
  "1": "asset",
  "2": "liability",
  "3": "equity",
  "4": "income",
  "5": "expense",
  "6": "cost",
  "7": "cost",
  "8": "order",
  "9": "order"
});

function parsePucCatalogRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError("El catalogo PUC debe ser una lista no vacia");
  }
  return records.map((record, index) => {
    const code = String(record?.code || "").trim();
    const name = String(record?.name || "").trim();
    const codeLength = code.length;
    const parentCode = record?.parent_code == null || record.parent_code === "" ? null : String(record.parent_code).trim();
    const classType = TYPES_BY_CLASS[code.slice(0, 1)];
    if (!/^\d+$/.test(code) || !CODE_LENGTHS.has(codeLength)) {
      throw new Error(`PUC_INVALID_CODE:${index}:${code}`);
    }
    if (!name || !classType) throw new Error(`PUC_INVALID_NAME_OR_CLASS:${index}:${code}`);
    const expectedParent = codeLength === 1 ? null : code.slice(0, codeLength === 2 ? 1 : codeLength - 2);
    if (parentCode !== expectedParent) throw new Error(`PUC_INVALID_PARENT:${code}:${parentCode || "null"}`);
    const level = CODE_LENGTHS.has(codeLength) ? [1, 2, 4, 6].indexOf(codeLength) + 1 : null;
    return {
      code,
      name,
      parent_code: parentCode,
      level,
      code_length: codeLength,
      type: classType,
      allows_tx: false,
      active: true
    };
  });
}

function validatePucCatalog(records = catalog) {
  const normalized = parsePucCatalogRecords(records);
  const codes = new Set(normalized.map((row) => row.code));
  const missingParents = normalized.filter((row) => row.parent_code && !codes.has(row.parent_code));
  const missingClasses = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].filter((code) => !codes.has(code));
  const duplicates = normalized.length - codes.size;
  if (duplicates || missingParents.length || missingClasses.length) {
    throw new Error(`PUC_INVALID_TREE:duplicates=${duplicates};missing_parents=${missingParents.length};missing_classes=${missingClasses.join(",")}`);
  }
  return normalized;
}

module.exports = {
  CODE_LENGTHS,
  TYPES_BY_CLASS,
  PUC_COLOMBIA_CATALOG: catalog,
  PUC_COLOMBIA_PROVENANCE: provenance,
  parsePucCatalogRecords,
  validatePucCatalog
};
