"use client";

import { useEffect, useState, type FocusEvent, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function ZeroFriendlyNumberInput({ value, onValueChange, onFocus, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(String(Number.isFinite(value) ? value : 0));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(Number.isFinite(value) ? value : 0));
  }, [focused, value]);

  function focus(event: FocusEvent<HTMLInputElement>) {
    setFocused(true);
    if (Number(event.currentTarget.value) === 0) event.currentTarget.select();
    onFocus?.(event);
  }

  function blur(event: FocusEvent<HTMLInputElement>) {
    const next = event.currentTarget.value.trim() === "" ? 0 : Number(event.currentTarget.value);
    const normalized = Number.isFinite(next) ? next : 0;
    setFocused(false);
    setDraft(String(normalized));
    onValueChange(normalized);
    onBlur?.(event);
  }

  return <input {...props} type="number" value={draft} onFocus={focus} onBlur={blur} onChange={(event) => {
    const raw = event.target.value;
    setDraft(raw);
    onValueChange(raw === "" ? 0 : Number(raw));
  }} />;
}
