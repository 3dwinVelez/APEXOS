"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

/**
 * Accesibilidad de una capa que no pasa por ModalFrame: el carrito y la vista rapida de la
 * vitrina van con la tinta del tenant, sobre su propio árbol, y aun así tienen que portarse
 * como capa. Pone el foco dentro, encierra el Tab, bloquea el scroll del fondo y devuelve el
 * foco al disparador al cerrar. Para un diálogo normal se usa ModalFrame, no este hook.
 */
export function useOverlayA11y<T extends HTMLElement>(abierto: boolean, onClose: () => void): RefObject<T | null> {
  const capa = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const desbordamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const teclas = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab" || !capa.current) return;
      const foco = [...capa.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
      if (!foco.length) return;
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
      else if (!capa.current.contains(document.activeElement)) { event.preventDefault(); primero.focus(); }
    };
    capa.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener("keydown", teclas);
      document.body.style.overflow = desbordamiento;
      anterior?.focus();
    };
  }, [abierto]);
  return capa;
}
