"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ModalFrame } from "@/components/ui/ModalFrame";
export { TransportSearchSelect as PurchaseSearchSelect } from "./transport/TransportSearchSelect";
export { InventoryPagination as PurchasePagination } from "./inventory-ui";
export { InventoryGuidedForm as PurchaseGuidedForm } from "./inventory-workflow";
export function PurchaseDialog({title,onClose,busy,childOpen,children}:{title:string;onClose:()=>void;busy?:boolean;childOpen?:boolean;children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key!=="Escape"||event.defaultPrevented||childOpen)return;if(event.target instanceof Element&&event.target.closest('[role="combobox"][aria-expanded="true"]'))return;const top=[...document.querySelectorAll('[role="dialog"]')].at(-1);if(top?.contains(ref.current)){event.preventDefault();event.stopPropagation();if(!busy)onClose();}};document.addEventListener("keydown",close,true);return()=>document.removeEventListener("keydown",close,true);},[busy,childOpen,onClose]);
 return <ModalFrame title={title} maxWidth="md:!max-w-6xl" onClose={()=>{if(!busy&&!childOpen)onClose();}}><div className="purchase-workspace" ref={ref}>{children}</div></ModalFrame>;
}
