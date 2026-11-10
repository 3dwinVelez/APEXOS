"use client";

import { useEffect, useState } from "react";

export type WorkspaceToolId = "traceability" | "team" | "preferences" | "productivity";

const openEvent = "apex:open-workspace-tool";

export function openWorkspaceTool(id: WorkspaceToolId) {
  window.dispatchEvent(new CustomEvent<WorkspaceToolId>(openEvent, { detail: id }));
}

// Las herramientas siguen montadas en el shell para conservar presencia, recorrido,
// preferencias y captura de instalacion; la ventana solo decide que se muestra.
export function useWorkspaceToolWindow(id: WorkspaceToolId) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = (event: Event) => setOpen((event as CustomEvent<WorkspaceToolId>).detail === id);
    window.addEventListener(openEvent, onOpen);
    return () => window.removeEventListener(openEvent, onOpen);
  }, [id]);
  return { open, close: () => setOpen(false) };
}
