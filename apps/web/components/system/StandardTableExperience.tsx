"use client";

import { useEffect } from "react";

const ENHANCED = "data-apex-standard-table";

function isOperationalList(table: HTMLTableElement) {
  if (table.closest('[aria-label="Tabla de datos"]')) return false;
  if (table.closest("dialog,[role=dialog],form")) return false;
  if (table.dataset.tableLayout === "detail" || table.dataset.tableLayout === "editor") return false;
  return Boolean(table.tHead?.rows[0]?.cells.length && table.tBodies[0]);
}

function enhance(table: HTMLTableElement) {
  if (table.hasAttribute(ENHANCED) || !isOperationalList(table)) return;
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  if (headers.length < 2) return;

  table.setAttribute(ENHANCED, "true");
  table.classList.add("apex-standard-table");
  const viewport = table.parentElement;
  if (!viewport) return;
  viewport.classList.add("apex-standard-table-viewport");

  const toolbar = document.createElement("div");
  toolbar.className = "apex-standard-table-toolbar";
  toolbar.dataset.apexTableToolbar = "true";

  const summary = document.createElement("p");
  summary.className = "apex-standard-table-summary";
  summary.setAttribute("aria-live", "polite");

  const columns = document.createElement("details");
  columns.className = "apex-standard-table-columns";
  const trigger = document.createElement("summary");
  trigger.textContent = "▥  Columnas";
  trigger.setAttribute("aria-label", "Configurar columnas de la tabla");
  columns.append(trigger);

  const menu = document.createElement("div");
  menu.className = "apex-standard-table-columns-menu";
  const storageKey = `apex_standard_columns:${location.pathname}:${Array.from(headers).map((header) => header.textContent?.trim()).join("|")}`;
  let visible = headers.map((_, index) => index);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(saved) && saved.length) visible = saved.filter((index) => Number.isInteger(index) && index < headers.length);
  } catch { /* Conservar todas las columnas. */ }

  const applyColumns = () => {
    Array.from(table.rows).forEach((row) => Array.from(row.cells).forEach((cell, index) => {
      cell.toggleAttribute("hidden", !visible.includes(index));
    }));
  };

  headers.forEach((header, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = visible.includes(index);
    input.addEventListener("change", () => {
      if (!input.checked && visible.length === 1) {
        input.checked = true;
        return;
      }
      visible = input.checked ? [...visible, index] : visible.filter((item) => item !== index);
      visible.sort((left, right) => left - right);
      localStorage.setItem(storageKey, JSON.stringify(visible));
      applyColumns();
    });
    label.append(input, document.createTextNode(header.textContent?.trim() || `Columna ${index + 1}`));
    menu.append(label);
  });
  columns.append(menu);
  toolbar.append(summary, columns);
  viewport.before(toolbar);

  const refresh = () => {
    const rows = table.tBodies[0]?.rows.length || 0;
    const selected = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
    summary.textContent = `${rows} registros${table.querySelector('tbody input[type="checkbox"]') ? ` · ${selected} seleccionados` : ""}`;
    applyColumns();
  };
  table.addEventListener("change", refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(table, { childList: true, subtree: true });
  refresh();
  return () => {
    observer.disconnect();
    table.removeEventListener("change", refresh);
    toolbar.remove();
  };
}

export function StandardTableExperience() {
  useEffect(() => {
    const cleanups = new Map<HTMLTableElement, () => void>();
    const scan = () => {
      cleanups.forEach((cleanup, table) => {
        if (!table.isConnected) {
          cleanup();
          cleanups.delete(table);
        }
      });
      document.querySelectorAll<HTMLTableElement>("#apex-main-content table").forEach((table) => {
        if (cleanups.has(table)) return;
        const cleanup = enhance(table);
        if (cleanup) cleanups.set(table, cleanup);
      });
    };
    scan();
    const observer = new MutationObserver(scan);
    const root = document.getElementById("apex-main-content");
    if (root) observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    };
  }, []);
  return null;
}
