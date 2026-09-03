const journalEntrySchema = {
  body: {
    type: "object",
    required: ["description", "entries"],
    properties: {
      description: { type: "string", minLength: 1 },
      date: { type: "string" },
      transaction_id: { type: "integer" },
      entries: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          required: ["account"],
          properties: {
            account: { type: "string" },
            debit: { type: "number" },
            credit: { type: "number" }
          }
        }
      }
    }
  }
};

const accountSchema = {
  body: {
    type: "object",
    required: ["code", "name", "type"],
    properties: {
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["asset", "liability", "equity", "income", "expense", "cost", "order"] },
      parent_id: { type: ["integer", "null"] },
      level: { type: "integer", minimum: 1 },
      allows_tx: { type: "boolean" },
      active: { type: "boolean" }
    }
  }
};

const thirdPartySchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      type: { type: "string" },
      roles: { type: "array", items: { type: "string", enum: ["customer", "supplier", "employee"] }, uniqueItems: true },
      name: { type: "string", minLength: 1 },
      legal_name: { type: "string" },
      person_type: { type: "string", enum: ["natural", "juridica"] },
      first_name: { type: "string" },
      middle_name: { type: "string" },
      first_last_name: { type: "string" },
      second_last_name: { type: "string" },
      document_type: { type: "string" },
      tax_id: { type: "string" },
      tax_type: { type: "string" },
      verification_digit: { type: ["integer", "null"] },
      tax_responsibilities: { type: "array", items: { type: "string" } },
      email: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      city: { type: "string" },
      department: { type: "string" },
      dane_code: { type: "string" },
      country: { type: "string" },
      segment: { type: "string" },
      credit_limit: { type: "number" },
      credit_days: { type: "integer" },
      active: { type: "boolean" },
      receivable_account_code: { type: "string" },
      payable_account_code: { type: "string" },
      withholding_rates: {
        type: "array",
        items: {
          type: "object",
          required: ["code"],
          properties: { code: { type: "string", minLength: 1 } }
        }
      },
      supplier_retention_codes: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
      role_flags: { type: "object", additionalProperties: true },
      metadata: { type: "object", additionalProperties: true }
    }
  }
};

const documentTypeMasterSchema = {
  body: {
    type: "object",
    required: ["code", "description"],
    properties: {
      code: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      active: { type: "boolean" }
    }
  }
};

const daneLocationMasterSchema = {
  body: {
    type: "object",
    required: ["dane_code", "city", "department"],
    properties: {
      dane_code: { type: "string", minLength: 1 },
      city: { type: "string", minLength: 1 },
      department: { type: "string", minLength: 1 },
      active: { type: "boolean" }
    }
  }
};

const namedMasterSchema = {
  body: {
    type: "object",
    required: ["code", "description"],
    properties: { code: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 }, days: { type: "integer", minimum: 0, maximum: 365 }, active: { type: "boolean" } }
  }
};

const organizationUnitSchema = {
  body: {
    type: "object",
    required: ["type", "code", "name"],
    properties: {
      type: { type: "string", enum: ["society", "branch", "cost_center"] },
      code: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      society_code: { type: "string" },
      branch_code: { type: "string" },
      active: { type: "boolean" }
    }
  }
};

const periodSchema = {
  body: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["open", "review", "closed"] },
      notes: { type: "string" }
    }
  }
};

const paymentSchema = {
  body: {
    type: "object",
    required: ["type", "method", "amount"],
    properties: {
      transaction_id: { type: "integer" },
      party_id: { type: "integer" },
      type: { type: "string", enum: ["income", "expense"] },
      method: { type: "string", enum: ["cash", "transfer", "card", "check", "other"] },
      amount: { type: "number", exclusiveMinimum: 0 },
      date: { type: "string" },
      reference: { type: "string" },
      notes: { type: "string" }
    }
  }
};

const accountingDocumentTypeSchema = {
  body: {
    type: "object",
    required: ["code", "description"],
    properties: {
      code: { type: "string", minLength: 1 },
      description: { type: "string", minLength: 1 },
      active: { type: "boolean" }
    }
  }
};

const accountingNumberingSchema = {
  body: {
    type: "object",
    required: ["document_type", "next_number"],
    properties: {
      document_type: { type: "string", minLength: 1 },
      prefix: { type: "string" },
      next_number: { type: "integer", minimum: 1 },
      active: { type: "boolean" }
    }
  }
};

const accountingDocumentSchema = {
  body: {
    type: "object",
    required: ["posting_date", "document_type", "society_code", "header_text", "lines"],
    properties: {
      posting_date: { type: "string", minLength: 1 },
      document_type: { type: "string", minLength: 1 },
      society_code: { type: "string", minLength: 1 },
      reference: { type: "string" },
      header_text: { type: "string", minLength: 1 },
      lines: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          required: ["account_code", "branch_code", "cost_center_code", "party_id", "movement", "amount", "description"],
          properties: {
            account_code: { type: "string", minLength: 1 },
            branch_code: { type: "string", minLength: 1 },
            cost_center_code: { type: "string", minLength: 1 },
            party_id: { type: "integer" },
            movement: { type: "string", enum: ["debit", "credit"] },
            amount: { type: "number", exclusiveMinimum: 0 },
            description: { type: "string", minLength: 1 }
          }
        }
      }
    }
  }
};

const vatMasterSchema = {
  body: {
    type: "object",
    required: ["code", "concept", "percent", "account_code"],
    properties: {
      code: { type: "string", minLength: 1 },
      concept: { type: "string", minLength: 1 },
      percent: { type: "number", minimum: 0 },
      account_code: { type: "string", minLength: 1 },
      scope: { type: "string", enum: ["sales", "purchases"] },
      active: { type: "boolean" }
    }
  }
};

const retentionMasterSchema = {
  body: {
    type: "object",
    required: ["code", "type", "concept", "percent", "minimum_base", "account_code"],
    properties: {
      code: { type: "string", minLength: 1 },
      type: { type: "string", enum: ["retefuente", "reteiva", "reteica"] },
      concept: { type: "string", minLength: 1 },
      percent: { type: "number", minimum: 0, maximum: 100 },
      minimum_base: { type: "number", minimum: 0 },
      account_code: { type: "string", minLength: 1 },
      scope: { type: "string", enum: ["sales", "purchases"] },
      active: { type: "boolean" }
    }
  }
};

const supplierRetentionsSchema = {
  body: {
    type: "object",
    required: ["retention_codes"],
    properties: {
      retention_codes: {
        type: "array",
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      }
    }
  }
};

const payableDocumentSchema = {
  body: {
    type: "object",
    required: ["document_kind", "posting_date", "supplier_reference", "header_text", "supplier_id", "society_code", "associated_account_code", "lines"],
    properties: {
      document_kind: { type: "string", enum: ["invoice", "credit_note"] },
      posting_date: { type: "string", minLength: 1 },
      due_term: { type: "string" },
      due_date: { type: "string" },
      supplier_reference: { type: "string", minLength: 1, pattern: "^[A-Za-z0-9_-]+$" },
      invoice_reference: { type: "string" },
      referenced_invoice_id: { type: "integer" },
      header_text: { type: "string", minLength: 1 },
      supplier_id: { type: "integer" },
      society_code: { type: "string", minLength: 1 },
      associated_account_code: { type: "string", minLength: 1 },
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["account_code", "branch_code", "cost_center_code", "movement", "vat_code", "description", "amount"],
          properties: {
            account_code: { type: "string", minLength: 1 },
            branch_code: { type: "string", minLength: 1 },
            cost_center_code: { type: "string", minLength: 1 },
            movement: { type: "string", enum: ["debit", "credit"] },
            vat_code: { type: "string" },
            description: { type: "string", minLength: 1 },
            amount: { type: "number", exclusiveMinimum: 0 }
          }
        }
      }
    }
  }
};

const payableApplicationSchema = {
  body: {
    type: "object",
    required: ["credit_note_id", "invoice_id", "amount"],
    properties: {
      credit_note_id: { type: "integer" },
      invoice_id: { type: "integer" },
      amount: { type: "number", exclusiveMinimum: 0 }
    }
  }
};

module.exports = {
  journalEntrySchema,
  accountSchema,
  thirdPartySchema,
  documentTypeMasterSchema,
  daneLocationMasterSchema,
  namedMasterSchema,
  organizationUnitSchema,
  periodSchema,
  paymentSchema,
  accountingDocumentTypeSchema,
  accountingNumberingSchema,
  accountingDocumentSchema,
  vatMasterSchema,
  retentionMasterSchema,
  supplierRetentionsSchema,
  payableDocumentSchema,
  payableApplicationSchema
};
